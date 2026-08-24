/**
 * @file The failure policy a machine-global agent hook dispatcher applies when
 *   a hook's own runtime cannot load, as distinct from a hook that loaded and
 *   returned a verdict.
 *   Those are not the same event, and conflating them is what this module
 *   exists to prevent. A hook that ran and objected made a judgment. A hook
 *   that could not be imported made none, so treating its silence as an
 *   objection blocks an action no rule was ever applied to.
 *   Blocking anyway is still right in one case: a package manager mid-install
 *   has briefly purged the dependency tree, so the very next attempt runs the
 *   real check. It is wrong in the other: a checkout with no installed
 *   dependencies never had a runtime, and no retry produces one. A dispatcher
 *   registered at the USER level then refuses every tool call in every session
 *   on the machine — including the commands that would repair the checkout — a
 *   deadlock nothing inside the session can break, protecting nothing, because
 *   no guard evaluated anything.
 *   So the discriminator is whether an install exists to be mid-flight at all.
 *   Facts in, verdict out. Deliberately free of every other module here: a
 *   dispatcher installed outside a repo has no `node_modules` to resolve from
 *   and must mirror this policy on builtins alone, which it can only do while
 *   the policy stays self-contained.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Suffix marking a hook whose purpose is enforcement rather than advice.
 */
const GUARD_SUFFIX = '-guard'

// Spelled out rather than imported from `../constants/*` so the whole module
// stays mirrorable into a dispatcher that resolves nothing.
const NODE_MODULES_DIRNAME = 'node_modules'

const DEFAULT_REPAIR_COMMAND = 'pnpm install'

/**
 * What the dispatcher knows about the checkout it tried to run a hook from.
 */
export interface HookRuntimeFacts {
  readonly depsInstalled: boolean
}

/**
 * Probe `repoDir` for the one fact the policy turns on. Takes an injected
 * `exists` so the decision table can be exercised without a filesystem.
 */
export function hookRuntimeFacts(
  repoDir: string,
  exists: (filepath: string) => boolean = existsSync,
): HookRuntimeFacts {
  return { depsInstalled: exists(path.join(repoDir, NODE_MODULES_DIRNAME)) }
}

/**
 * A hook whose runtime failed to load, and the context needed to say why.
 */
export interface HookRuntimeFailure {
  /**
   * Short cause — an error CODE or missing specifier, never a stack.
   */
  readonly cause: string
  readonly hookName: string
  /**
   * Checkout the runtime was resolved from, named in the message.
   */
  readonly repoDir: string
  /**
   * Command that restores enforcement, quoted in the fail-open message.
   */
  readonly repairCommand?: string | undefined
  readonly runtime: HookRuntimeFacts
}

export interface HookRuntimeVerdict {
  readonly block: boolean
  readonly message: string
}

/**
 * Decide whether a hook whose runtime could not load blocks the action.
 *
 * Blocks only when the failure is plausibly a purge window: an enforcing hook
 * whose checkout HAS an install, where retrying runs the real check. An
 * enforcing hook whose checkout has no install fails OPEN and says so — the
 * message states plainly that enforcement is off and names the command that
 * turns it back on, because a warning a reader can act on is worth more than a
 * block that also blocks the repair.
 */
export function hookRuntimeVerdict(
  config: HookRuntimeFailure,
): HookRuntimeVerdict {
  const opts = { __proto__: null, ...config } as typeof config
  const { cause, hookName, repoDir } = opts
  if (!isEnforcingHook(hookName)) {
    return {
      block: false,
      message:
        `${hookName} skipped (${cause}) — advisory hook, so a runtime that ` +
        'cannot load does not withhold anything.',
    }
  }
  if (opts.runtime.depsInstalled) {
    return {
      block: true,
      message:
        `${hookName} could not run (${cause}) — failing CLOSED: ${repoDir} ` +
        'looks mid-install. Retry the command in a moment.',
    }
  }
  const repair = opts.repairCommand || DEFAULT_REPAIR_COMMAND
  return {
    block: false,
    message:
      `${hookName} could not run (${cause}) — ${repoDir} has no installed ` +
      'dependencies, so no guard has evaluated this command and no retry ' +
      'will change that. Failing OPEN: blocking every session on this ' +
      'machine would protect nothing and would block the repair too. Run ' +
      `\`${repair}\` in ${repoDir} to restore enforcement.`,
  }
}

/**
 * Whether `hookName` enforces a rule. Only an enforcing hook has a reason to
 * fail closed; advisory hooks — reminders, nudges, sweepers — never do, because
 * an advisory that cannot speak has nothing to withhold.
 */
export function isEnforcingHook(hookName: string): boolean {
  return hookName.endsWith(GUARD_SUFFIX)
}
