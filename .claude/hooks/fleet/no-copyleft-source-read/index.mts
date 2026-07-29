#!/usr/bin/env node
// Claude Code PreToolUse hook — no-copyleft-source-read.
//
// BLOCKS every route an agent has to the IMPLEMENTATION of a copyleft upstream.
// A copyleft project may be RUN as a tool and OBSERVED through its own tests —
// behavior is not implementation — but reading, copying, or deriving from its
// source makes the consuming package a derivative work and forces the
// upstream's license onto it. The roster, the tests allowlist, and the matcher
// all live in `_shared/copyleft-upstreams.mts`, which the commit-time belt
// `copyleft-slices-are-tests-only.mts` shares, so guard and gate cannot drift.
//
// Routes blocked:
//   - Read of an `upstream/<repo>/…` path off the tests allowlist.
//   - Grep / Glob whose search SCOPE lands inside a copyleft submodule but is
//     not confined to its tests slice — a grep at the submodule root reads the
//     whole implementation even though no implementation path is typed.
//   - Bash `gh api repos/<owner>/<repo>/contents/<path>` for a non-test path.
//   - Bash `curl` / `wget` against `raw.githubusercontent.com`, a
//     `github.com/<o>/<r>/{blob,raw}` file view, or a whole-tree archive from
//     `codeload.github.com` / `/archive` / `/tarball` / `/zipball`.
//   - Bash `git show` / `git cat-file` / `git archive` reading a non-test blob
//     out of a copyleft submodule, whether reached by `git -C <dir>`, a leading
//     `cd`, or an `upstream/<repo>/…` path in the revision argument.
//   - Bash `git sparse-checkout set|add|disable|reapply` that would WIDEN a
//     copyleft submodule's cone past its tests allowlist. This is the route
//     that matters most: widening the cone materializes the implementation on
//     disk, after which every later read looks like an ordinary local file.
//   - WebFetch of the same URLs. WebSearch carries a query, not a fetchable
//     URL, so there is nothing for this guard to match on it; the URL its
//     results lead to arrives as a WebFetch and is gated there.
//
// Fails open on parse errors — a guard bug must never wedge a session.
//
// Convention: docs/agents.md/fleet/copyleft-boundaries.md.
// Bypass: `Allow copyleft-source-read bypass`.

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import {
  copyleftSparseRecipe,
  detectCopyleftImplementationRead,
  detectCopyleftScopeRead,
  detectCopyleftUrlRead,
  findCopyleftUpstreamByRepo,
  isCopyleftObservablePath,
  isCopyleftSparsePatternAllowed,
} from '../_shared/copyleft-upstreams.mts'
import { bashGuard, block, defineHook, runHook } from '../_shared/guard.mts'
import { commandsFor, commandWorkingDir } from '../_shared/shell-command.mts'

import type {
  CopyleftReadFinding,
  CopyleftUpstream,
} from '../_shared/copyleft-upstreams.mts'
import type { GuardResult } from '../_shared/guard.mts'
import type { ToolCallPayload } from '../_shared/payload.mts'

// Pre-flight keywords the dispatcher tests against the raw payload before
// importing this hook. Every route names its upstream — the submodule dir, the
// URL, the gh-api slug all carry the repo name — so the roster's repo names
// plus the `upstream/` prefix cover the surface. The literal array is
// load-bearing: gen/hook-dispatch.mts parses these tokens STATICALLY out of the
// source, so a computed list would read as no triggers at all. A test asserts
// every roster entry's repo name appears here.
export const triggers: readonly string[] = ['trufflehog', 'upstream/']

// git subcommands that stream a blob or a tree out of a repository.
const GIT_READ_SUBCOMMANDS = new Set(['archive', 'cat-file', 'show'])
// git sparse-checkout operations that can widen a cone.
const GIT_SPARSE_WIDENING = new Set(['add', 'disable', 'reapply', 'set'])
// Fetchers whose arguments are URLs.
const URL_FETCHERS: readonly string[] = ['curl', 'wget']

