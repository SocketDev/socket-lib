/**
 * @file Recording-side helpers — `perfTimer` (returns a stop() closure),
 *   `measure` / `measureSync` (timed wrappers around an async / sync function),
 *   `perfCheckpoint` (zero-duration marker), and `trackMemory` (records
 *   heap-used at a label). All push rows into the shared metrics array when
 *   `isPerfEnabled()` is true.
 */

import process from 'node:process'

import { debugLog } from '../debug/output'
import { errorMessage } from '../errors/message'
import { DateNow } from '../primordials/date'
import { MathRound } from '../primordials/math'

import { performanceMetrics } from './_internal'
import { isPerfEnabled } from './enabled'

import type { PerformanceMetrics } from './types'

/**
 * Measure execution time of an async function.
 *
 * @example
 *   import { measure } from '@socketsecurity/lib/perf/timer'
 *
 *   const { result, duration } = await measure('fetch-packages', async () => {
 *     return await fetchPackages()
 *   })
 *   console.log(`Fetched packages in ${duration}ms`)
 *
 * @param operation - Name of the operation.
 * @param fn - Async function to measure.
 * @param metadata - Optional metadata.
 *
 * @returns Result of the function and duration
 */
export async function measure<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<{ result: T; duration: number }> {
  const stop = perfTimer(operation, metadata)

  try {
    const result = await fn()
    stop({ success: true })

    const metric = performanceMetrics[performanceMetrics.length - 1]
    return { result, duration: metric?.duration || 0 }
  } catch (e) {
    stop({
      success: false,
      error: errorMessage(e),
    })
    throw e
  }
}

/**
 * Measure synchronous function execution time.
 *
 * @example
 *   import { measureSync } from '@socketsecurity/lib/perf/timer'
 *
 *   const { result, duration } = measureSync('parse-json', () => {
 *     return JSON.parse(data)
 *   })
 *
 * @param operation - Name of the operation.
 * @param fn - Synchronous function to measure.
 * @param metadata - Optional metadata.
 *
 * @returns Result of the function and duration
 */
export function measureSync<T>(
  operation: string,
  fn: () => T,
  metadata?: Record<string, unknown>,
): { result: T; duration: number } {
  const stop = perfTimer(operation, metadata)

  try {
    const result = fn()
    stop({ success: true })

    const metric = performanceMetrics[performanceMetrics.length - 1]
    return { result, duration: metric?.duration || 0 }
  } catch (e) {
    stop({
      success: false,
      error: errorMessage(e),
    })
    throw e
  }
}

/**
 * Mark a checkpoint in performance tracking. Useful for tracking progress
 * through complex operations.
 *
 * @example
 *   import { perfCheckpoint } from '@socketsecurity/lib/perf/timer'
 *
 *   perfCheckpoint('start-scan')
 *   // ... do work ...
 *   perfCheckpoint('fetch-packages', { count: 50 })
 *   // ... do work ...
 *   perfCheckpoint('analyze-issues', { issueCount: 10 })
 *   perfCheckpoint('end-scan')
 *
 * @param checkpoint - Name of the checkpoint.
 * @param metadata - Optional metadata.
 */
export function perfCheckpoint(
  checkpoint: string,
  metadata?: Record<string, unknown>,
): void {
  if (!isPerfEnabled()) {
    return
  }

  const metric: PerformanceMetrics = {
    operation: `checkpoint:${checkpoint}`,
    duration: 0,
    timestamp: DateNow(),
    ...(metadata ? { metadata } : {}),
  }

  performanceMetrics.push(metric)
  debugLog(`[perf] [CHECKPOINT] ${checkpoint}`)
}

/**
 * Start a performance timer for an operation. Returns a stop function that
 * records the duration.
 *
 * @example
 *   import { perfTimer } from '@socketsecurity/lib/perf/timer'
 *
 *   const stop = perfTimer('api-call')
 *   await fetchData()
 *   stop({ endpoint: '/npm/lodash/score' })
 *
 * @param operation - Name of the operation being timed.
 * @param metadata - Optional metadata to attach to the metric.
 *
 * @returns Stop function that completes the timing
 */
export function perfTimer(
  operation: string,
  metadata?: Record<string, unknown>,
): (additionalMetadata?: Record<string, unknown>) => void {
  if (!isPerfEnabled()) {
    // No-op if perf tracking disabled
    return () => {}
  }

  const start = performance.now()
  debugLog(`[perf] [START] ${operation}`)

  return (additionalMetadata?: Record<string, unknown>) => {
    const duration = performance.now() - start
    const metric: PerformanceMetrics = {
      operation,
      // Round to 2 decimals
      duration: MathRound(duration * 100) / 100,
      timestamp: DateNow(),
      metadata: { ...metadata, ...additionalMetadata },
    }

    performanceMetrics.push(metric)
    debugLog(`[perf] [END] ${operation} - ${metric.duration}ms`)
  }
}

/**
 * Track memory usage at a specific point. Only available when DEBUG=perf is
 * enabled.
 *
 * @example
 *   import { trackMemory } from '@socketsecurity/lib/perf/timer'
 *
 *   const memBefore = trackMemory('before-operation')
 *   await heavyOperation()
 *   const memAfter = trackMemory('after-operation')
 *   console.log(`Memory increased by ${memAfter - memBefore}MB`)
 *
 * @param label - Label for this memory snapshot.
 *
 * @returns Memory usage in MB
 */
export function trackMemory(label: string): number {
  if (!isPerfEnabled()) {
    return 0
  }

  const usage = process.memoryUsage()
  const heapUsedMB = MathRound((usage.heapUsed / 1024 / 1024) * 100) / 100

  debugLog(`[perf] [MEMORY] ${label}: ${heapUsedMB}MB heap used`)

  const metric: PerformanceMetrics = {
    operation: `checkpoint:memory:${label}`,
    duration: 0,
    timestamp: DateNow(),
    metadata: {
      heapUsed: heapUsedMB,
      heapTotal: MathRound((usage.heapTotal / 1024 / 1024) * 100) / 100,
      external: MathRound((usage.external / 1024 / 1024) * 100) / 100,
    },
  }

  performanceMetrics.push(metric)

  return heapUsedMB
}
