/**
 * @file Unit tests for the performance reporting and summary utilities:
 *
 *   - Summaries (getPerformanceSummary, printPerformanceSummary)
 *   - Checkpoints and memory tracking (perfCheckpoint, trackMemory)
 *   - Report generation (generatePerformanceReport)
 *   - End-to-end integration scenarios
 *
 *   The timer and metrics-collection primitives (perfTimer, measure,
 *   measureSync, getPerformanceMetrics, clearPerformanceMetrics) are covered in
 *   perf.test.mts. The raw Performance API is covered in
 *   perf-performance-api.test.mts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetEnv, setEnv } from '../../src/env/rewire'
import {
  clearPerformanceMetrics,
  getPerformanceMetrics,
  getPerformanceSummary,
} from '../../src/perf/metrics'
import {
  generatePerformanceReport,
  printPerformanceSummary,
} from '../../src/perf/report'
import {
  measure,
  measureSync,
  perfCheckpoint,
  perfTimer,
  trackMemory,
} from '../../src/perf/timer'

// The perf module shares a module-scoped `performanceMetrics` array,
// so concurrent tests would race each other when pushing / clearing.
// vitest.config.mts sets `sequence.concurrent: !CI`, so locally tests
// in this file would run in parallel. Force sequential execution to
// keep `clearPerformanceMetrics()` + `getPerformanceMetrics()[0]`
// assertions deterministic.
describe.sequential('performance reporting', () => {
  describe('getPerformanceSummary()', () => {
    beforeEach(() => {
      clearPerformanceMetrics()
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
      expect(summary['op1']?.count).toBe(2)
      expect(summary['op2']?.count).toBe(1)
    })

    it('should calculate statistics correctly', () => {
      measureSync('test', () => {
        performance.now()
      })
      measureSync('test', () => {
        performance.now()
      })

      const summary = getPerformanceSummary()
      expect(summary['test']?.count).toBe(2)
      expect(summary['test']?.total).toBeGreaterThanOrEqual(0)
      expect(summary['test']?.avg).toBeGreaterThanOrEqual(0)
      expect(summary['test']?.min).toBeGreaterThanOrEqual(0)
      expect(summary['test']?.max).toBeGreaterThanOrEqual(0)
    })

    it('should round values to 2 decimal places', () => {
      measureSync('round', () => 1)
      const summary = getPerformanceSummary()
      const stats = summary['round']
      if (stats) {
        expect(stats.total).toBe(Math.round(stats.total * 100) / 100)
        expect(stats.avg).toBe(Math.round(stats.avg * 100) / 100)
        expect(stats.min).toBe(Math.round(stats.min * 100) / 100)
        expect(stats.max).toBe(Math.round(stats.max * 100) / 100)
      }
    })
  })

  describe('printPerformanceSummary()', () => {
    beforeEach(() => {
      clearPerformanceMetrics()
    })

    afterEach(() => {
      resetEnv()
      clearPerformanceMetrics()
    })

    it('should not print when perf disabled', () => {
      setEnv('DEBUG', undefined)
      expect(() => {
        printPerformanceSummary()
      }).not.toThrow()
    })

    it('should not print when no metrics', () => {
      setEnv('DEBUG', 'perf')
      expect(() => {
        printPerformanceSummary()
      }).not.toThrow()
    })

    it('should print when perf enabled and metrics exist', () => {
      setEnv('DEBUG', 'perf')
      measureSync('test', () => 1)
      expect(() => {
        printPerformanceSummary()
      }).not.toThrow()
    })
  })

  describe('perfCheckpoint()', () => {
    beforeEach(() => {
      clearPerformanceMetrics()
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
      setEnv('DEBUG', undefined)
      perfCheckpoint('disabled')
      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBe(0)
    })
  })

  describe('trackMemory()', () => {
    beforeEach(() => {
      clearPerformanceMetrics()
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
      expect(metrics[0]?.metadata?.['heapUsed']).toBeDefined()
      expect(metrics[0]?.metadata?.['heapTotal']).toBeDefined()
      expect(metrics[0]?.metadata?.['external']).toBeDefined()
    })

    it('should return zero when perf disabled', () => {
      setEnv('DEBUG', undefined)
      const mem = trackMemory('no-perf')
      expect(mem).toBe(0)
    })

    it('should round to 2 decimal places', () => {
      const mem = trackMemory('round')
      expect(mem).toBe(Math.round(mem * 100) / 100)
    })
  })

  describe('generatePerformanceReport()', () => {
    beforeEach(() => {
      clearPerformanceMetrics()
    })

    afterEach(() => {
      resetEnv()
      clearPerformanceMetrics()
    })

    it('should return message when perf disabled', () => {
      setEnv('DEBUG', undefined)
      const report = generatePerformanceReport()
      expect(report).toContain('no performance data collected')
    })

    it('should return message when no metrics', () => {
      setEnv('DEBUG', 'perf')
      const report = generatePerformanceReport()
      expect(report).toContain('no performance data collected')
    })

    it('should generate report with metrics', () => {
      setEnv('DEBUG', 'perf')
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
      setEnv('DEBUG', 'perf')
      measureSync('op1', () => 1)
      measureSync('op2', () => 2)
      const report = generatePerformanceReport()
      expect(report).toContain('Total measured time:')
    })

    it('should format report with box drawing characters', () => {
      setEnv('DEBUG', 'perf')
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
    beforeEach(() => {
      clearPerformanceMetrics()
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
      expect(metrics[1]?.metadata?.['success']).toBe(false)
    })
  })
})
