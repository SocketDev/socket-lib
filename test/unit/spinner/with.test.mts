/**
 * @file Unit tests for the withSpinner()/withSpinnerSync() wrappers that wrap
 *   async and sync operations with an animated spinner and restore spinner
 *   state (color, shimmer) afterwards, including on error. Used by Socket CLI
 *   for long-running operations (package scanning, API calls).
 */

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { tolerantSleep } from '../../_shared/fleet/lib/timing.mts'

import { Spinner } from '../../../src/spinner/spinner'
import { withSpinner, withSpinnerSync } from '../../../src/spinner/with'

describe('spinner — with wrappers', () => {
  // Mock stdout/stderr to prevent actual spinner output during tests
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  describe('withSpinner', () => {
    it('should restore color after operation', async () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      const originalColor = spinner.color

      await withSpinner({
        message: 'Testing…',
        operation: async () => {
          // During operation, color should be red
          expect(spinner.color).toEqual([255, 0, 0])
        },
        spinner,
        withOptions: {
          color: [255, 0, 0], // Red
        },
      })

      // After operation, color should be restored
      expect(spinner.color).toEqual(originalColor)
    })

    it('should restore color after operation with named color', async () => {
      const spinner = Spinner({ color: 'cyan' })
      const originalColor = spinner.color

      await withSpinner({
        message: 'Testing…',
        // Empty body — the real assertion is restoration after the operation.
        operation: async () => {},
        spinner,
        withOptions: {
          color: 'red',
        },
      })

      // After operation, color should be restored
      expect(spinner.color).toEqual(originalColor)
    })

    it('should restore shimmer state after operation', async () => {
      const spinner = Spinner({ shimmer: { dir: 'ltr', speed: 0.5 } })
      const originalShimmer = spinner.shimmerState

      await withSpinner({
        message: 'Testing…',
        operation: async () => {
          // During operation, shimmer should be different
          expect(spinner.shimmerState?.direction).toBe('rtl')
        },
        spinner,
        withOptions: {
          shimmer: { dir: 'rtl' },
        },
      })

      // After operation, shimmer should be restored
      expect(spinner.shimmerState?.direction).toBe(originalShimmer?.direction)
      expect(spinner.shimmerState?.speed).toBe(originalShimmer?.speed)
    })

    it('should disable shimmer after operation if it was disabled before', async () => {
      const spinner = Spinner() // No shimmer

      await withSpinner({
        message: 'Testing…',
        operation: async () => {
          // During operation, shimmer should be enabled
          expect(spinner.shimmerState).toBeDefined()
        },
        spinner,
        withOptions: {
          shimmer: { dir: 'ltr' },
        },
      })

      // After operation, shimmer should be disabled again
      expect(spinner.shimmerState).toBeUndefined()
    })

    it('should work without withOptions', async () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      const originalColor = spinner.color

      await withSpinner({
        message: 'Testing…',
        // Empty body — the assertion is color unchanged after.
        operation: async () => {},
        spinner,
      })

      // Color should remain unchanged
      expect(spinner.color).toEqual(originalColor)
    })

    it('should work without spinner instance', async () => {
      const result = await withSpinner({
        message: 'Testing…',
        operation: async () => 42,
      })

      expect(result).toBe(42)
    })

    it('should restore state even if operation throws', async () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      const originalColor = spinner.color

      await expect(
        withSpinner({
          message: 'Testing…',
          operation: async () => {
            throw new Error('Test error')
          },
          spinner,
          withOptions: {
            color: [255, 0, 0],
          },
        }),
      ).rejects.toThrow('Test error')

      // Color should still be restored
      expect(spinner.color).toEqual(originalColor)
    })
  })

  describe('withSpinnerSync', () => {
    it('should restore color after operation', () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      const originalColor = spinner.color

      withSpinnerSync({
        message: 'Testing…',
        operation: () => {
          // During operation, color should be red
          expect(spinner.color).toEqual([255, 0, 0])
        },
        spinner,
        withOptions: {
          color: [255, 0, 0], // Red
        },
      })

      // After operation, color should be restored
      expect(spinner.color).toEqual(originalColor)
    })

    it('should restore shimmer state after operation', () => {
      const spinner = Spinner({ shimmer: { dir: 'ltr', speed: 0.5 } })
      const originalShimmer = spinner.shimmerState

      withSpinnerSync({
        message: 'Testing…',
        operation: () => {
          // During operation, shimmer should be different
          expect(spinner.shimmerState?.direction).toBe('rtl')
        },
        spinner,
        withOptions: {
          shimmer: { dir: 'rtl' },
        },
      })

      // After operation, shimmer should be restored
      expect(spinner.shimmerState?.direction).toBe(originalShimmer?.direction)
      expect(spinner.shimmerState?.speed).toBe(originalShimmer?.speed)
    })

    it('should work without withOptions', () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      const originalColor = spinner.color

      withSpinnerSync({
        message: 'Testing…',
        // Empty body — the assertion is color unchanged after.
        operation: () => {},
        spinner,
      })

      // Color should remain unchanged
      expect(spinner.color).toEqual(originalColor)
    })

    it('should restore state even if operation throws', () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      const originalColor = spinner.color

      expect(() => {
        withSpinnerSync({
          message: 'Testing…',
          operation: () => {
            throw new Error('Test error')
          },
          spinner,
          withOptions: {
            color: [255, 0, 0],
          },
        })
      }).toThrow('Test error')

      // Color should still be restored
      expect(spinner.color).toEqual(originalColor)
    })
  })

  describe('withSpinner error handling', () => {
    it('should handle errors gracefully', async () => {
      const spinner = Spinner()
      const error = new Error('Test error')

      await expect(
        withSpinner({
          message: 'Testing error…',
          operation: async () => {
            throw error
          },
          spinner,
        }),
      ).rejects.toThrow('Test error')
    })

    it('should run operation without spinner when spinner is undefined', async () => {
      const result = await withSpinner({
        message: 'Test',
        operation: async () => 42,
        spinner: undefined,
      })
      expect(result).toBe(42)
    })

    it('should handle shimmer string option in withSpinner', async () => {
      const spinner = Spinner()
      spinner.enableShimmer()
      const savedState = spinner.shimmerState

      const result = await withSpinner({
        message: 'Testing shimmer…',
        operation: async () => 'done',
        spinner,
        withOptions: { shimmer: 'rtl' },
      })

      expect(result).toBe('done')
      // Should restore original shimmer state
      expect(spinner.shimmerState).toEqual(savedState)
    })

    it('should handle shimmer object option in withSpinner', async () => {
      const spinner = Spinner()
      spinner.enableShimmer()
      spinner.updateShimmer({ dir: 'ltr', speed: 2 })

      const result = await withSpinner({
        message: 'Testing shimmer…',
        operation: async () => 'complete',
        spinner,
        withOptions: {
          shimmer: {
            color: [0, 255, 255] as [number, number, number],
            dir: 'rtl',
            speed: 3,
          },
        },
      })

      expect(result).toBe('complete')
    })

    it('should restore spinner state after error', async () => {
      const spinner = Spinner({ color: 'cyan' })
      const originalColor = spinner.color

      await expect(
        withSpinner({
          message: 'Testing error…',
          operation: async () => {
            throw new Error('Test error')
          },
          spinner,
          withOptions: {
            color: 'red',
          },
        }),
      ).rejects.toThrow()

      expect(spinner.color).toEqual(originalColor)
    })

    it('should handle async errors in withSpinner', async () => {
      await expect(
        withSpinner({
          message: 'Testing…',
          operation: async () => {
            await new Promise(resolve => setTimeout(resolve, tolerantSleep(1)))
            throw new Error('Async error')
          },
        }),
      ).rejects.toThrow('Async error')
    })
  })

  describe('withSpinnerSync error handling', () => {
    it('should handle errors gracefully', () => {
      const spinner = Spinner()
      const error = new Error('Sync test error')

      expect(() =>
        withSpinnerSync({
          message: 'Testing error…',
          operation: () => {
            throw error
          },
          spinner,
        }),
      ).toThrow('Sync test error')
    })

    it('should run operation without spinner when spinner is undefined', () => {
      const result = withSpinnerSync({
        message: 'Test',
        operation: () => 42,
        spinner: undefined,
      })
      expect(result).toBe(42)
    })

    it('should handle shimmer string option in withSpinnerSync', () => {
      const spinner = Spinner()
      spinner.enableShimmer()
      const savedState = spinner.shimmerState

      const result = withSpinnerSync({
        message: 'Testing shimmer…',
        operation: () => 'done',
        spinner,
        withOptions: { shimmer: 'rtl' },
      })

      expect(result).toBe('done')
      // Should restore original shimmer state
      expect(spinner.shimmerState).toEqual(savedState)
    })

    it('should handle shimmer object option in withSpinnerSync', () => {
      const spinner = Spinner()
      spinner.enableShimmer()
      spinner.updateShimmer({ dir: 'ltr', speed: 2 })

      const result = withSpinnerSync({
        message: 'Testing shimmer…',
        operation: () => 'complete',
        spinner,
        withOptions: {
          shimmer: {
            color: [0, 255, 255] as [number, number, number],
            dir: 'rtl',
            speed: 3,
          },
        },
      })

      expect(result).toBe('complete')
    })

    it('should restore spinner state after sync error', () => {
      const spinner = Spinner({ color: 'cyan' })
      const originalColor = spinner.color

      expect(() =>
        withSpinnerSync({
          message: 'Testing error…',
          operation: () => {
            throw new Error('Sync test error')
          },
          spinner,
          withOptions: {
            color: 'red',
          },
        }),
      ).toThrow()

      expect(spinner.color).toEqual(originalColor)
    })

    it('should return operation result on success', () => {
      const result = withSpinnerSync({
        message: 'Computing…',
        operation: () => 42,
      })
      expect(result).toBe(42)
    })
  })
})
