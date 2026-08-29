/**
 * @file Retry policy for spawned commands.
 *   RETRY IS NOT SAFE BY DEFAULT, which is why `retries` defaults to 0 and
 *   every caller opts in per call. A command that CHANGES something may have
 *   already succeeded when the attempt fails: a `git push` killed on timeout
 *   can have reached the server, and `npm publish` can have uploaded. Retrying
 *   those double-applies. Retry reads, not writes.
 *   The default predicate narrows the risk further. A clean non-zero exit is
 *   the command ANSWERING - no auth, no such package, a failing test - and the
 *   answer does not change on a second run, so only a killed-on-timeout or a
 *   failed launch is retried. Both mean the command never delivered a verdict.
 */

export interface SpawnRetryFailure {
  /**
   * Set when the child never launched, or when the runner itself failed.
   */
  error?: unknown | undefined
  /**
   * Set when the child died to a signal, which is how a `timeout` kill lands.
   */
  signal?: unknown | undefined
  /**
   * The exit code, when the child ran to completion.
   */
  status?: number | null | undefined
}

export interface SpawnRetryOptions {
  /**
   * Whether a given failure is worth another attempt. Defaults to
   * {@link isTransientSpawnFailure}.
   */
  isRetryable?: ((failure: SpawnRetryFailure) => boolean) | undefined
  /**
   * How many EXTRA attempts to make after the first one fails. Default 0.
   *
   * Opt in only for a command that can run twice with the same outcome.
   */
  retries?: number | undefined
  /**
   * The wait before the second attempt, in milliseconds. Default 1000.
   */
  retryDelayMs?: number | undefined
  /**
   * What each wait is multiplied by for the attempt after it. Default 2.
   */
  retryFactor?: number | undefined
  /**
   * The ceiling on any single wait, in milliseconds. Default 30000.
   */
  retryMaxDelayMs?: number | undefined
}

export const DEFAULT_RETRY_DELAY_MS = 1000

export const DEFAULT_RETRY_FACTOR = 2

export const DEFAULT_RETRY_MAX_DELAY_MS = 30_000

/**
 * The first wait, in milliseconds.
 */
export function firstRetryDelayMs(
  options?: SpawnRetryOptions | undefined,
): number {
  const opts = { __proto__: null, ...options } as SpawnRetryOptions
  return Math.min(
    opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    opts.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
  )
}

/**
 * Whether a failure looks like the command never reached a verdict.
 *
 * True for a failed launch and for a death by signal, which is how Node's own
 * `timeout` kill arrives. False for a clean non-zero exit, because that is an
 * answer rather than a transport problem.
 */
export function isTransientSpawnFailure(failure: SpawnRetryFailure): boolean {
  if (failure.error !== undefined && failure.error !== null) {
    return true
  }
  return failure.signal !== undefined && failure.signal !== null
}

/**
 * The wait before the next attempt, given the wait before this one.
 */
export function nextRetryDelayMs(
  currentMs: number,
  options?: SpawnRetryOptions | undefined,
): number {
  const opts = { __proto__: null, ...options } as SpawnRetryOptions
  const factor = opts.retryFactor ?? DEFAULT_RETRY_FACTOR
  const maxMs = opts.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS
  return Math.min(currentMs * factor, maxMs)
}

/**
 * The async twin of {@link runWithSpawnRetryUsing}, for callers that can await
 * a real timer instead of blocking a thread.
 *
 * Same three ordering rules: a success never retries, a clean non-zero exit
 * never retries, and a wait always precedes a retry.
 */
export async function runWithSpawnRetryAsync<Result extends SpawnRetryFailure>(
  sleeper: (ms: number) => Promise<void>,
  attempt: () => Promise<Result>,
  options?: SpawnRetryOptions | undefined,
): Promise<Result> {
  const attempts = totalSpawnAttempts(options)
  let waitMs = firstRetryDelayMs(options)
  for (let n = 1; ; n += 1) {
    // eslint-disable-next-line no-await-in-loop -- attempts ARE sequential
    const result = await attempt()
    if (
      attempts === 1 ||
      spawnSucceeded(result) ||
      !shouldRetrySpawn(result, n, options)
    ) {
      return result
    }
    // eslint-disable-next-line no-await-in-loop -- the pause IS the point
    await sleeper(waitMs)
    waitMs = nextRetryDelayMs(waitMs, options)
  }
}

/**
 * Run `attempt` until it succeeds, the budget runs out, or the failure is one
 * the policy will not retry. Returns the last result either way.
 *
 * The loop lives here rather than at the call site so the ordering rules stay
 * in one place: a success never retries, a clean non-zero exit never retries,
 * and a retry never happens without a wait before it.
 */
export function runWithSpawnRetryUsing<Result extends SpawnRetryFailure>(
  sleeper: (ms: number) => boolean,
  attempt: () => Result,
  options?: SpawnRetryOptions | undefined,
): Result {
  const attempts = totalSpawnAttempts(options)
  let waitMs = firstRetryDelayMs(options)
  for (let n = 1; ; n += 1) {
    const result = attempt()
    if (
      attempts === 1 ||
      spawnSucceeded(result) ||
      !shouldRetrySpawn(result, n, options)
    ) {
      return result
    }
    // No wait available means no retry: going straight back at a command that
    // just timed out is a hot loop against the thing that is already failing.
    if (!sleeper(waitMs)) {
      return result
    }
    waitMs = nextRetryDelayMs(waitMs, options)
  }
}

/**
 * Whether another attempt should run after `failure` on `attempt`.
 *
 * `attempt` is 1-based, so the first call passes 1.
 */
export function shouldRetrySpawn(
  failure: SpawnRetryFailure,
  attempt: number,
  options?: SpawnRetryOptions | undefined,
): boolean {
  if (attempt >= totalSpawnAttempts(options)) {
    return false
  }
  const opts = { __proto__: null, ...options } as SpawnRetryOptions
  const predicate = opts.isRetryable ?? isTransientSpawnFailure
  return predicate(failure)
}

/**
 * Whether the command ran and exited cleanly.
 *
 * A success ends the retry loop before any predicate is consulted. The
 * predicate's job is to sort FAILURES into transient and final; asking it
 * about a clean exit lets a permissive one re-run work that already happened.
 */
export function spawnSucceeded(result: SpawnRetryFailure): boolean {
  if (result.error !== undefined && result.error !== null) {
    return false
  }
  if (result.signal !== undefined && result.signal !== null) {
    return false
  }
  return result.status === 0
}

/**
 * The number of attempts a call makes in total, first one included.
 *
 * A negative or fractional `retries` collapses to a single attempt rather than
 * looping strangely.
 */
export function totalSpawnAttempts(
  options?: SpawnRetryOptions | undefined,
): number {
  const opts = { __proto__: null, ...options } as SpawnRetryOptions
  const retries = opts.retries ?? 0
  if (!Number.isFinite(retries) || retries < 1) {
    return 1
  }
  return Math.floor(retries) + 1
}
