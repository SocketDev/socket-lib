/**
 * @file Locked-down spawn for AI agent CLIs (Claude / Codex / Gemini /
 *   OpenCode). Per the CLAUDE.md "Programmatic Claude calls" rule: every
 *   headless invocation MUST set the four lockdown flags (tools / disallow /
 *   permissionMode). The helper enforces this at the
 *   type level (`SpawnAiAgentOptions` requires the relevant fields) AND at the
 *   spawn site (per-agent flag translator). Why CLI subprocess instead of an
 *   SDK call: Socket's contract matches what the local user sees when
 *   invoking the CLI — same auth config, same model availability, same tool
 *   permissions. SDK calls would diverge on auth handling and force per-agent
 *   SDK installs. Retry: 3 attempts on overload (HTTP 529 / "Overloaded"), exp.
 *   backoff (5s / 15s / 45s). Each retry is a fresh subprocess.
 */

import process from 'node:process'

import { errorMessage } from '../errors/message'
import { ObjectKeys } from '../primordials/object'
import { spawn } from '../process/spawn/child'
import { isSpawnError } from '../process/spawn/errors'

import { discoverAiAgents } from './discover.mts'

import { DateNow } from '../primordials/date'

import { ErrorCtor } from '../primordials/error'

import { PromiseCtor } from '../primordials/promise'

import { usableTierCandidates } from './route.mts'

import type { RouteContext, TierCandidate } from './route.mts'
import type { AiTier } from './tier.mts'
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
 * denied tools, and here is the permission mode." This
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

// True when the agent reported the SELECTED MODEL can't serve the request —
// distinct from an overload (529, transient, retry the same model). Two real
// signatures, both meaning "this model won't work, try a different agent":
//   - a temporary outage of a specific model, e.g. Fable while it is down:
//     "Claude Fable 5 is currently unavailable. Learn more: …"
//   - the model is gated/absent for this account:
//     "There's an issue with the selected model (<id>). It may not exist or
//      you may not have access to it. Run --model to pick a different model."
// Unlike `isOverloaded`, the right response is to FALL OVER to the next agent
// in the tier chain, not to retry the same one — the model isn't coming back
// within a backoff window.
//
// Match the GIST, not a literal sentence: CLI wording drifts across versions
// and providers (claude-code alone emits "currently unavailable", "is
// unavailable", "isn't available", "is temporarily unavailable", "does not
// exist", "not found", "may not have access", "issue with the selected
// model"), so detect the recurring SIGNAL PHRASES, not the exact captured
// strings. Plain lowercased substring checks — simpler + faster than regex and
// no alternation-ordering to maintain.

// Signal phrases that on their own mean "this model can't serve" regardless of
// surrounding wording. Lowercase; matched as substrings.
const MODEL_UNAVAILABLE_PHRASES: readonly string[] = [
  'access denied',
  'currently unavailable',
  'forbidden',
  'have access', // "don't/doesn't/may not have access"
  'is unavailable',
  'isn’t available',
  "isn't available",
  'may not exist',
  'no access to',
  'no such model',
  'not authorized',
  'not authorised',
  'not available',
  'permission denied',
  'permission_denied',
  'temporarily unavailable',
  'unauthorized',
  'unauthorised',
]

// Existence phrases that must be ANCHORED to "model" — a bare "not found" /
// "does not exist" / "unknown" in genuine work output (a missing file, a failed
// `require`) must NOT trigger a fall-over, so require "model" nearby.
const MODEL_EXISTENCE_PHRASES: readonly string[] = [
  'does not exist',
  "doesn't exist",
  'no such',
  'not exist',
  'not found',
  'unavailable',
  'unknown',
  'unreachable',
]

export function isModelUnavailable(stdout: string, stderr: string): boolean {
  const text = `${stdout}\n${stderr}`.toLowerCase()
  for (let i = 0, { length } = MODEL_UNAVAILABLE_PHRASES; i < length; i += 1) {
    if (text.includes(MODEL_UNAVAILABLE_PHRASES[i]!)) {
      return true
    }
  }
  // model_not_found (any separator) + the API status codes (403 no-access,
  // 404 model-not-found) the http/programmatic backends surface.
  if (
    /\bmodel[_-]?not[_-]?found\b/i.test(text) ||
    /\bapi error:\s*(?:403|404)\b/i.test(text)
  ) {
    return true
  }
  // Existence words count only when "model" appears too (avoids false fall-over
  // on an unrelated not-found). Cheap: only scan if a candidate word is present.
  if (text.includes('model')) {
    for (let i = 0, { length } = MODEL_EXISTENCE_PHRASES; i < length; i += 1) {
      if (text.includes(MODEL_EXISTENCE_PHRASES[i]!)) {
        return true
      }
    }
  }
  return false
}

export function isOverloaded(stdout: string, stderr: string): boolean {
  const re = /API Error: 529|Overloaded/i
  return re.test(stdout) || re.test(stderr)
}

