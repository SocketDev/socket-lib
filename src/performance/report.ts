/**
 * @fileoverview Report-side helpers — `generatePerformanceReport`
 * returns a multi-line ASCII-bordered report string;
 * `printPerformanceSummary` writes a one-line-per-op summary through
 * `debugLog`. Both gate on `isPerfEnabled()` and use the same
 * `getPerformanceSummary` rollup.
 */

import { debugLog } from '../debug/output'
import { MathRound } from '../primordials/math'
import { ObjectKeys, ObjectValues } from '../primordials/object'

import { performanceMetrics } from './_internal'
import { isPerfEnabled } from './enabled'
import { getPerformanceSummary } from './metrics'

/**
 * Create a performance report for the current execution.
 * Only available when DEBUG=perf is enabled.
 *
 * @returns Formatted performance report
 *
 * @example
 * import { generatePerformanceReport } from '@socketsecurity/lib/performance/report'
 *
 * console.log(generatePerformanceReport())
 * // ╔═══════════════════════════════════════════════╗
 * // ║         Performance Report                    ║
 * // ╚═══════════════════════════════════════════════╝
 * //
 * // api-call:
 * //   Calls: 5
 * //   Avg:   246.8ms
 * //   Min:   100ms
 * //   Max:   500ms
 * //   Total: 1234ms
 */
export function generatePerformanceReport(): string {
  if (!isPerfEnabled() || performanceMetrics.length === 0) {
    return '(no performance data collected - enable with DEBUG=perf)'
  }

  const summary = getPerformanceSummary()
  const operations = ObjectKeys(summary).sort()

  let report = '\n╔═══════════════════════════════════════════════╗\n'
  report += '║         Performance Report                    ║\n'
  report += '╚═══════════════════════════════════════════════╝\n\n'

  for (const operation of operations) {
    const stats = summary[operation] as {
      count: number
      total: number
      avg: number
      min: number
      max: number
    }
    report += `${operation}:\n`
    report += `  Calls: ${stats.count}\n`
    report += `  Avg:   ${stats.avg}ms\n`
    report += `  Min:   ${stats.min}ms\n`
    report += `  Max:   ${stats.max}ms\n`
    report += `  Total: ${stats.total}ms\n\n`
  }

  const totalDuration = ObjectValues(summary).reduce(
    (sum, s) => sum + s.total,
    0,
  )
  report += `Total measured time: ${MathRound(totalDuration * 100) / 100}ms\n`

  return report
}

/**
 * Print performance summary to console.
 * Only prints when DEBUG=perf is enabled.
 *
 * @example
 * import { printPerformanceSummary } from '@socketsecurity/lib/performance/report'
 *
 * printPerformanceSummary()
 * // Performance Summary:
 * // api-call: 5 calls, avg 246.8ms (min 100ms, max 500ms, total 1234ms)
 * // file-read: 10 calls, avg 5ms (min 2ms, max 15ms, total 50ms)
 */
export function printPerformanceSummary(): void {
  if (!isPerfEnabled() || performanceMetrics.length === 0) {
    return
  }

  const summary = getPerformanceSummary()
  const operations = ObjectKeys(summary).sort()

  debugLog('[perf]\n=== Performance Summary ===')

  for (const operation of operations) {
    const stats = summary[operation] as {
      count: number
      total: number
      avg: number
      min: number
      max: number
    }
    debugLog(
      `[perf] ${operation}: ${stats.count} calls, avg ${stats.avg}ms (min ${stats.min}ms, max ${stats.max}ms, total ${stats.total}ms)`,
    )
  }

  debugLog('[perf] =========================\n')
}
