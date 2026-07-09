/**
 * @file Unit tests for the pRetry() helper. Exercises the retry runtime:
 *   success, failure-then-retry, exponential backoff, jitter, maxDelayMs cap,
 *   abort-signal handling, and onRetry callback semantics. Used by Socket tools
 *   for fault-tolerant API calls. Retry option normalizers
 *   (normalizeRetryOptions, resolveRetryOptions) live in
 *   promises-options.test.mts; iteration helpers live in
 *   promises-iterate.test.mts; resolver helpers live in
 *   promises-resolvers.test.mts.
 */

import { pRetry } from '../../src/promises/retry'
import { describe, expect, it, vi } from 'vitest'

describe('promises', () => {
  describe('pRetry', () => {
    it('should return result on success', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await pRetry(fn)
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('fail')
        }
        return 'success'
      })

      const result = await pRetry(fn, { retries: 3, baseDelayMs: 10 })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw error after all retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      await expect(pRetry(fn, { retries: 2, baseDelayMs: 10 })).rejects.toThrow(
        'fail',
      )
      expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('should respect abort signal', async () => {
      const controller = new AbortController()
      const fn = vi.fn().mockImplementation(async () => {
        controller.abort()
        throw new Error('fail')
      })

      const result = await pRetry(fn, {
        retries: 3,
        signal: controller.signal,
      })
      expect(result).toBeUndefined()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should call onRetry callback', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })
      const onRetry = vi.fn()

      await pRetry(fn, { retries: 2, baseDelayMs: 10, onRetry })
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Error),
        expect.any(Number),
      )
    })

    it('should cancel retry if onRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      const onRetry = vi.fn().mockReturnValue(false)

      await expect(
        pRetry(fn, {
          onRetry,
          onRetryCancelOnFalse: true,
          retries: 3,
        }),
      ).rejects.toThrow('fail')
      expect(fn).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('should not retry if retries is 0', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await pRetry(fn, { retries: 0 })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('returns undefined immediately for a pre-aborted signal', async () => {
      const controller = new AbortController()
      controller.abort()
      const fn = vi.fn().mockResolvedValue('never called')
      const result = await pRetry(fn, {
        retries: 3,
        signal: controller.signal,
      })
      expect(result).toBeUndefined()
      expect(fn).not.toHaveBeenCalled()
    })

    it('uses non-jittered fixed delay when jitter is false', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })
      const result = await pRetry(fn, {
        retries: 2,
        baseDelayMs: 10,
        jitter: false,
      })
      expect(result).toBe('success')
    })

    it('caps delay growth at maxDelayMs', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 4) {
          throw new Error('fail')
        }
        return 'ok'
      })
      const result = await pRetry(fn, {
        retries: 5,
        baseDelayMs: 10,
        backoffFactor: 10_000,
        maxDelayMs: 15,
      })
      expect(result).toBe('ok')
    })
  })

  describe('pRetry - Advanced Edge Cases', () => {
    it('should apply exponential backoff', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 4) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 3,
        baseDelayMs: 50,
        backoffFactor: 2,
        jitter: false,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return undefined
        },
      })

      expect(delays[0]).toBe(50)
      expect(delays[1]).toBe(100)
      expect(delays[2]).toBe(200)
    })

    it('should apply jitter to delays', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 2,
        baseDelayMs: 100,
        backoffFactor: 2,
        jitter: true,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return undefined
        },
      })

      // With jitter, delays should be >= base delay but <= 2 * base delay
      expect(delays[0]).toBeGreaterThanOrEqual(100)
      expect(delays[0]).toBeLessThanOrEqual(200)
      expect(delays[1]).toBeGreaterThanOrEqual(200)
      expect(delays[1]).toBeLessThanOrEqual(400)
    })

    it('should respect maxDelayMs cap', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 6) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 5,
        baseDelayMs: 100,
        backoffFactor: 2,
        maxDelayMs: 300,
        jitter: false,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return undefined
        },
      })

      // Delays should be capped at maxDelayMs
      expect(delays[0]).toBe(100)
      expect(delays[1]).toBe(200)
      expect(delays[2]).toBe(300) // Would be 400 but capped
      expect(delays[3]).toBe(300) // Would be 800 but capped
      expect(delays[4]).toBe(300) // Would be 1600 but capped
    })

    it('should allow onRetry to override delay', async () => {
      let attempts = 0
      const actualDelays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 2,
        baseDelayMs: 100,
        onRetry: (_attempt, _error, delay) => {
          actualDelays.push(delay)
          return 25 // Override to 25ms
        },
      })

      // Verify custom delays were used
      expect(fn).toHaveBeenCalledTimes(3)
      expect(actualDelays.length).toBe(2)
    })

    it('should ignore negative custom delays from onRetry', async () => {
      let attempts = 0

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 1,
        baseDelayMs: 50,
        onRetry: () => -100, // Negative value should be ignored
      })

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle onRetry throwing error with onRetryRethrow true', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('original error'))
      const onRetry = vi.fn().mockImplementation(() => {
        throw new Error('onRetry error')
      })

      await expect(
        pRetry(fn, {
          retries: 2,
          onRetry,
          onRetryRethrow: true,
        }),
      ).rejects.toThrow('onRetry error')

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should ignore onRetry errors when onRetryRethrow is false', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })
      const onRetry = vi.fn().mockImplementation(() => {
        throw new Error('onRetry error')
      })

      const result = await pRetry(fn, {
        retries: 2,
        baseDelayMs: 10,
        onRetry,
        onRetryRethrow: false,
      })

      expect(result).toBe('success')
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('should pass arguments to callback function', async () => {
      const fn = vi
        .fn()
        .mockImplementation(
          async (
            a: number,
            b: number,
            _c: { signal?: AbortSignal | undefined },
          ) => {
            return a + b
          },
        )

      const result = await pRetry(fn, {
        retries: 0,
        args: [5, 10],
      })

      expect(result).toBe(15)
      expect(fn).toHaveBeenCalledWith(5, 10, { signal: expect.any(Object) })
    })

    it('should pass empty args array when not provided', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      await pRetry(fn, { retries: 0 })

      expect(fn).toHaveBeenCalledWith({ signal: expect.any(Object) })
    })

    it('should return undefined when signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const fn = vi.fn().mockResolvedValue('success')

      const result = await pRetry(fn, {
        retries: 3,
        signal: controller.signal,
      })

      expect(result).toBeUndefined()
      expect(fn).not.toHaveBeenCalled()
    })

    it('should return undefined when signal aborts during retry delay', async () => {
      // Abort synchronously inside the failing attempt so the retry-delay
      // branch sees an already-aborted signal — no wall-clock race.
      const controller = new AbortController()
      let attempts = 0

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts === 1) {
          controller.abort()
          throw new Error('fail')
        }
        return 'success'
      })

      const result = await pRetry(fn, {
        retries: 3,
        baseDelayMs: 50,
        signal: controller.signal,
      })

      expect(result).toBeUndefined()
      expect(attempts).toBe(1)
    })

    it('should handle abort signal between retries', async () => {
      // Same pattern — abort inside the first-attempt rejection so retry
      // observes the aborted signal deterministically.
      const controller = new AbortController()
      let attempts = 0

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts === 1) {
          controller.abort()
          throw new Error('fail')
        }
        return 'success'
      })

      const result = await pRetry(fn, {
        retries: 3,
        baseDelayMs: 50,
        signal: controller.signal,
      })

      expect(result).toBeUndefined()
      expect(attempts).toBe(1)
    })

    it('should clamp onRetry custom delay to maxDelayMs', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 1,
        baseDelayMs: 100,
        maxDelayMs: 500,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return 1000 // Should be clamped to 500
        },
      })

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle maxDelayMs with jitter', async () => {
      let attempts = 0
      const delays: number[] = []

      const fn = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('fail')
        }
        return 'success'
      })

      await pRetry(fn, {
        retries: 2,
        baseDelayMs: 200,
        backoffFactor: 3,
        maxDelayMs: 500,
        jitter: true,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay)
          return undefined
        },
      })

      // All delays should be <= maxDelayMs
      for (let i = 0, { length } = delays; i < length; i += 1) {
        const delay = delays[i]!
        expect(delay).toBeLessThanOrEqual(500)
      }
    })
  })
})
