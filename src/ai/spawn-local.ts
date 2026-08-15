/**
 * @file Keyless on-device execution path for a `local` TierCandidate, the
 *   non-CLI complement to `spawn.mts`. Where `spawnAiAgent` shells out to an
 *   installed agent CLI, this drives an on-device LanguageModel and normalizes
 *   the reply into the SAME `AgentSpawnResult` shape, so a caller (or
 *   `spawnTierWithFallback`) treats a local rung exactly like a CLI rung.
 *   Injection, exactly like `ai/exec.mts`: the lib OWNS the
 *   `LocalAgentProvider` interface and ships a thin built-in provider over the
 *   `builtin.mts` LanguageModel factory (`getLanguageModel()`), while the HEAVY
 *   provider — a real on-device model such as odai — is INJECTED by the caller
 *   and never imported here. That keeps the small-dist lib free of any model
 *   dependency: a consumer that never routes local pays nothing, and the local
 *   engine is discovered lazily through the injection point.
 */

import { errorMessage } from '../errors/message'
import { DateNow } from '../primordials/date'
import { ErrorCtor } from '../primordials/error'

import { getLanguageModel } from './builtin'

import type { LanguageModelAvailability, LanguageModelFactory } from './builtin'
import type { AgentSpawnResult, SpawnAiAgentOptions } from './types'

/**
 * A minimal Prompt-API session: `prompt(input)` resolves to the model's reply
 * text. Matches the shape a `LanguageModelFactory.create()` session exposes
 * across Chrome and the native Node builds. Kept structural so any conforming
 * on-device session satisfies it, injected sessions included.
 */
export interface LocalModelSession {
  prompt(input: unknown, options?: unknown | undefined): Promise<string>
}

/**
 * Inputs to a single local generation. Mirrors the CLI spawn surface a `local`
 * candidate needs: the prompt, the working directory (advisory for a local
 * engine), the model id from the tier candidate, and an optional timeout /
 * abort signal.
 */
export interface LocalSpawnOptions {
  readonly prompt: string
  readonly cwd: string
  readonly model?: string | undefined
  readonly signal?: AbortSignal | undefined
  readonly timeoutMs?: number | undefined
}

/**
 * The injectable keyless-local primitive: probe availability, then generate a
 * completion as plain text. The lib provides `builtinLocalProvider`; a caller
 * injects a heavier implementation backed by a real on-device model that
 * satisfies this same interface. `generate` MUST resolve with the reply text
 * or throw, never return a sentinel, so `spawnLocalAgent` can normalize both
 * paths.
 */
export interface LocalAgentProvider {
  availability(): Promise<LanguageModelAvailability>
  generate(options: LocalSpawnOptions): Promise<string>
}

/**
 * The built-in keyless provider: drives the `builtin.mts` LanguageModel factory
 * (`getLanguageModel()` unless a factory is injected for tests). `availability`
 * forwards the factory's own probe (or `unavailable` when no local engine
 * resolves); `generate` creates a session and prompts it. Zero heavy deps: the
 * factory itself is resolved lazily and may be absent, which surfaces as
 * `unavailable` rather than a throw on the probe path.
 */
export function builtinLocalProvider(
  factory?: LanguageModelFactory | undefined,
): LocalAgentProvider {
  const resolveFactory = (): LanguageModelFactory | undefined =>
    factory ?? getLanguageModel()
  return {
    async availability(): Promise<LanguageModelAvailability> {
      const resolved = resolveFactory()
      if (!resolved) {
        return 'unavailable'
      }
      return await resolved.availability()
    },
    async generate(options: LocalSpawnOptions): Promise<string> {
      const opts = { __proto__: null, ...options } as LocalSpawnOptions
      const resolved = resolveFactory()
      if (!resolved) {
        throw new ErrorCtor(
          'builtinLocalProvider: no on-device LanguageModel is available. ' +
            'Inject a LocalAgentProvider or install a local engine.',
        )
      }
      const session = await resolved.create(
        opts.model ? { __proto__: null, model: opts.model } : undefined,
      )
      if (!isLocalModelSession(session)) {
        throw new ErrorCtor(
          'builtinLocalProvider: the local LanguageModel session has no ' +
            'callable prompt(); cannot generate.',
        )
      }
      return await session.prompt(opts.prompt)
    },
  }
}

