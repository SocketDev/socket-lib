/**
 * @file Opt-in "AI assist when stuck" helper — a thin, dependency-light layer
 *   over the ai-agent runner (pickAgent + spawnAiAgent). When a task is STUCK
 *   an opted-in caller hands the task (+ optional context) here and gets a
 *   resolved backend (claude → codex → opencode/gemini, or an explicit one) to
 *   attempt it, returning a structured `{ backend, ok, output }` result. OPT-IN
 *   by design: `assistWhenStuck` is a NO-OP unless the caller opted in — via
 *   `optIn: true` OR the `SOCKET_AI_ASSIST` env flag — so a stuck build /
 *   optimize / release step degrades to its normal failure UNLESS AI help was
 *   requested; assist never fires on its own. Consumers: socket-cli `optimize`
 *   and the wheelhouse gh-release / fleet optimization scripts, dropped into
 *   their stuck/catch paths.
 */

import { errorMessage } from '../errors/message'

import { AI_PROFILE } from './profiles.mts'
import { pickAgent, spawnAiAgent } from './spawn.mts'

import type { AiAgentName } from './types.mts'

// Env flag that opts a session into AI assistance. Absent / any other value =
// disabled (opt-in is off by default).
export const AI_ASSIST_ENV = 'SOCKET_AI_ASSIST'

// Default per-attempt timeout (5 min). A stuck-task assist must be bounded so it
// can't hang the build/optimize/release step it was called from. Exported so a
// caller can reason about the bound.
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

export interface AiAssistOptions {
  // The stuck task handed to the agent (what to do).
  readonly task: string
  // The repo / working dir the agent runs in.
  readonly cwd: string
  // Extra context appended to the prompt (error output, file excerpts, …).
  readonly context?: string | undefined
  // Force a specific backend; else the pickAgent chain (claude → codex →
  // opencode → gemini).
  readonly backend?: AiAgentName | undefined
  // Per-attempt timeout in ms; defaults to 5 min.
  readonly timeoutMs?: number | undefined
  // Explicit opt-in that bypasses the env gate (for a caller that already
  // confirmed the user wants help). `assistWhenStuck` honors this OR the env
  // flag.
  readonly optIn?: boolean | undefined
}

export interface AiAssistResult {
  readonly backend: AiAgentName
  readonly ok: boolean
  readonly output: string
  readonly error?: string | undefined
}

/**
 * Run an AI agent against a stuck task and return a structured result. Resolves
 * a backend (explicit `backend`, else claude → codex → opencode → gemini via
 * `pickAgent`), runs it under the locked-down `edit` profile, and reports
 * whether it succeeded (`ok` = clean exit AND the model was reachable). Does
 * NOT check the opt-in gate — use `assistWhenStuck` for the guarded entry.
 * Throws only when no agent CLI is on PATH (from `pickAgent`).
 */
export async function aiAssist(
  options: AiAssistOptions,
): Promise<AiAssistResult> {
  const opts = { __proto__: null, ...options } as AiAssistOptions
  const backend = await pickAgent(opts.backend, opts.cwd)
  const result = await spawnAiAgent({
    ...AI_PROFILE.edit,
    agent: backend,
    cwd: opts.cwd,
    prompt: buildAssistPrompt(opts.task, opts.context),
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })
  const ok = result.exitCode === 0 && !result.unavailable
  return {
    backend,
    error: ok ? undefined : result.stderr || `exit ${result.exitCode}`,
    ok,
    output: result.stdout,
  }
}

/**
 * The stuck-path entry: a NO-OP returning `undefined` unless the caller opted
 * in (`optIn === true` OR `SOCKET_AI_ASSIST`). When opted in it runs `aiAssist`
 * and NEVER throws — a failure to even reach an agent collapses to a failed
 * result — so a catch/stuck path can call it without its own guard:
 *
 * @example
 *   ;```ts
 *   try { doOptimizeStep() } catch (e) {
 *     const help = await assistWhenStuck({
 *       task: 'This optimize step failed; diagnose + fix.',
 *       context: errorMessage(e),
 *       cwd: repoRoot,
 *     })
 *     if (help?.ok) { … } // undefined when not opted in
 *   }
 *   ```
 */
export async function assistWhenStuck(
  options: AiAssistOptions,
): Promise<AiAssistResult | undefined> {
  const opts = { __proto__: null, ...options } as AiAssistOptions
  if (!(opts.optIn === true || isAiAssistEnabled())) {
    return undefined
  }
  try {
    return await aiAssist(opts)
  } catch (e) {
    return {
      backend: opts.backend ?? 'claude',
      error: errorMessage(e),
      ok: false,
      output: '',
    }
  }
}

/**
 * Compose the agent prompt from the task and optional context. Pure.
 */
export function buildAssistPrompt(task: string, context?: string): string {
  const trimmedTask = task.trim()
  const trimmedContext = context?.trim()
  return trimmedContext
    ? `${trimmedTask}\n\n--- Context ---\n${trimmedContext}\n`
    : `${trimmedTask}\n`
}

/**
 * True when this session has opted into AI assistance
 * (`SOCKET_AI_ASSIST=1` or `=true`). Off by default — assist must be explicitly
 * requested. The env map is injectable for tests.
 */
export function isAiAssistEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const value = env[AI_ASSIST_ENV]
  return value === '1' || value === 'true'
}
