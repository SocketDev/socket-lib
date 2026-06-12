/**
 * @file Locked-down spawn for AI agent CLIs (Claude / Codex / Gemini /
 *   OpenCode). Per the CLAUDE.md "Programmatic Claude calls" rule: every
 *   headless invocation MUST set the four lockdown flags (tools / disallow /
 *   permissionMode / no-session-persistence). The helper enforces this at the
 *   type level (`SpawnAiAgentOptions` requires the relevant fields) AND at the
 *   spawn site (per-agent flag translator). Why CLI subprocess instead of an
 *   SDK call: the fleet's contract matches what the local user sees when
 *   invoking the CLI — same auth config, same model availability, same tool
 *   permissions. SDK calls would diverge on auth handling and force per-agent
 *   SDK installs. Retry: 3 attempts on overload (HTTP 529 / "Overloaded"), exp.
 *   backoff (5s / 15s / 45s). Each retry is a fresh subprocess.
 */

import { errorMessage } from '../errors/message'
import { ObjectKeys } from '../primordials/object'
import { spawn } from '../process/spawn/child'
import { isSpawnError } from '../process/spawn/errors'

import { discoverAiAgents } from './discover.mts'

import { DateNow } from '../primordials/date'

import { ErrorCtor } from '../primordials/error'

import { PromiseCtor } from '../primordials/promise'

import type {
  AgentSpawnResult,
  AiAgentName,
  SpawnAiAgentOptions,
} from './types.mts'

const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 5000

export function backoffFor(attempt: number): number {
  return BACKOFF_BASE_MS * 3 ** (attempt - 1)
}

/**
 * Build CLI arg list for a given agent. The flag names differ across agents but
 * the conceptual surface is the same: "here are the allowed tools, here are the
 * denied tools, here is the permission mode, do not persist a session." This
 * translator is the single source of truth for how each agent's flags map.
 *
 * Update sites (when an agent changes its flag surface): 1. The relevant case
 * below. 2. The agent's docs link (cited inline).
 */
export function buildArgs(
  agent: AiAgentName,
  options: SpawnAiAgentOptions,
): string[] {
  options = { __proto__: null, ...options } as typeof options
  const allAllowed = [...options.tools, ...(options.allow ?? [])]

  switch (agent) {
    case 'claude': {
      // https://code.claude.com/docs/en/cli-reference
      const args: string[] = [
        '--print',
        '--no-session-persistence',
        '--permission-mode',
        options.permissionMode,
        '--add-dir',
        options.cwd,
      ]
      for (const dir of options.addDirs ?? []) {
        args.push('--add-dir', dir)
      }
      if (options.model) {
        args.push('--model', options.model)
      }
      // Fable / Mythos are adaptive-thinking-only; the effort dial does not
      // apply, so omit `--effort` for them rather than pass a level they ignore.
      if (options.effort && !isAdaptiveOnlyModel(options.model ?? '')) {
        args.push('--effort', options.effort)
      }
      if (allAllowed.length > 0) {
        args.push('--allowedTools', ...allAllowed)
      }
      if (options.disallow.length > 0) {
        args.push('--disallowedTools', ...options.disallow)
      }
      if (options.extraArgs) {
        args.push(...options.extraArgs)
      }
      return args
    }
    case 'codex': {
      // Codex CLI uses --tools / --disallow-tools, no --permission-mode
      // (it has a separate --read-only flag instead). Plan-mode maps
      // to --read-only; acceptEdits and dontAsk both run normally.
      const args: string[] = ['--print']
      if (options.permissionMode === 'plan') {
        args.push('--read-only')
      }
      if (options.model) {
        args.push('--model', options.model)
      }
      if (options.effort) {
        // Codex takes reasoning effort as a `-c` config override, not a
        // flag. Its vocab tops out at xhigh (no `max`), so clamp the shared
        // AiEffort `max` down to xhigh — codex's ceiling.
        const codexEffort = options.effort === 'max' ? 'xhigh' : options.effort
        args.push('-c', `model_reasoning_effort=${codexEffort}`)
      }
      if (allAllowed.length > 0) {
        args.push('--tools', allAllowed.join(','))
      }
      if (options.disallow.length > 0) {
        args.push('--disallow-tools', options.disallow.join(','))
      }
      args.push('--cwd', options.cwd)
      if (options.extraArgs) {
        args.push(...options.extraArgs)
      }
      return args
    }
    case 'gemini': {
      // Gemini CLI: --no-interactive for headless, --workspace for cwd.
      const args: string[] = ['--no-interactive', '--workspace', options.cwd]
      if (options.model) {
        args.push('--model', options.model)
      }
      if (allAllowed.length > 0) {
        args.push('--allowed-tools', allAllowed.join(','))
      }
      if (options.disallow.length > 0) {
        args.push('--denied-tools', options.disallow.join(','))
      }
      if (options.permissionMode === 'plan') {
        args.push('--read-only')
      }
      if (options.extraArgs) {
        args.push(...options.extraArgs)
      }
      return args
    }
    case 'opencode': {
      // OpenCode CLI: --print, --tools, --no-tools.
      const args: string[] = ['--print', '--cwd', options.cwd]
      if (options.model) {
        args.push('--model', options.model)
      }
      if (allAllowed.length > 0) {
        args.push('--tools', allAllowed.join(','))
      }
      if (options.disallow.length > 0) {
        args.push('--no-tools', options.disallow.join(','))
      }
      if (options.extraArgs) {
        args.push(...options.extraArgs)
      }
      return args
    }
  }
}

