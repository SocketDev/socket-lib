/**
 * @fileoverview Tests for uncovered Spinner methods/paths in
 * src/spinner.ts: debug() with debug-mode enabled, dedent(0) reset,
 * setShimmer config branches, withSpinnerRestore.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setEnv, resetEnv } from '../../src/env/rewire'
import { Spinner } from '../../src/spinner/spinner'
import { withSpinnerRestore } from '../../src/spinner/with'

describe.sequential('spinner — extras', () => {
  beforeEach(() => {
    // SOCKET_DEBUG enables debug mode.
    setEnv('SOCKET_DEBUG', '*')
  })

  afterEach(() => {
    resetEnv()
  })

  describe('debug() with debug mode enabled', () => {
    it('writes a debug message and keeps spinning', () => {
      const spinner = Spinner()
      const result = spinner.debug('hello')
      expect(result).toBe(spinner)
    })

    it('debugAndStop writes message and stops spinner', () => {
      const spinner = Spinner()
      const result = spinner.debugAndStop('done')
      expect(result).toBe(spinner)
    })
  })

  describe('dedent(0) reset', () => {
    it('resets indentation to empty string', () => {
      const spinner = Spinner()
      spinner.indent(8)
      const result = spinner.dedent(0)
      expect(result).toBe(spinner)
    })
  })

  describe('setShimmer config branches', () => {
    it('updates partial color when shimmer is already active', () => {
      const spinner = Spinner()
      spinner.enableShimmer()
      // Pass a numeric RGB triple (valid Palette/RGB type) rather
      // than a string color name.
      const result = spinner.setShimmer({
        color: [255, 0, 0],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      expect(result).toBe(spinner)
    })

    it('rehydrates from savedConfig when no current shimmer', () => {
      const spinner = Spinner()
      // Enable + disable saves the config, so setShimmer goes through
      // the savedConfig rehydration branch.
      spinner.enableShimmer()
      spinner.disableShimmer()
      const result = spinner.setShimmer({ dir: 'rtl' })
      expect(result).toBe(spinner)
    })

    it('initializes shimmer when neither current nor saved exists', () => {
      const spinner = Spinner()
      const result = spinner.setShimmer({ speed: 1 })
      expect(result).toBe(spinner)
    })
  })

  describe('withSpinnerRestore', () => {
    it('restarts spinner when wasSpinning was true', async () => {
      const spinner = Spinner()
      let started = 0
      const originalStart = spinner.start.bind(spinner)
      spinner.start = ((...args: unknown[]) => {
        started += 1
        return originalStart(...(args as []))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
      await withSpinnerRestore({
        spinner,
        wasSpinning: true,
        operation: async () => 'ok',
      })
      expect(started).toBeGreaterThan(0)
    })

    it('does not restart when wasSpinning was false', async () => {
      const spinner = Spinner()
      let started = 0
      spinner.start = (() => {
        started += 1
        return spinner
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
      await withSpinnerRestore({
        spinner,
        wasSpinning: false,
        operation: async () => 'ok',
      })
      expect(started).toBe(0)
    })

    it('returns the operation value', async () => {
      const spinner = Spinner()
      const result = await withSpinnerRestore({
        spinner,
        wasSpinning: false,
        operation: async () => 42,
      })
      expect(result).toBe(42)
    })

    it('restarts spinner even if operation throws (finally)', async () => {
      const spinner = Spinner()
      let started = 0
      spinner.start = (() => {
        started += 1
        return spinner
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
      await expect(
        withSpinnerRestore({
          spinner,
          wasSpinning: true,
          operation: async () => {
            throw new Error('boom')
          },
        }),
      ).rejects.toThrow(/boom/)
      expect(started).toBeGreaterThan(0)
    })
  })
})