/**
 * Probe whether the keyless local engine is usable, for building
 * `RouteContext.localAvailable`. Availability `'available'` is the only usable
 * state: `downloadable`/`downloading`/`unavailable` all mean "not ready now".
 * Never throws: any probe failure resolves to `false` so a caller can fan this
 * out alongside its `which` / credential probes without a try/catch.
 */
export async function isLocalEngineAvailable(
  provider?: LocalAgentProvider | undefined,
): Promise<boolean> {
  const resolved = provider ?? builtinLocalProvider()
  try {
    return (await resolved.availability()) === 'available'
  } catch {
    return false
  }
}

/**
 * True when `value` is a usable Prompt-API session (has a callable `prompt`).
 */
export function isLocalModelSession(
  value: unknown,
): value is LocalModelSession {
  if (
    (typeof value !== 'function' && typeof value !== 'object') ||
    value === null
  ) {
    return false
  }
  return typeof (value as Partial<LocalModelSession>).prompt === 'function'
}

/**
 * Tier-orchestration entry: run a `local` candidate for
 * `spawnTierWithFallback`. Maps the shared spawn options plus the candidate's
 * model onto a `LocalSpawnOptions`, defaults the provider to the built-in
 * LanguageModel injection point, and normalizes prototype-polluted input. Kept
 * here (not inline in spawn.mts) so the null-proto normalization and provider
 * default live beside the local path they belong to.
 */
export async function runLocalTierSpawn(
  options: Pick<SpawnAiAgentOptions, 'cwd' | 'prompt' | 'timeoutMs'>,
  model: string,
  provider?: LocalAgentProvider | undefined,
): Promise<AgentSpawnResult> {
  const opts = { __proto__: null, ...options } as typeof options
  return await spawnLocalAgent(
    { cwd: opts.cwd, model, prompt: opts.prompt, timeoutMs: opts.timeoutMs },
    provider ?? builtinLocalProvider(),
  )
}

/**
 * Run a `local` candidate through a `LocalAgentProvider`, normalizing the reply
 * into the SAME `AgentSpawnResult` a CLI spawn returns. Contract mirrors
 * `spawnAiAgent`: never throws, always resolves to a result the caller branches
 * on via `exitCode`.
 *
 * - Availability other than `'available'` sets `unavailable: true` with a
 *   non-zero exit, the same signal `spawnTierWithFallback` uses to fall over to
 *   the next rung.
 * - A generation throw yields a non-zero exit with the message on `stderr`; this
 *   is a genuine failure on a reachable engine, so `unavailable` stays false
 *   rather than silently downgrading a real failure.
 * - Success returns the reply text on `stdout` with exit 0.
 *
 * A local engine has no retry/overload/quota surface, so `attempts` is always 1
 * and `overloaded` always false.
 */
export async function spawnLocalAgent(
  options: LocalSpawnOptions,
  provider: LocalAgentProvider,
): Promise<AgentSpawnResult> {
  const start = DateNow()
  let availability: LanguageModelAvailability
  try {
    availability = await provider.availability()
  } catch (e) {
    // A probe that throws is treated as "not reachable", so fall over.
    return {
      attempts: 1,
      durationMs: DateNow() - start,
      exitCode: 1,
      overloaded: false,
      stderr: errorMessage(e),
      stdout: '',
      unavailable: true,
    }
  }
  if (availability !== 'available') {
    return {
      attempts: 1,
      durationMs: DateNow() - start,
      exitCode: 1,
      overloaded: false,
      stderr: `local engine unavailable (availability: ${availability})`,
      stdout: '',
      unavailable: true,
    }
  }
  try {
    const text = await provider.generate(options)
    return {
      attempts: 1,
      durationMs: DateNow() - start,
      exitCode: 0,
      overloaded: false,
      stderr: '',
      stdout: text,
      unavailable: false,
    }
  } catch (e) {
    return {
      attempts: 1,
      durationMs: DateNow() - start,
      exitCode: 1,
      overloaded: false,
      stderr: errorMessage(e),
      stdout: '',
      unavailable: false,
    }
  }
}
