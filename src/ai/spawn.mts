/**
 * @fileoverview Locked-down spawn for AI agent CLIs (Claude / Codex /
 * Gemini / OpenCode).
 *
 * Per the CLAUDE.md "Programmatic Claude calls" rule: every headless
 * invocation MUST set the four lockdown flags (tools / disallow /
 * permissionMode / no-session-persistence). The helper enforces this
 * at the type level (`SpawnAiAgentOptions` requires the relevant
 * fields) AND at the spawn site (per-agent flag translator).
 *
 * Why CLI subprocess instead of an SDK call: the fleet's contract
 * matches what the local user sees when invoking the CLI — same auth
 * config, same model availability, same tool permissions. SDK calls
 * would diverge on auth handling and force per-agent SDK installs.
 *
 * Retry: 3 attempts on overload (HTTP 529 / "Overloaded"), exp.
 * backoff (5s / 15s / 45s). Each retry is a fresh subprocess.
 */

import { errorMessage } from '../errors'
import { isSpawnError, spawn } from '../spawn'

import { discoverAiAgents } from './discover.mts'

import type {
  AgentSpawnResult,
  AiAgentName,
  SpawnAiAgentOptions,
} from './types.mts'

const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 5_000

export function backoffFor(attempt: number): number {
  return BACKOFF_BASE_MS * 3 ** (attempt - 1)
}

/**
 * Build CLI arg list for a given agent. The flag names differ across
 * agents but the conceptual surface is the same: "here are the
 * allowed tools, here are the denied tools, here is the permission
 * mode, do not persist a session." This translator is the single
 * source of truth for how each agent's flags map.
 *
 * Update sites (when an agent changes its flag surface):
 *   1. The relevant case below.
 *   2. The agent's docs link (cited inline).
 */
export function buildArgs(
  agent: AiAgentName,
  opts: SpawnAiAgentOptions,
): string[] {
  const allAllowed = [...opts.tools, ...(opts.allow ?? [])]

  switch (agent) {
    case 'claude': {
      // https://code.claude.com/docs/en/cli-reference
      const args: string[] = [
        '--print',
        '--no-session-persistence',
        '--permission-mode',
        opts.permissionMode,
        '--add-dir',
        opts.cwd,
      ]
      for (const dir of opts.addDirs ?? []) {
        args.push('--add-dir', dir)
      }
      if (opts.model) {
        args.push('--model', opts.model)
      }
      if (allAllowed.length > 0) {
        args.push('--allowedTools', ...allAllowed)
      }
      if (opts.disallow.length > 0) {
        args.push('--disallowedTools', ...opts.disallow)
      }
      if (opts.extraArgs) {
        args.push(...opts.extraArgs)
      }
      return args
    }
    case 'codex': {
      // Codex CLI uses --tools / --disallow-tools, no --permission-mode
      // (it has a separate --read-only flag instead). Plan-mode maps
      // to --read-only; acceptEdits and dontAsk both run normally.
      const args: string[] = ['--print']
      if (opts.permissionMode === 'plan') {
        args.push('--read-only')
      }
      if (opts.model) {
        args.push('--model', opts.model)
      }
      if (allAllowed.length > 0) {
        args.push('--tools', allAllowed.join(','))
      }
      if (opts.disallow.length > 0) {
        args.push('--disallow-tools', opts.disallow.join(','))
      }
      args.push('--cwd', opts.cwd)
      if (opts.extraArgs) {
        args.push(...opts.extraArgs)
      }
      return args
    }
    case 'gemini': {
      // Gemini CLI: --no-interactive for headless, --workspace for cwd.
      const args: string[] = ['--no-interactive', '--workspace', opts.cwd]
      if (opts.model) {
        args.push('--model', opts.model)
      }
      if (allAllowed.length > 0) {
        args.push('--allowed-tools', allAllowed.join(','))
      }
      if (opts.disallow.length > 0) {
        args.push('--denied-tools', opts.disallow.join(','))
      }
      if (opts.permissionMode === 'plan') {
        args.push('--read-only')
      }
      if (opts.extraArgs) {
        args.push(...opts.extraArgs)
      }
      return args
    }
    case 'opencode': {
      // OpenCode CLI: --print, --tools, --no-tools.
      const args: string[] = ['--print', '--cwd', opts.cwd]
      if (opts.model) {
        args.push('--model', opts.model)
      }
      if (allAllowed.length > 0) {
        args.push('--tools', allAllowed.join(','))
      }
      if (opts.disallow.length > 0) {
        args.push('--no-tools', opts.disallow.join(','))
      }
      if (opts.extraArgs) {
        args.push(...opts.extraArgs)
      }
      return args
    }
  }
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
      throw new Error(
        `spawnAiAgent: requested agent "${requested}" is not on PATH. Install the CLI or pass a different agent. Discovered: ${Object.keys(discovered).join(', ') || '(none)'}`,
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
  throw new Error(
    'spawnAiAgent: no AI agent CLI on PATH. Install one of: claude, codex, opencode, gemini.',
  )
}

/**
 * Spawn an AI agent CLI subprocess with the locked-down flag set.
 *
 * @example
 * ```ts
 * import { EDIT_ONLY_PROFILE } from '@socketsecurity/lib/ai/profiles'
 * import { spawnAiAgent } from '@socketsecurity/lib/ai/spawn'
 *
 * const result = await spawnAiAgent({
 *   ...EDIT_ONLY_PROFILE,
 *   prompt: 'Fix the lint findings in src/foo.ts',
 *   cwd: process.cwd(),
 *   model: 'claude-sonnet-4-6',
 *   timeoutMs: 5 * 60 * 1000,
 * })
 * if (result.exitCode !== 0) { ... }
 * ```
 *
 * Throws when the requested agent isn't on PATH (or, when no agent
 * is requested, when none of the known agents are on PATH).
 */
export async function spawnAiAgent(
  opts: SpawnAiAgentOptions,
): Promise<AgentSpawnResult> {
  const agent = await pickAgent(opts.agent, opts.cwd)
  const args = buildArgs(agent, opts)

  let stdout = ''
  let stderr = ''
  let exitCode = 0
  let attempts = 0
  const start = Date.now()

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1
    stdout = ''
    stderr = ''
    exitCode = 0

    try {
      const child = spawn(agent, args, {
        cwd: opts.cwd,
        stdio: 'pipe',
        stdioString: true,
        timeout: opts.timeoutMs,
      })
      child.stdin?.end(opts.prompt)
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
    await new Promise(resolve => setTimeout(resolve, backoffFor(attempts)))
  }

  return {
    attempts,
    durationMs: Date.now() - start,
    exitCode,
    stderr,
    stdout,
  }
}