/**
 * A blocked copyleft read: the finding plus the human label for HOW it was
 * reached, which becomes the message's Where line.
 */
export interface CopyleftBlock {
  readonly finding: CopyleftReadFinding
  readonly how: string
}

// The copyleft upstream a directory sits inside, or undefined. Used for the
// git routes, where the submodule is named by `-C`/`cd` rather than by the
// path argument.
function copyleftUpstreamForDir(dir: string): CopyleftUpstream | undefined {
  const normalized = normalizePath(dir).replace(/\/+$/, '')
  // `(?:^|\/)upstream\/` anchors the segment so `my-upstream/` cannot match;
  // `([^/]+)` is the submodule directory name.
  const match = /(?:^|\/)upstream\/([^/]+)(?:\/|$)/.exec(normalized)
  return match ? findCopyleftUpstreamByRepo(match[1]!) : undefined
}

// The blob path inside a `git show`/`git cat-file` revision argument. Both
// accept `<rev>:<path>`; a bare `<rev>` names no path.
function blobPathInRevision(arg: string): string | undefined {
  const colon = arg.indexOf(':')
  return colon === -1 ? undefined : arg.slice(colon + 1)
}

// Pre-subcommand git flags that CONSUME the next token. Their value is a bare
// token, so a naive non-flag filter would read `git -C <dir> show` as the
// subcommand `<dir>` and miss the read entirely.
const GIT_FLAGS_WITH_VALUE = new Set(['--git-dir', '--work-tree', '-C', '-c'])

// The bare, non-flag tokens of a parsed git command's argument list, with the
// values of value-taking global flags removed so `bare[0]` is the subcommand.
function bareArgs(args: readonly string[]): string[] {
  const bare: string[] = []
  for (let i = 0, { length } = args; i < length; i += 1) {
    const arg = args[i]!
    if (GIT_FLAGS_WITH_VALUE.has(arg)) {
      i += 1
      continue
    }
    if (!arg.startsWith('-')) {
      bare.push(arg)
    }
  }
  return bare
}

/**
 * Detect a `git show` / `git cat-file` / `git archive` that would stream a
 * copyleft implementation. The submodule is resolved from the command's
 * effective working directory first — `git -C upstream/<repo>` and a leading
 * `cd` both land there — and otherwise from an `upstream/<repo>/…` path typed
 * into the arguments themselves.
 */
export function detectCopyleftGitRead(
  command: string,
): CopyleftBlock | undefined {
  const cwdUpstream = copyleftUpstreamForDir(commandWorkingDir(command))
  const gitCmds = commandsFor(command, 'git')
  for (let i = 0, { length } = gitCmds; i < length; i += 1) {
    const bare = bareArgs(gitCmds[i]!.args)
    const sub = bare[0]
    if (!sub || !GIT_READ_SUBCOMMANDS.has(sub)) {
      continue
    }
    // `git archive` streams the whole tree; no revision path narrows it enough
    // to be observable, so any copyleft target is a block.
    if (sub === 'archive' && cwdUpstream) {
      return {
        finding: { path: '', route: 'submodule-path', upstream: cwdUpstream },
        how: 'a `git archive` of the whole tree',
      }
    }
    for (let j = 1, { length: blen } = bare; j < blen; j += 1) {
      const arg = bare[j]!
      // An `upstream/<repo>/…` path typed directly into the arguments.
      const direct = detectCopyleftImplementationRead(arg)
      if (direct) {
        return { finding: direct, how: `a \`git ${sub}\`` }
      }
      const blobPath = blobPathInRevision(arg)
      if (
        cwdUpstream &&
        blobPath !== undefined &&
        !isCopyleftObservablePath(cwdUpstream, blobPath)
      ) {
        return {
          finding: {
            path: blobPath,
            route: 'submodule-path',
            upstream: cwdUpstream,
          },
          how: `a \`git ${sub}\` of a tracked blob`,
        }
      }
    }
  }
  return undefined
}

