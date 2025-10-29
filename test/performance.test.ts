/**
 * @fileoverview Unit tests for performance monitoring utilities.
 */

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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('performance', () => {
  const originalDebug = process.env['DEBUG']

  beforeEach(() => {
    // Enable perf tracking for tests
    process.env['DEBUG'] = 'perf'
    clearPerformanceMetrics()
  })

  afterEach(() => {
    // Restore original DEBUG env
    if (originalDebug !== undefined) {
      process.env['DEBUG'] = originalDebug
    } else {
      delete process.env['DEBUG']
    }
    clearPerformanceMetrics()
  })

  describe('perfTimer', () => {
    it('should create a timer and record duration', async () => {
      const stop = perfTimer('test-operation')
      await new Promise(resolve => setTimeout(resolve, 50))
      stop()

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0]?.operation).toBe('test-operation')
      expect(metrics[0]?.duration).toBeGreaterThanOrEqual(45)
    })

    it('should record metadata', () => {
      const stop = perfTimer('test-op', { foo: 'bar' })
      stop({ baz: 'qux' })

      const metrics = getPerformanceMetrics()
      expect(metrics[0]?.metadata).toEqual({ foo: 'bar', baz: 'qux' })
    })

    it('should be no-op when DEBUG=perf not set', async () => {
      delete process.env['DEBUG']

      const stop = perfTimer('test-operation')
      await new Promise(resolve => setTimeout(resolve, 10))
      stop()

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(0)
    })
  })

  describe('measure', () => {
    it('should measure async function duration', async () => {
      const { result, duration } = await measure('async-op', async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return 'test-result'
      })

      expect(result).toBe('test-result')
      expect(duration).toBeGreaterThanOrEqual(45)

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0]?.metadata?.success).toBe(true)
    })

    it('should record error metadata on failure', async () => {
      await expect(
        measure('failing-op', async () => {
          throw new Error('Test error')
        }),
      ).rejects.toThrow('Test error')

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0]?.metadata?.success).toBe(false)
      expect(metrics[0]?.metadata?.error).toBe('Test error')
    })
  })

  describe('measureSync', () => {
    it('should measure sync function duration', () => {
      const { result, duration } = measureSync('sync-op', () => {
        // Simulate some work
        let sum = 0
        for (let i = 0; i < 1000; i++) {
          sum += i
        }
        return sum
      })

      expect(result).toBe(499500)
      expect(duration).toBeGreaterThanOrEqual(0)

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0]?.metadata?.success).toBe(true)
    })

    it('should record error metadata on failure', () => {
      expect(() =>
        measureSync('failing-sync-op', () => {
          throw new Error('Sync error')
        }),
      ).toThrow('Sync error')

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0]?.metadata?.success).toBe(false)
      expect(metrics[0]?.metadata?.error).toBe('Sync error')
    })
  })

  describe('getPerformanceMetrics', () => {
    it('should return all collected metrics', () => {
      perfTimer('op1')()
      perfTimer('op2')()

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(2)
      expect(metrics[0]?.operation).toBe('op1')
      expect(metrics[1]?.operation).toBe('op2')
    })

    it('should return copy of metrics', () => {
      perfTimer('op1')()

      const metrics1 = getPerformanceMetrics()
      const metrics2 = getPerformanceMetrics()

      expect(metrics1).not.toBe(metrics2)
      expect(metrics1).toEqual(metrics2)
    })
  })

  describe('clearPerformanceMetrics', () => {
    it('should clear all metrics', () => {
      perfTimer('op1')()
      perfTimer('op2')()

      expect(getPerformanceMetrics()).toHaveLength(2)

      clearPerformanceMetrics()

      expect(getPerformanceMetrics()).toHaveLength(0)
    })
  })

  describe('getPerformanceSummary', () => {
    it('should group metrics by operation', () => {
      perfTimer('op1')()
      perfTimer('op1')()
      perfTimer('op2')()

      const summary = getPerformanceSummary()

      expect(summary['op1']?.count).toBe(2)
      expect(summary['op2']?.count).toBe(1)
    })

    it('should calculate statistics', async () => {
      const stop1 = perfTimer('op')
      await new Promise(resolve => setTimeout(resolve, 50))
      stop1()

      const stop2 = perfTimer('op')
      await new Promise(resolve => setTimeout(resolve, 100))
      stop2()

      const summary = getPerformanceSummary()
      const stats = summary['op']

      expect(stats?.count).toBe(2)
      expect(stats?.total).toBeGreaterThanOrEqual(145)
      expect(stats?.avg).toBeGreaterThanOrEqual(70)
      expect(stats?.min).toBeGreaterThanOrEqual(45)
      expect(stats?.max).toBeGreaterThanOrEqual(95)
    })

    it('should return empty object when no metrics', () => {
      const summary = getPerformanceSummary()
      expect(Object.keys(summary)).toHaveLength(0)
    })
  })

  describe('printPerformanceSummary', () => {
    it('should not throw with metrics', () => {
      perfTimer('op1')()
      expect(() => printPerformanceSummary()).not.toThrow()
    })

    it('should not throw without metrics', () => {
      expect(() => printPerformanceSummary()).not.toThrow()
    })

    it('should not print when DEBUG=perf not set', () => {
      delete process.env['DEBUG']
      perfTimer('op1')()
      expect(() => printPerformanceSummary()).not.toThrow()
    })
  })

  describe('perfCheckpoint', () => {
    it('should record checkpoint', () => {
      perfCheckpoint('start')
      perfCheckpoint('middle', { step: 1 })
      perfCheckpoint('end')

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(3)
      expect(metrics[0]?.operation).toBe('checkpoint:start')
      expect(metrics[1]?.operation).toBe('checkpoint:middle')
      expect(metrics[1]?.metadata?.step).toBe(1)
      expect(metrics[2]?.operation).toBe('checkpoint:end')
    })

    it('should be no-op when DEBUG=perf not set', () => {
      delete process.env['DEBUG']

      perfCheckpoint('test')

      expect(getPerformanceMetrics()).toHaveLength(0)
    })
  })

  describe('trackMemory', () => {
    it('should track memory usage', () => {
      const heapUsed = trackMemory('test-memory')

      expect(heapUsed).toBeGreaterThan(0)

      const metrics = getPerformanceMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0]?.operation).toBe('checkpoint:memory:test-memory')
      expect(metrics[0]?.metadata?.heapUsed).toBeGreaterThan(0)
      expect(metrics[0]?.metadata?.heapTotal).toBeGreaterThan(0)
    })

    it('should return 0 when DEBUG=perf not set', () => {
      delete process.env['DEBUG']

      const heapUsed = trackMemory('test')

      expect(heapUsed).toBe(0)
      expect(getPerformanceMetrics()).toHaveLength(0)
    })
  })

  describe('generatePerformanceReport', () => {
    it('should generate formatted report', () => {
      perfTimer('op1')()
      perfTimer('op2')()

      const report = generatePerformanceReport()

      expect(report).toContain('Performance Report')
      expect(report).toContain('op1:')
      expect(report).toContain('op2:')
      expect(report).toContain('Calls:')
      expect(report).toContain('Avg:')
      expect(report).toContain('Total measured time:')
    })

    it('should return message when no data', () => {
      const report = generatePerformanceReport()
      expect(report).toContain('no performance data collected')
    })

    it('should return message when DEBUG=perf not set', () => {
      delete process.env['DEBUG']

      perfTimer('op1')()

      const report = generatePerformanceReport()
      expect(report).toContain('no performance data collected')
    })
  })

  describe('integration', () => {
    it('should track multiple operations and generate report', async () => {
      // Simulate a workflow
      const stop1 = perfTimer('load-config')
      await new Promise(resolve => setTimeout(resolve, 20))
      stop1()

      perfCheckpoint('config-loaded')

      await measure('process-data', async () => {
        await new Promise(resolve => setTimeout(resolve, 30))
        return 'data'
      })

      const { result } = measureSync('transform', () => 'transformed')

      trackMemory('after-transform')

      // Verify metrics collected
      const metrics = getPerformanceMetrics()
      expect(metrics.length).toBeGreaterThanOrEqual(5)

      // Verify summary
      const summary = getPerformanceSummary()
      expect(summary['load-config']).toBeDefined()
      expect(summary['process-data']).toBeDefined()
      expect(summary['transform']).toBeDefined()

      // Verify report generation
      const report = generatePerformanceReport()
      expect(report).toContain('load-config')
      expect(report).toContain('process-data')
      expect(report).toContain('transform')
      expect(result).toBe('transformed')
    })
  })
})
