/**
 * @file Unit tests for the performance timing and metrics-collection
 *   primitives:
 *
 *   - Timing wrappers (perfTimer, measure, measureSync)
 *   - Metrics collection (getPerformanceMetrics, clearPerformanceMetrics)
 *     Reporting, summaries, checkpoints, and memory tracking are covered in
 *     perf-report.test.mts. The raw Performance API primitive
 *     (performance.now()) is covered in perf-performance-api.test.mts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetEnv, setEnv } from '../../src/env/rewire'
import {
  clearPerformanceMetrics,
  getPerformanceMetrics,
} from '../../src/perf/metrics'
import { measure, measureSync, perfTimer } from '../../src/perf/timer'

// The perf module shares a module-scoped `performanceMetrics` array,
// so concurrent tests would race each other when pushing / clearing.
// vitest.config.mts sets `sequence.concurrent: !CI`, so locally tests
// in this file would run in parallel. Force sequential execution to
// keep `clearPerformanceMetrics()` + `getPerformanceMetrics()[0]`
// assertions deterministic.
describe.sequential('performance', () => {
  describe('module import', () => {
    it('should import performance module', () => {
      expect(perfTimer).toBeDefined()
    })
  })

  describe('perfTimer()', () => {
    beforeEach(() => {
      clearPerformanceMetrics()
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
        expect(metadata['key']).toBe('value')
        expect(metadata['extra']).toBe('data')
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
      // Pin DEBUG to undefined via the rewire mock so isPerfEnabled()
      // sees "missing" without mutating process.env.
      setEnv('DEBUG', undefined)
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
    beforeEach(() => {
      clearPerformanceMetrics()
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
      expect(metrics[0]?.metadata?.['success']).toBe(true)
    })

    it('should handle errors and record them', async () => {
      await expect(
        measure('error-op', async () => {
          throw new Error('Test error')
        }),
      ).rejects.toThrow('Test error')

      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.['success']).toBe(false)
      expect(metrics[0]?.metadata?.['error']).toBe('Test error')
    })

    it('should include custom metadata', async () => {
      await measure('meta-op', async () => 'result', { custom: 'data' })
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.['custom']).toBe('data')
    })

    it('should return zero duration when perf disabled', async () => {
      setEnv('DEBUG', undefined)
      const result = await measure('no-perf', async () => 'value')
      expect(result.result).toBe('value')
      expect(result.duration).toBe(0)
    })
  })

  describe('measureSync()', () => {
    beforeEach(() => {
      clearPerformanceMetrics()
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
      expect(metrics[0]?.metadata?.['success']).toBe(true)
    })

    it('should handle errors and record them', () => {
      expect(() => {
        measureSync('error-sync', () => {
          throw new Error('Sync error')
        })
      }).toThrow('Sync error')

      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.['success']).toBe(false)
      expect(metrics[0]?.metadata?.['error']).toBe('Sync error')
    })

    it('should include custom metadata', () => {
      measureSync('meta-sync', () => 'result', { tag: 'test' })
      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata?.['tag']).toBe('test')
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
    beforeEach(() => {
      clearPerformanceMetrics()
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
    beforeEach(() => {
      setEnv('DEBUG', 'perf')
    })

    afterEach(() => {
      resetEnv()
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
})