// The copyleft upstream named by any bare token of a sparse-checkout command,
// for the `git sparse-checkout … upstream/<repo>` spelling that does not go
// through `-C` or a leading `cd`.
function sparseTargetInArgs(
  bare: readonly string[],
): CopyleftUpstream | undefined {
  for (let i = 2, { length } = bare; i < length; i += 1) {
    const hit = copyleftUpstreamForDir(bare[i]!)
    if (hit) {
      return hit
    }
  }
  return undefined
}

/**
 * Detect a `git sparse-checkout` operation that would widen a copyleft
 * submodule's cone past its tests allowlist. `disable` and `reapply` are
 * blocked outright: `disable` restores the FULL tree by definition, and
 * `reapply` re-materializes whatever the on-disk cone config currently says —
 * which the guard cannot prove is still the tests slice. Re-establishing the
 * sanctioned cone with an explicit `set` is the allowed path, and it is exactly
 * the command the Fix line hands back.
 */
export function detectCopyleftSparseWiden(
  command: string,
): CopyleftBlock | undefined {
  const cwdUpstream = copyleftUpstreamForDir(commandWorkingDir(command))
  const gitCmds = commandsFor(command, 'git')
  for (let i = 0, { length } = gitCmds; i < length; i += 1) {
    const bare = bareArgs(gitCmds[i]!.args)
    if (bare[0] !== 'sparse-checkout') {
      continue
    }
    const op = bare[1]
    if (!op || !GIT_SPARSE_WIDENING.has(op)) {
      continue
    }
    const target = cwdUpstream ?? sparseTargetInArgs(bare)
    if (!target) {
      continue
    }
    if (op === 'disable' || op === 'reapply') {
      return {
        finding: { path: '', route: 'sparse-widen', upstream: target },
        how: `a \`git sparse-checkout ${op}\``,
      }
    }
    for (let j = 2, { length: blen } = bare; j < blen; j += 1) {
      if (!isCopyleftSparsePatternAllowed(target, bare[j]!)) {
        return {
          finding: { path: bare[j]!, route: 'sparse-widen', upstream: target },
          how: `a \`git sparse-checkout ${op}\` pattern`,
        }
      }
    }
  }
  return undefined
}

/**
 * Detect a Bash network read of a copyleft implementation: a `gh api
 * repos/<o>/<r>/contents/<path>` call, or a `curl`/`wget` against a raw blob,
 * a `github.com` file view, or a whole-tree archive.
 */
export function detectCopyleftNetworkRead(
  command: string,
): CopyleftBlock | undefined {
  const ghCmds = commandsFor(command, 'gh')
  for (let i = 0, { length } = ghCmds; i < length; i += 1) {
    const { args } = ghCmds[i]!
    if (args[0] !== 'api') {
      continue
    }
    for (let j = 1, { length: alen } = args; j < alen; j += 1) {
      const finding = detectCopyleftUrlRead(args[j]!)
      if (finding) {
        return { finding, how: 'a `gh api` contents read' }
      }
    }
  }
  for (let i = 0, { length } = URL_FETCHERS; i < length; i += 1) {
    const fetcher = URL_FETCHERS[i]!
    const cmds = commandsFor(command, fetcher)
    for (let j = 0, { length: clen } = cmds; j < clen; j += 1) {
      const { args } = cmds[j]!
      for (let k = 0, { length: alen } = args; k < alen; k += 1) {
        const finding = detectCopyleftUrlRead(args[k]!)
        if (finding) {
          return { finding, how: `a \`${fetcher}\` download` }
        }
      }
    }
  }
  return undefined
}

/**
 * The full Bash surface: network fetch, git blob/tree read, sparse-cone widen.
 */
export function detectCopyleftBashRead(
  command: string,
): CopyleftBlock | undefined {
  return (
    detectCopyleftNetworkRead(command) ??
    detectCopyleftSparseWiden(command) ??
    detectCopyleftGitRead(command)
  )
}

