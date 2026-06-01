/**
 * @file Unit tests for retry option normalizers. Tests the configuration
 *   resolvers that back the retry helpers:
 *
 *   - normalizeRetryOptions() retry option normalizer
 *   - resolveRetryOptions() retry configuration resolver
 *
 *   The pRetry() behavior tests live in promises.test.mts; iteration option
 *   normalization (normalizeIterationOptions) lives in promises-iterate.test.mts.
 */

import {
  normalizeRetryOptions,
  resolveRetryOptions,
} from '../../src/promises/options'
import { describe, expect, it, vi } from 'vitest'

describe('promises', () => {
  describe('resolveRetryOptions', () => {
    it('should resolve number to retries option', () => {
      const options = resolveRetryOptions(3)
      expect(options.retries).toBe(3)
      expect(options.baseDelayMs).toBe(200)
      expect(options.maxDelayMs).toBe(10_000)
    })

    it('should merge provided options with defaults', () => {
      const options = resolveRetryOptions({ retries: 5, baseDelayMs: 100 })
      expect(options.retries).toBe(5)
      expect(options.baseDelayMs).toBe(100)
      expect(options.maxDelayMs).toBe(10_000)
    })

    it('should return defaults when no options provided', () => {
      const options = resolveRetryOptions()
      expect(options.retries).toBe(0)
      expect(options.baseDelayMs).toBe(200)
      expect(options.maxDelayMs).toBe(10_000)
    })
  })

  describe('normalizeRetryOptions', () => {
    it('should normalize retry options with defaults', () => {
      const options = normalizeRetryOptions(3)
      expect(options.retries).toBe(3)
      expect(options.backoffFactor).toBe(2)
      expect(options.baseDelayMs).toBe(200)
      expect(options.maxDelayMs).toBe(10_000)
      expect(options.jitter).toBe(true)
    })

    it('should use custom backoff factor', () => {
      const options = normalizeRetryOptions({ retries: 3, backoffFactor: 3 })
      expect(options.backoffFactor).toBe(3)
    })

    it('should include all retry options', () => {
      const onRetry = vi.fn()
      const options = normalizeRetryOptions({
        onRetry,
        onRetryCancelOnFalse: true,
        onRetryRethrow: true,
        retries: 3,
      })
      expect(options.onRetry).toBe(onRetry)
      expect(options.onRetryCancelOnFalse).toBe(true)
      expect(options.onRetryRethrow).toBe(true)
    })
  })

  describe('normalizeRetryOptions - Additional Options', () => {
    it('should include args in normalized options', () => {
      const args = [1, 2, 3]
      const options = normalizeRetryOptions({ retries: 3, args })
      expect(options.args).toEqual(args)
    })

    it('should default args to empty array', () => {
      const options = normalizeRetryOptions(3)
      expect(options.args).toEqual([])
    })

    it('should default jitter to true', () => {
      const options = normalizeRetryOptions(3)
      expect(options.jitter).toBe(true)
    })

    it('should allow jitter to be false', () => {
      const options = normalizeRetryOptions({ retries: 3, jitter: false })
      expect(options.jitter).toBe(false)
    })
  })

  describe('resolveRetryOptions - Edge Cases', () => {
    it('should handle undefined options', () => {
      const options = resolveRetryOptions(undefined)
      expect(options.retries).toBe(0)
      expect(options.baseDelayMs).toBe(200)
      expect(options.maxDelayMs).toBe(10_000)
      expect(options.backoffFactor).toBe(2)
    })

    it('should preserve custom options', () => {
      const onRetry = vi.fn()
      const options = resolveRetryOptions({
        retries: 5,
        baseDelayMs: 300,
        maxDelayMs: 15_000,
        backoffFactor: 3,
        onRetry,
        onRetryCancelOnFalse: true,
        onRetryRethrow: true,
      })
      expect(options.retries).toBe(5)
      expect(options.baseDelayMs).toBe(300)
      expect(options.maxDelayMs).toBe(15_000)
      expect(options.backoffFactor).toBe(3)
      expect(options.onRetry).toBe(onRetry)
      expect(options.onRetryCancelOnFalse).toBe(true)
      expect(options.onRetryRethrow).toBe(true)
    })

    it('should handle zero retries', () => {
      const options = resolveRetryOptions(0)
      expect(options.retries).toBe(0)
    })
  })
})
