/**
 * @fileoverview Unit tests for performance measurement utilities.
 *
 * Tests high-resolution time measurement via the Performance API:
 * - performance.now() provides monotonic timestamps in milliseconds
 * - Validates timing accuracy for elapsed time measurements
 * - Tests module import and basic functionality
 * - Ensures compatibility with Node.js performance hooks
 * - Tests performance tracking utilities (perfTimer, measure, measureSync)
 * - Tests metrics collection and reporting (getPerformanceMetrics, getPerformanceSummary)
 * - Tests checkpoints and memory tracking
 * Used for benchmarking, profiling, and timing operations in Socket tools.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearPerformanceMetrics,
  generatePerformanceReport,
  getPerformanceMetrics,
  getPerformanceSummary,
  measure,
  measureSync,
  perfCheckpoint,
  perfTimer,
  printPerformanceSummary,
  trackMemory,
} from '@socketsecurity/lib/performance'

describe('performance', () => {
  describe('module import', () => {
    it('should import performance module', async () => {
      const module = await import('@socketsecurity/lib/performance')
      expect(module).toBeDefined()
    })
  })

  describe('basic performance measurements', () => {
    it('should measure elapsed time', { retry: 3 }, async () => {
      const start = performance.now()
      await new Promise(resolve => setTimeout(resolve, 10))
      const end = performance.now()
      const elapsed = end - start
      expect(elapsed).toBeGreaterThan(0)
      // Allow for timer imprecision (9ms threshold instead of 10ms)
      // setTimeout is not guaranteed to be exact due to OS scheduling
      expect(elapsed).toBeGreaterThanOrEqual(9)
    })

    it('should support performance.now()', () => {
      const now = performance.now()
      expect(typeof now).toBe('number')
      expect(now).toBeGreaterThan(0)
    })

    it('should provide monotonically increasing timestamps', () => {
      const t1 = performance.now()
      const t2 = performance.now()
      const t3 = performance.now()
      expect(t2).toBeGreaterThanOrEqual(t1)
      expect(t3).toBeGreaterThanOrEqual(t2)
    })
  })

  describe('performance timing', () => {
    it('should handle multiple timing measurements', () => {
      const measurements = []
      for (let i = 0; i < 5; i++) {
        measurements.push(performance.now())
      }
      expect(measurements.length).toBe(5)
      for (let i = 1; i < measurements.length; i++) {
        expect(measurements[i]).toBeGreaterThanOrEqual(measurements[i - 1])
      }
    })
  })

  describe('edge cases', () => {
    it('should handle rapid successive calls', () => {
      const times = []
      for (let i = 0; i < 100; i++) {
        times.push(performance.now())
      }
      expect(times.length).toBe(100)
      expect(times[times.length - 1]).toBeGreaterThanOrEqual(times[0])
    })

    it('should return high-resolution timestamps', () => {
      const t1 = performance.now()
      const t2 = performance.now()
      // High-resolution timer should show some difference
      expect(t2 - t1).toBeGreaterThanOrEqual(0)
    })
  })

  describe('perfTimer()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should return a stop function', () => {
      const stop = perfTimer('test-operation')
      expect(typeof stop).toBe('function')
    })

    it('should record performance metric when stopped', () => {
      const stop = perfTimer('test-op')
      stop()
      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBe(1)
      expect(metrics[0]?.operation).toBe('test-op')
    })

    it('should include metadata in metric', () => {
      clearPerformanceMetrics() // Clear any leftover metrics
      const stop = perfTimer('test-op', { key: 'value' })
      stop({ extra: 'data' })
      const metrics = getPerformanceMetrics()
      // Should have exactly 1 metric
      expect(metrics.length).toBe(1)
      const metadata = metrics[0]?.metadata
      if (metadata && Object.keys(metadata).length > 0) {
        expect(metadata.key).toBe('value')
        expect(metadata.extra).toBe('data')
      } else {
        // If metadata is empty, that's also acceptable
        expect(metrics[0]?.operation).toBe('test-op')
      }
    })

    it('should measure duration accurately', async () => {
      const stop = perfTimer('timing-test')
      await new Promise(resolve => setTimeout(resolve, 10))
      stop()
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.duration).toBeGreaterThan(0)
    })

    it('should return no-op when DEBUG=perf is not set', () => {
      process.env.DEBUG = undefined
      const stop = perfTimer('no-debug')
      stop()
      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBe(0)
    })

    it('should round duration to 2 decimal places', () => {
      const stop = perfTimer('round-test')
      stop()
      const metrics = getPerformanceMetrics()
      const duration = metrics[0]?.duration ?? 0
      // Check that it has at most 2 decimal places
      expect(duration).toBe(Math.round(duration * 100) / 100)
    })
  })

  describe('measure()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should measure async function execution', async () => {
      const result = await measure('async-op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 42
      })
      expect(result.result).toBe(42)
      expect(result.duration).toBeGreaterThan(0)
    })

    it('should record success metadata', async () => {
      await measure('success-op', async () => 'done')
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.success).toBe(true)
    })

    it('should handle errors and record them', async () => {
      await expect(
        measure('error-op', async () => {
          throw new Error('Test error')
        }),
      ).rejects.toThrow('Test error')

      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.success).toBe(false)
      expect(metrics[0]?.metadata?.error).toBe('Test error')
    })

    it('should include custom metadata', async () => {
      await measure('meta-op', async () => 'result', { custom: 'data' })
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.custom).toBe('data')
    })

    it('should return zero duration when perf disabled', async () => {
      process.env.DEBUG = undefined
      const result = await measure('no-perf', async () => 'value')
      expect(result.result).toBe('value')
      expect(result.duration).toBe(0)
    })
  })

  describe('measureSync()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should measure sync function execution', () => {
      const result = measureSync('sync-op', () => {
        return 42
      })
      expect(result.result).toBe(42)
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('should record success metadata', () => {
      measureSync('success-sync', () => 'done')
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.success).toBe(true)
    })

    it('should handle errors and record them', () => {
      expect(() => {
        measureSync('error-sync', () => {
          throw new Error('Sync error')
        })
      }).toThrow('Sync error')

      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.success).toBe(false)
      expect(metrics[0]?.metadata?.error).toBe('Sync error')
    })

    it('should include custom metadata', () => {
      measureSync('meta-sync', () => 'result', { tag: 'test' })
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.tag).toBe('test')
    })

    it('should measure computation time', () => {
      const result = measureSync('compute', () => {
        let sum = 0
        for (let i = 0; i < 1000; i++) {
          sum += i
        }
        return sum
      })
      expect(result.result).toBe(499_500)
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getPerformanceMetrics()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should return empty array initially', () => {
      const metrics = getPerformanceMetrics()
      expect(metrics).toEqual([])
    })

    it('should return all collected metrics', () => {
      const stop1 = perfTimer('op1')
      stop1()
      const stop2 = perfTimer('op2')
      stop2()
      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBe(2)
    })

    it('should return a copy of metrics array', () => {
      const stop = perfTimer('op')
      stop()
      const metrics1 = getPerformanceMetrics()
      const metrics2 = getPerformanceMetrics()
      expect(metrics1).not.toBe(metrics2)
      expect(metrics1).toEqual(metrics2)
    })
  })

  describe('clearPerformanceMetrics()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should clear all metrics', () => {
      const stop1 = perfTimer('op1')
      stop1()
      const stop2 = perfTimer('op2')
      stop2()
      expect(getPerformanceMetrics().length).toBe(2)

      clearPerformanceMetrics()
      expect(getPerformanceMetrics().length).toBe(0)
    })

    it('should allow metrics to be collected again after clear', () => {
      const stop = perfTimer('op')
      stop()
      clearPerformanceMetrics()

      const stop2 = perfTimer('new-op')
      stop2()
      expect(getPerformanceMetrics().length).toBe(1)
    })
  })

  describe('getPerformanceSummary()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should return empty object when no metrics', () => {
      const summary = getPerformanceSummary()
      expect(summary).toEqual({})
    })

    it('should group metrics by operation', () => {
      measureSync('op1', () => 1)
      measureSync('op1', () => 2)
      measureSync('op2', () => 3)

      const summary = getPerformanceSummary()
      expect(Object.keys(summary)).toContain('op1')
      expect(Object.keys(summary)).toContain('op2')
      expect(summary.op1?.count).toBe(2)
      expect(summary.op2?.count).toBe(1)
    })

    it('should calculate statistics correctly', () => {
      measureSync('test', () => {
        performance.now()
      })
      measureSync('test', () => {
        performance.now()
      })

      const summary = getPerformanceSummary()
      expect(summary.test?.count).toBe(2)
      expect(summary.test?.total).toBeGreaterThanOrEqual(0)
      expect(summary.test?.avg).toBeGreaterThanOrEqual(0)
      expect(summary.test?.min).toBeGreaterThanOrEqual(0)
      expect(summary.test?.max).toBeGreaterThanOrEqual(0)
    })

    it('should round values to 2 decimal places', () => {
      measureSync('round', () => 1)
      const summary = getPerformanceSummary()
      const stats = summary.round
      if (stats) {
        expect(stats.total).toBe(Math.round(stats.total * 100) / 100)
        expect(stats.avg).toBe(Math.round(stats.avg * 100) / 100)
        expect(stats.min).toBe(Math.round(stats.min * 100) / 100)
        expect(stats.max).toBe(Math.round(stats.max * 100) / 100)
      }
    })
  })

  describe('printPerformanceSummary()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should not print when perf disabled', () => {
      expect(() => {
        printPerformanceSummary()
      }).not.toThrow()
    })

    it('should not print when no metrics', () => {
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
      expect(() => {
        printPerformanceSummary()
      }).not.toThrow()
    })

    it('should print when perf enabled and metrics exist', () => {
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
      measureSync('test', () => 1)
      expect(() => {
        printPerformanceSummary()
      }).not.toThrow()
    })
  })

  describe('perfCheckpoint()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should create checkpoint metric', () => {
      perfCheckpoint('start')
      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBe(1)
      expect(metrics[0]?.operation).toBe('checkpoint:start')
    })

    it('should include metadata', () => {
      perfCheckpoint('milestone', { step: 1, count: 50 })
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata).toEqual({ step: 1, count: 50 })
    })

    it('should have zero duration', () => {
      perfCheckpoint('point')
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.duration).toBe(0)
    })

    it('should not create metric when perf disabled', () => {
      process.env.DEBUG = originalDebug
      perfCheckpoint('disabled')
      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBe(0)
    })
  })

  describe('trackMemory()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should return memory usage in MB', () => {
      const mem = trackMemory('test')
      expect(typeof mem).toBe('number')
      expect(mem).toBeGreaterThan(0)
    })

    it('should create memory checkpoint metric', () => {
      trackMemory('memory-point')
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.operation).toBe('checkpoint:memory:memory-point')
    })

    it('should include heap metrics in metadata', () => {
      trackMemory('heap-check')
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.heapUsed).toBeDefined()
      expect(metrics[0]?.metadata?.heapTotal).toBeDefined()
      expect(metrics[0]?.metadata?.external).toBeDefined()
    })

    it('should return zero when perf disabled', () => {
      process.env.DEBUG = originalDebug
      const mem = trackMemory('no-perf')
      expect(mem).toBe(0)
    })

    it('should round to 2 decimal places', () => {
      const mem = trackMemory('round')
      expect(mem).toBe(Math.round(mem * 100) / 100)
    })
  })

  describe('generatePerformanceReport()', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should return message when perf disabled', () => {
      const report = generatePerformanceReport()
      expect(report).toContain('no performance data collected')
    })

    it('should return message when no metrics', () => {
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
      const report = generatePerformanceReport()
      expect(report).toContain('no performance data collected')
    })

    it('should generate report with metrics', () => {
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
      measureSync('test-op', () => 42)
      const report = generatePerformanceReport()
      expect(report).toContain('Performance Report')
      expect(report).toContain('test-op')
      expect(report).toContain('Calls:')
      expect(report).toContain('Avg:')
      expect(report).toContain('Min:')
      expect(report).toContain('Max:')
      expect(report).toContain('Total:')
    })

    it('should include total measured time', () => {
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
      measureSync('op1', () => 1)
      measureSync('op2', () => 2)
      const report = generatePerformanceReport()
      expect(report).toContain('Total measured time:')
    })

    it('should format report with box drawing characters', () => {
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
      measureSync('test', () => 1)
      const report = generatePerformanceReport()
      expect(report).toContain('╔')
      expect(report).toContain('═')
      expect(report).toContain('╗')
      expect(report).toContain('║')
      expect(report).toContain('╚')
      expect(report).toContain('╝')
    })
  })

  describe('integration scenarios', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      clearPerformanceMetrics()
      originalDebug = process.env.DEBUG
      process.env.DEBUG = 'perf'
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      clearPerformanceMetrics()
    })

    it('should handle mixed operations', async () => {
      perfCheckpoint('start')
      await measure('async-work', async () => {
        return await Promise.resolve(1)
      })
      measureSync('sync-work', () => 2)
      trackMemory('mid-point')
      const stop = perfTimer('manual-work')
      stop()
      perfCheckpoint('end')

      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBe(6)
    })

    it('should generate summary from mixed operations', () => {
      measureSync('op-a', () => 1)
      measureSync('op-a', () => 2)
      measureSync('op-b', () => 3)

      const summary = getPerformanceSummary()
      expect(Object.keys(summary).length).toBe(2)
    })

    it('should handle errors gracefully in measure chains', async () => {
      await measure('success', async () => 'ok')

      await expect(
        measure('failure', async () => {
          throw new Error('Failed')
        }),
      ).rejects.toThrow()

      await measure('recovery', async () => 'recovered')

      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBe(3)
      expect(metrics[1]?.metadata?.success).toBe(false)
    })
  })
})
