/**
 * @fileoverview Unit tests for spinner animation utilities.
 *
 * Tests spinner animation wrappers and lifecycle:
 * - withSpinner() wraps async operations with animated spinner
 * - withSpinnerSync() wraps sync operations with spinner
 * - Spinner class for manual control (start, stop, update text)
 * - Color preservation after spinner operations
 * - CI detection: spinners disabled in CI environments
 * Used by Socket CLI for long-running operations (package scanning, API calls).
 */

import {
  getCliSpinners,
  Spinner,
  withSpinner,
  withSpinnerSync,
} from '@socketsecurity/lib/spinner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('spinner', () => {
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
        message: 'Testing...',
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
        message: 'Testing...',
        operation: async () => {
          // Just verify operation runs
          expect(true).toBe(true)
        },
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
        message: 'Testing...',
        operation: async () => {
          // During operation, shimmer should be different
          expect(spinner.shimmerState?.mode).toBe('rtl')
        },
        spinner,
        withOptions: {
          shimmer: { dir: 'rtl' },
        },
      })

      // After operation, shimmer should be restored
      expect(spinner.shimmerState?.mode).toBe(originalShimmer?.mode)
      expect(spinner.shimmerState?.speed).toBe(originalShimmer?.speed)
    })

    it('should disable shimmer after operation if it was disabled before', async () => {
      const spinner = Spinner() // No shimmer

      await withSpinner({
        message: 'Testing...',
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
        message: 'Testing...',
        operation: async () => {
          expect(true).toBe(true)
        },
        spinner,
      })

      // Color should remain unchanged
      expect(spinner.color).toEqual(originalColor)
    })

    it('should work without spinner instance', async () => {
      const result = await withSpinner({
        message: 'Testing...',
        operation: async () => 42,
      })

      expect(result).toBe(42)
    })

    it('should restore state even if operation throws', async () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      const originalColor = spinner.color

      await expect(
        withSpinner({
          message: 'Testing...',
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
        message: 'Testing...',
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
        message: 'Testing...',
        operation: () => {
          // During operation, shimmer should be different
          expect(spinner.shimmerState?.mode).toBe('rtl')
        },
        spinner,
        withOptions: {
          shimmer: { dir: 'rtl' },
        },
      })

      // After operation, shimmer should be restored
      expect(spinner.shimmerState?.mode).toBe(originalShimmer?.mode)
      expect(spinner.shimmerState?.speed).toBe(originalShimmer?.speed)
    })

    it('should work without withOptions', () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      const originalColor = spinner.color

      withSpinnerSync({
        message: 'Testing...',
        operation: () => {
          expect(true).toBe(true)
        },
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
          message: 'Testing...',
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

  describe('Spinner methods', () => {
    it('should support reason() method', () => {
      const spinner = Spinner()
      const result = spinner.reason('reasoning message')
      expect(result).toBe(spinner)
    })

    it('should support reasonAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.reasonAndStop('final reasoning')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should chain reason() calls', () => {
      const spinner = Spinner()
      const result = spinner
        .reason('first reason')
        .reason('second reason')
        .reason('third reason')
      expect(result).toBe(spinner)
    })
  })

  describe('Status methods (show status while continuing to spin)', () => {
    it('should support debug() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.debug('debug message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support done() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.done('done message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support error() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.error('error message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support fail() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.fail('fail message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support info() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.info('info message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support log() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.log('log message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support step() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.step('step message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support substep() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.substep('substep message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support success() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.success('success message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should support warn() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.warn('warning message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })
  })

  describe('AndStop methods (show status and stop spinning)', () => {
    it('should support debugAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.debugAndStop('debug message')
      expect(result).toBe(spinner)
      // debugAndStop only stops if debug mode is enabled
      // In test environment, debug mode is typically disabled
      // So spinner continues running
    })

    it('should support doneAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.doneAndStop('done message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should support errorAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.errorAndStop('error message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should support failAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.failAndStop('fail message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should support infoAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.infoAndStop('info message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should support logAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.logAndStop('log message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should support successAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.successAndStop('success message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should support warnAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.warnAndStop('warning message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })
  })

  describe('Shimmer methods', () => {
    it('should enable shimmer with default settings', () => {
      const spinner = Spinner()
      const result = spinner.enableShimmer()
      expect(result).toBe(spinner)
      expect(spinner.shimmerState).toBeDefined()
    })

    it('should disable shimmer', () => {
      const spinner = Spinner({ shimmer: { dir: 'ltr' } })
      expect(spinner.shimmerState).toBeDefined()

      const result = spinner.disableShimmer()
      expect(result).toBe(spinner)
      expect(spinner.shimmerState).toBeUndefined()
    })

    it('should set shimmer configuration', () => {
      const spinner = Spinner()
      const result = spinner.setShimmer({ dir: 'rtl', speed: 2 })
      expect(result).toBe(spinner)
      expect(spinner.shimmerState).toBeDefined()
      expect(spinner.shimmerState?.mode).toBe('rtl')
      expect(spinner.shimmerState?.speed).toBe(2)
    })

    it('should update shimmer configuration', () => {
      const spinner = Spinner({ shimmer: { dir: 'ltr', speed: 1 } })
      const result = spinner.updateShimmer({ speed: 3 })
      expect(result).toBe(spinner)
      expect(spinner.shimmerState?.mode).toBe('ltr')
      expect(spinner.shimmerState?.speed).toBe(3)
    })

    it('should chain shimmer calls', () => {
      const spinner = Spinner()
      const result = spinner
        .enableShimmer()
        .updateShimmer({ speed: 2 })
        .disableShimmer()
        .enableShimmer()
      expect(result).toBe(spinner)
    })
  })

  describe('Progress methods', () => {
    it('should update progress', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(50, 100)
      expect(result).toBe(spinner)
    })

    it('should update progress with unit', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(25, 100, 'files')
      expect(result).toBe(spinner)
    })

    it('should increment progress step', () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(0, 100)
      const result = spinner.progressStep(10)
      expect(result).toBe(spinner)
    })

    it('should increment progress step by default amount', () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(0, 100)
      const result = spinner.progressStep()
      expect(result).toBe(spinner)
    })

    it('should chain progress calls', () => {
      const spinner = Spinner()
      const result = spinner
        .start()
        .progress(10, 100, 'items')
        .progressStep(5)
        .progressStep(5)
      expect(result).toBe(spinner)
    })
  })

  describe('Indentation methods', () => {
    it('should indent with default spaces', () => {
      const spinner = Spinner()
      const result = spinner.indent()
      expect(result).toBe(spinner)
    })

    it('should indent with custom spaces', () => {
      const spinner = Spinner()
      const result = spinner.indent(4)
      expect(result).toBe(spinner)
    })

    it('should dedent with default spaces', () => {
      const spinner = Spinner()
      spinner.indent()
      const result = spinner.dedent()
      expect(result).toBe(spinner)
    })

    it('should dedent with custom spaces', () => {
      const spinner = Spinner()
      spinner.indent(4)
      const result = spinner.dedent(4)
      expect(result).toBe(spinner)
    })

    it('should chain indentation calls', () => {
      const spinner = Spinner()
      const result = spinner
        .indent()
        .step('indented step')
        .indent()
        .substep('double indented substep')
        .dedent()
        .dedent()
      expect(result).toBe(spinner)
    })
  })

  describe('Text and control methods', () => {
    it('should set text using text() method', () => {
      const spinner = Spinner({ text: 'initial' })
      const result = spinner.text('updated')
      expect(result).toBe(spinner)
      expect(spinner.text()).toBe('updated')
    })

    it('should get text using text() method after setting', () => {
      const spinner = Spinner()
      spinner.text('test message')
      expect(spinner.text()).toBe('test message')
    })

    it('should clear spinner', () => {
      const spinner = Spinner({ text: 'test' })
      spinner.start()
      const result = spinner.clear()
      expect(result).toBe(spinner)
    })

    it('should start spinner', () => {
      const spinner = Spinner()
      const result = spinner.start('loading...')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should stop spinner', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.stop('done')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should stop spinner with stop()', () => {
      const spinner = Spinner()
      spinner.start()
      spinner.stop()
      expect(spinner.isSpinning).toBe(false)
      // Text is cleared after stop
      expect(spinner.text()).toBe('')
    })
  })

  describe('Color handling', () => {
    it('should set color with RGB tuple', () => {
      const spinner = Spinner()
      spinner.color = [255, 100, 50]
      expect(spinner.color).toEqual([255, 100, 50])
    })

    it('should initialize with RGB color', () => {
      const spinner = Spinner({ color: [140, 82, 255] })
      expect(spinner.color).toEqual([140, 82, 255])
    })

    it('should initialize with named color', () => {
      const spinner = Spinner({ color: 'red' })
      expect(spinner.color).toEqual([255, 0, 0])
    })

    it('should convert named color to RGB', () => {
      const spinner = Spinner({ color: 'cyan' })
      // Getter always returns RGB
      expect(spinner.color).toEqual([0, 255, 255])
    })
  })

  describe('Method chaining', () => {
    it('should chain multiple status methods', () => {
      const spinner = Spinner()
      const result = spinner
        .start('Starting...')
        .info('Info message')
        .warn('Warning message')
        .success('Success message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should chain complex workflow', () => {
      const spinner = Spinner({ color: 'cyan' })
      const result = spinner
        .start('Processing...')
        .enableShimmer()
        .indent()
        .step('Step 1')
        .progress(33, 100)
        .step('Step 2')
        .progress(66, 100)
        .step('Step 3')
        .progress(100, 100)
        .dedent()
        .disableShimmer()
        .successAndStop('Complete!')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty text messages', () => {
      const spinner = Spinner()
      const result = spinner.start().info().warn().success()
      expect(result).toBe(spinner)
    })

    it('should handle undefined text messages', () => {
      const spinner = Spinner()
      const result = spinner.info(undefined).warn(undefined)
      expect(result).toBe(spinner)
    })

    it('should handle stopping already stopped spinner', () => {
      const spinner = Spinner()
      spinner.start()
      spinner.stop()
      const result = spinner.stop()
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should handle starting already running spinner', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.start('new text')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should handle disabling already disabled shimmer', () => {
      const spinner = Spinner()
      const result = spinner.disableShimmer()
      expect(result).toBe(spinner)
      expect(spinner.shimmerState).toBeUndefined()
    })

    it('should handle multiple dedents beyond zero indentation', () => {
      const spinner = Spinner()
      const result = spinner.dedent().dedent().dedent()
      expect(result).toBe(spinner)
    })
  })

  describe('getCliSpinners', () => {
    it('should return socket custom spinner', () => {
      const socket = getCliSpinners('socket')
      expect(socket).toBeDefined()
      expect(socket.frames).toBeDefined()
      expect(socket.interval).toBeDefined()
    })

    it('should return undefined for non-existent spinner', () => {
      const result = getCliSpinners('non-existent-spinner')
      expect(result).toBeUndefined()
    })

    it('should cache spinner styles', () => {
      const first = getCliSpinners()
      const second = getCliSpinners()
      expect(first).toBe(second)
    })
  })

  describe('Stream handling', () => {
    it('should accept custom stream', () => {
      const customStream = process.stderr
      const spinner = Spinner({ stream: customStream })
      expect(spinner).toBeDefined()
    })

    it('should work with stderr', () => {
      const spinner = Spinner({ stream: process.stderr })
      spinner.start()
      spinner.text('test')
      spinner.stop()
      expect(spinner.isSpinning).toBe(false)
    })
  })
})