// Quota / rate-limit exhaustion — the seat or budget is SPENT (an HTTP 429, a
// rate-limit error, or a usage/quota cap). Distinct from a transient 529
// overload (`isOverloaded`, which retries the same agent) and a missing model
// (`isModelUnavailable`): the cheaper ration is gone, so the right response is
// to FALL OVER to a different provider/account, not retry the same one. This is
// the reactive cap signal for subscription seats (Claude Max, ChatGPT Pro) and
// metered accounts that have hit their rate/spend limit.
const QUOTA_EXHAUSTED_PHRASES: readonly string[] = [
  'exceeded your current quota',
  'insufficient_quota',
  'quota exceeded',
  'rate limit',
  'rate-limited',
  'rate_limit_error',
  'usage limit',
]

export function isQuotaExhausted(stdout: string, stderr: string): boolean {
  const text = `${stdout}\n${stderr}`.toLowerCase()
  // HTTP 429 from any backend, anchored so a stray "429" in work output (a port,
  // a line number) does not trigger a spurious fall-over.
  if (
    /\bapi error:\s*429\b/.test(text) ||
    text.includes('429 too many requests')
  ) {
    return true
  }
  for (let i = 0, { length } = QUOTA_EXHAUSTED_PHRASES; i < length; i += 1) {
    if (text.includes(QUOTA_EXHAUSTED_PHRASES[i]!)) {
      return true
    }
  }
  return false
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
        // Only override env when the caller supplies one; absent = inherit.
        ...(options.env ? { env: { ...process.env, ...options.env } } : {}),
        stdio: 'pipe',
        stdioString: true,
        timeout: options.timeoutMs,
      })
      // `.stdin` is a typed convenience accessor on the Socket
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
  // `unavailable` means the selected MODEL can't serve the request (down /
  // no-access) — the caller should fall over to the next agent, not retry here.
  return {
    attempts,
    durationMs: DateNow() - start,
    exitCode,
    overloaded: isOverloaded(stdout, stderr),
    stderr,
    stdout,
    unavailable: isModelUnavailable(stdout, stderr),
  }
}

/**
 * Result of a tier spawn that may have fallen over one or more offline models.
 * `result` is the spawn that actually ran (the first whose model was not
 * `unavailable`, or the last attempt if every candidate was down). `candidate`
 * is the engine/model that produced it. `fellOver` lists the candidates that
 * reported their model offline before this one — empty on a first-try success.
 */
export interface TierSpawnResult {
  readonly candidate: TierCandidate
  readonly fellOver: readonly TierCandidate[]
  readonly result: AgentSpawnResult
}

/**
 * Spawn a tier's work, automatically FALLING OVER to the next agent when a
 * model is offline. Walks the tier's usable candidates (Claude → Codex →
 * open-weight) in order; if a spawn comes back with `unavailable` (the model is
 * down or gated — e.g. "Claude Fable 5 is currently unavailable"), it advances
 * to the next candidate instead of failing. This is the runtime complement to
 * `route.mts`'s static availability check: that check can't predict an outage,
 * so the live spawn result drives the fallback.
 *
 * Returns the first non-`unavailable` spawn (success OR a genuine work failure
 * on a model that WAS reachable — a real failure shouldn't silently retry on a
 * weaker model). If every candidate is offline, returns the last attempt with
 * its `unavailable` flag set, so the caller can report "all models down".
 * Throws only when the tier has no usable candidate at all (nothing installed +
 * keyed) — same contract as `resolveTier` returning undefined.
 */
export async function spawnTierWithFallback(
  tier: AiTier,
  ctx: RouteContext,
  options: Omit<SpawnAiAgentOptions, 'agent' | 'effort' | 'model'>,
): Promise<TierSpawnResult> {
  const candidates = usableTierCandidates(tier, ctx)
  if (candidates.length === 0) {
    throw new ErrorCtor(
      `spawnTierWithFallback: no usable agent for tier "${tier}". No candidate engine is both installed and keyed (checked: ${candidates.length}). Install/authenticate one of the tier's engines, or pick a different tier.`,
    )
  }
  const fellOver: TierCandidate[] = []
  let last: { candidate: TierCandidate; result: AgentSpawnResult } | undefined
  for (let i = 0, { length } = candidates; i < length; i += 1) {
    const candidate = candidates[i]!
    const result = await spawnAiAgent({
      ...options,
      agent: candidate.engine,
      effort: candidate.effort,
      model: candidate.model,
    } as SpawnAiAgentOptions)
    last = { candidate, result }
    if (
      !result.unavailable &&
      !isQuotaExhausted(result.stdout, result.stderr)
    ) {
      // Reached a model that could serve (success or a genuine failure) —
      // stop; don't downgrade a real failure onto a weaker model.
      return { candidate, fellOver, result }
    }
    // This model is offline/gated, or its seat/budget is exhausted (429 / quota)
    // — record it and try the next candidate (a different provider/account).
    fellOver.push(candidate)
  }
  // Every candidate was down or quota-exhausted — return the last attempt.
  return {
    candidate: last!.candidate,
    fellOver: fellOver.slice(0, -1),
    result: last!.result,
  }
}
