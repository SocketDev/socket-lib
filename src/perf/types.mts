/**
 * @file Public type surface for `perf/*` modules — the `PerformanceMetrics` row
 *   shape pushed onto the shared metrics array by `perfTimer` / `measure` /
 *   `measureSync` / `perfCheckpoint` / `trackMemory`. Pure types, no runtime
 *   side effects.
 */

/**
 * Performance metrics collected during execution.
 */
export type PerformanceMetrics = {
  operation: string
  duration: number
  timestamp: number
  metadata?: Record<string, unknown> | undefined
}
