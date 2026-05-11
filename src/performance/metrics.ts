/**
 * @fileoverview Read-side helpers — `getPerformanceMetrics` returns a
 * shallow copy of the recorded rows, `getPerformanceSummary` rolls
 * them up per operation (count / total / avg / min / max), and
 * `clearPerformanceMetrics` empties the array in place.
 */

import { debugLog } from '../debug/output'
import { MathMax, MathMin, MathRound } from '../primordials/math'
import { ObjectEntries } from '../primordials/object'

import { performanceMetrics } from './_internal'

import type { PerformanceMetrics } from './types'

/**
 * Clear all collected performance metrics.
 *
 * @example
 * import { clearPerformanceMetrics } from '@socketsecurity/lib/performance/metrics'
 *
 * clearPerformanceMetrics()
 */
export function clearPerformanceMetrics(): void {
  performanceMetrics.length = 0
  debugLog('[perf] Cleared performance metrics')
}

/**
 * Get all collected performance metrics.
 * Only available when DEBUG=perf is enabled.
 *
 * @returns Array of performance metrics
 *
 * @example
 * import { getPerformanceMetrics } from '@socketsecurity/lib/performance/metrics'
 *
 * const metrics = getPerformanceMetrics()
 * console.log(metrics)
 */
export function getPerformanceMetrics(): PerformanceMetrics[] {
  return [...performanceMetrics]
}

/**
 * Get performance summary statistics.
 *
 * @returns Summary of metrics grouped by operation
 *
 * @example
 * import { getPerformanceSummary } from '@socketsecurity/lib/performance/metrics'
 *
 * const summary = getPerformanceSummary()
 * console.log(summary)
 * // {
 * //   'api-call': { count: 5, total: 1234, avg: 246.8, min: 100, max: 500 },
 * //   'file-read': { count: 10, total: 50, avg: 5, min: 2, max: 15 }
 * // }
 */
export function getPerformanceSummary(): Record<
  string,
  {
    count: number
    total: number
    avg: number
    min: number
    max: number
  }
> {
  const summary: Record<
    string,
    { count: number; total: number; min: number; max: number }
  > = { __proto__: null } as unknown as Record<
    string,
    { count: number; total: number; min: number; max: number }
  >

  for (const metric of performanceMetrics) {
    const { duration, operation } = metric

    if (!summary[operation]) {
      summary[operation] = {
        count: 0,
        total: 0,
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      }
    }

    const stats = summary[operation] as {
      count: number
      total: number
      min: number
      max: number
    }
    stats.count++
    stats.total += duration
    stats.min = MathMin(stats.min, duration)
    stats.max = MathMax(stats.max, duration)
  }

  // Calculate averages and return with proper typing
  const result: Record<
    string,
    { count: number; total: number; avg: number; min: number; max: number }
  > = { __proto__: null } as unknown as Record<
    string,
    { count: number; total: number; avg: number; min: number; max: number }
  >

  for (const { 0: operation, 1: stats } of ObjectEntries(summary)) {
    result[operation] = {
      count: stats.count,
      total: MathRound(stats.total * 100) / 100,
      avg: MathRound((stats.total / stats.count) * 100) / 100,
      min: MathRound(stats.min * 100) / 100,
      max: MathRound(stats.max * 100) / 100,
    }
  }

  return result
}