/**
 * The block message: What / Where / Saw vs. wanted / Fix, naming the SPDX id,
 * the tests-only rule, and the permissive alternative when one is recorded.
 */
export function formatCopyleftBlock(detection: CopyleftBlock): string {
  const { finding, how } = detection
  const { upstream } = finding
  const slug = `${upstream.owner}/${upstream.repo}`
  const where =
    finding.path === ''
      ? `  Where: ${how} covering the whole \`${slug}\` tree.`
      : `  Where: ${how} targeting \`${finding.path}\` in \`${slug}\`.`
  const lines = [
    `[no-copyleft-source-read] Blocked: reading ${slug} implementation, ${upstream.spdx}.`,
    '',
    `  What:  ${slug} is ${upstream.spdx} copyleft. Reading, copying, or`,
    '         deriving from its implementation makes the consuming package a',
    '         derivative work and forces that license onto it.',
    where,
    '  Wanted: run it as a tool and observe it through its OWN tests —',
    `         ${upstream.testPathPatterns.join(', ')} — and nothing else.`,
    '  Fix:   derive from a permissively licensed source instead, and keep the',
    '         submodule cone tests-only:',
    `           ${copyleftSparseRecipe(upstream)}`,
  ]
  if (upstream.permissiveAlternative) {
    lines.push(
      `         Recorded permissive alternative: ${upstream.permissiveAlternative}.`,
    )
  }
  lines.push('         See docs/agents.md/fleet/copyleft-boundaries.md.')
  return `${lines.join('\n')}\n`
}

// Read narrows to one file; Grep/Glob narrow to a scope, so the scope matcher
// runs for them.
function checkReadTools(payload: ToolCallPayload): GuardResult {
  const tool = payload?.tool_name
  const input = payload?.tool_input
  if (tool === 'Read') {
    const filePath = typeof input?.file_path === 'string' ? input.file_path : ''
    const finding = detectCopyleftImplementationRead(filePath)
    return finding
      ? block(formatCopyleftBlock({ finding, how: 'a Read' }))
      : undefined
  }
  if (tool !== 'Glob' && tool !== 'Grep') {
    return undefined
  }
  const searchPath = typeof input?.path === 'string' ? input.path : undefined
  if (searchPath) {
    const finding = detectCopyleftScopeRead(searchPath)
    if (finding) {
      return block(formatCopyleftBlock({ finding, how: `a ${tool} scope` }))
    }
  }
  // Only Glob's `pattern` names paths. Grep's `pattern` is a content regex, and
  // scanning it would block a search for the literal text of an upstream path.
  if (tool === 'Glob' && typeof input?.pattern === 'string') {
    const finding = detectCopyleftScopeRead(input.pattern)
    if (finding) {
      return block(formatCopyleftBlock({ finding, how: 'a Glob pattern' }))
    }
  }
  return undefined
}

function checkWebFetch(payload: ToolCallPayload): GuardResult {
  if (payload?.tool_name !== 'WebFetch') {
    return undefined
  }
  const url = payload?.tool_input?.url
  if (typeof url !== 'string') {
    return undefined
  }
  const finding = detectCopyleftUrlRead(url)
  return finding
    ? block(formatCopyleftBlock({ finding, how: 'a WebFetch' }))
    : undefined
}

const bashCheck = bashGuard(command => {
  const detection = detectCopyleftBashRead(command)
  return detection ? block(formatCopyleftBlock(detection)) : undefined
})

export async function check(payload: ToolCallPayload): Promise<GuardResult> {
  return (
    checkReadTools(payload) ??
    checkWebFetch(payload) ??
    (await bashCheck(payload))
  )
}

export const hook = defineHook({
  bypass: ['copyleft-source-read'],
  check,
  event: 'PreToolUse',
  matcher: ['Bash', 'Glob', 'Grep', 'Read', 'WebFetch'],
  triggers,
  type: 'guard',
})
void runHook(hook, import.meta.url)
