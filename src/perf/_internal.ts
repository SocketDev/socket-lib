/**
 * @fileoverview Private internals for `perf/*` modules — the
 * shared in-process metrics array. Every recording function (timer,
 * checkpoint, memory tracker) appends here; readers (`metrics`,
 * `report`) consume the same array.
 */

import type { PerformanceMetrics } from './types'

/**
 * Global metrics collection (only in debug mode).
 */
export const performanceMetrics: PerformanceMetrics[] = []
