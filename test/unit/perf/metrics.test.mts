import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetEnv, setEnv } from '../../../src/env/rewire'
import {
  clearPerformanceMetrics,
  getPerformanceMetrics,
} from '../../../src/perf/metrics'
import { perfTimer } from '../../../src/perf/timer'

describe.sequential('perf/metrics', () => {
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