/**
 * Fable and Mythos run adaptive thinking only — thinking is always on and there
 * is no manual thinking-budget knob. The effort dial does not apply the way it
 * does on Opus, so the spawn layer drops `--effort` for these models rather
 * than passing a level they should ignore. Matches both alias and full-id
 * shapes (`fable`, `claude-fable-5`, `mythos`, `claude-mythos-5`).
 */
export function isAdaptiveOnlyModel(model: string): boolean {
  return (
    /\b(?:fable|mythos)\b/i.test(model) ||
    /claude-(?:fable|mythos)/i.test(model)
  )
}

export function isOverloaded(stdout: string, stderr: string): boolean {
  const re = /API Error: 529|Overloaded/i
  return re.test(stdout) || re.test(stderr)
}

export async function pickAgent(
  requested: AiAgentName | undefined,
  cwd: string,
): Promise<AiAgentName> {
  const discovered = await discoverAiAgents({ repoRoot: cwd })
  if (requested) {
    if (!(requested in discovered)) {
      throw new ErrorCtor(
        `spawnAiAgent: requested agent "${requested}" is not on PATH. Install the CLI or pass a different agent. Discovered: ${ObjectKeys(discovered).join(', ') || '(none)'}`,
      )
    }
    return requested
  }
  // Default to claude when present.
  if ('claude' in discovered) {
    return 'claude'
  }
  // Otherwise, fall back to whichever agent is available, in
  // preference order: codex → opencode → gemini.
  for (const candidate of ['codex', 'opencode', 'gemini'] as const) {
    if (candidate in discovered) {
      return candidate
    }
  }
  throw new ErrorCtor(
    'spawnAiAgent: no AI agent CLI on PATH. Install one of: claude, codex, opencode, gemini.',
  )
}

/**
 * Spawn an AI agent CLI subprocess with the locked-down flag set.
 *
 * @example
 *   ```ts
 *   import { AI_PROFILE } from '@socketsecurity/lib/ai/profiles'
 *   import { spawnAiAgent } from '@socketsecurity/lib/ai/spawn'
 *
 *   const result = await spawnAiAgent({
 *   ...AI_PROFILE.edit,
 *   prompt: 'Fix the lint findings in src/foo.ts',
 *   cwd: process.cwd(),
 *   model: 'claude-sonnet-4-6',
 *   timeoutMs: 5 * 60 * 1000,
 *   })
 *   if (result.exitCode !== 0) { ... }
 *   ```
 *
 *   Throws when the requested agent isn't on PATH (or, when no agent
 *   is requested, when none of the known agents are on PATH).
 */
export async function spawnAiAgent(
  options: SpawnAiAgentOptions,
): Promise<AgentSpawnResult> {
  options = { __proto__: null, ...options } as typeof options
  const agent = await pickAgent(options.agent, options.cwd)
  const args = buildArgs(agent, options)

  let stdout = ''
  let stderr = ''
  let exitCode = 0
  let attempts = 0
  const start = DateNow()

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1
    stdout = ''
    stderr = ''
    exitCode = 0

    try {
      const child = spawn(agent, args, {
        cwd: options.cwd,
        stdio: 'pipe',
        stdioString: true,
        timeout: options.timeoutMs,
      })
      // `.stdin` is a typed convenience accessor on the fleet
      // PromiseSpawnResult (`Promise<…> & { process; stdin }`); `await child`
      // resolves the result, so the wrapper is kept rather than destructured.
      // socket-lint: allow bare-spawn-access
      child.stdin?.end(options.prompt)
      const result = await child
      stdout = String(result.stdout ?? '')
      stderr = String(result.stderr ?? '')
      exitCode = result.code ?? 0
    } catch (e) {
      if (isSpawnError(e)) {
        stdout = String(e.stdout ?? '')
        stderr = String(e.stderr ?? '')
        exitCode = e.code ?? 1
      } else {
        stderr = errorMessage(e)
        exitCode = 1
      }
    }

    if (!isOverloaded(stdout, stderr) || attempts >= MAX_ATTEMPTS) {
      break
    }
    await new PromiseCtor(resolve => setTimeout(resolve, backoffFor(attempts)))
  }

  // `overloaded` is true only when the LAST attempt was still an overload —
  // i.e. retries were exhausted on 529, not a real failure. A run that
  // recovered on a retry exits with the recovered result and overloaded=false.
  return {
    attempts,
    durationMs: DateNow() - start,
    exitCode,
    overloaded: isOverloaded(stdout, stderr),
    stderr,
    stdout,
  }
}
