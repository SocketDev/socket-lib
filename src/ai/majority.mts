/**
 * @file Best-of-N self-consistency for decision tasks. A noisy small model
 *   varies run-to-run; sampling the same prompt several times and taking the
 *   majority vote collapses that variance into a stable verdict. `key` maps
 *   each sample's data to the value being voted on.
 */

/**
 * One attempt's outcome from a task runner.
 */
export interface TaskResult<T> {
  readonly ok: boolean
  readonly data?: T | undefined
  readonly error?: string | undefined
  readonly raw?: string | undefined
}

/**
 * Pick the most frequent successful sample by `key`. Filters to `ok` samples
 * with data, tallies them, and returns the result whose key wins the vote. Ties
 * break to the earliest-sampled key (deterministic — the first key to reach the
 * max wins). With no successful sample, returns the last result, or a synthetic
 * failure when `results` is empty.
 */
export function majorityResult<T>(
  results: ReadonlyArray<TaskResult<T>>,
  key: (data: T) => string,
): TaskResult<T> {
  const okResults = results.filter(
    (result): result is TaskResult<T> & { data: T } =>
      result.ok && result.data !== undefined,
  )
  if (okResults.length === 0) {
    return (
      results[results.length - 1] ?? { ok: false, error: 'no samples', raw: '' }
    )
  }
  const counts = new Map<string, number>()
  for (let i = 0, { length } = okResults; i < length; i += 1) {
    const result = okResults[i]!
    const k = key(result.data)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let maxCount = 0
  for (const count of counts.values()) {
    if (count > maxCount) {
      maxCount = count
    }
  }
  return okResults.find(result => counts.get(key(result.data)) === maxCount)!
}
