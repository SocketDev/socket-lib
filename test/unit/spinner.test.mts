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
    it('should support skip() method', () => {
      const spinner = Spinner()
      const result = spinner.skip('skip message')
      expect(result).toBe(spinner)
    })

    it('should support skipAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.skipAndStop('final skip')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(false)
    })

    it('should chain skip() calls', () => {
      const spinner = Spinner()
      const result = spinner
        .skip('first skip')
        .skip('second skip')
        .skip('third skip')
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

    it('should support skip() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.skip('skip message')
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

    it('should support skipAndStop() method', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.skipAndStop('skip message')
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

    it('should handle shimmer with active spinner', async () => {
      const spinner = Spinner()
      spinner.start('Processing')
      spinner.enableShimmer()

      // Wait for shimmer animation to trigger callbacks
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(spinner.shimmerState).toBeDefined()
      spinner.stop()
    })

    it('should update shimmer state during animation', async () => {
      const spinner = Spinner()
      spinner.start('Loading')
      spinner.enableShimmer()
      spinner.updateShimmer({ dir: 'rtl' })

      // Let animation run
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(spinner.shimmerState?.mode).toBe('rtl')
      spinner.disableShimmer()
      expect(spinner.shimmerState).toBeUndefined()
      spinner.stop()
    })
  })

  describe('Progress methods', () => {
    it('should update progress', async () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(50, 100)
      // Wait for animation frame to render progress
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(result).toBe(spinner)
      spinner.stop()
    })

    it('should update progress with unit', async () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(25, 100, 'files')
      // Wait for animation frame to render progress
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(result).toBe(spinner)
      spinner.stop()
    })

    it('should increment progress step', async () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(0, 100)
      const result = spinner.progressStep(10)
      // Wait for animation frame to render progress
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(result).toBe(spinner)
      spinner.stop()
    })

    it('should increment progress step by default amount', async () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(0, 100)
      const result = spinner.progressStep()
      // Wait for animation frame to render progress
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(result).toBe(spinner)
      spinner.stop()
    })

    it('should render progress bar with various percentages', async () => {
      const spinner = Spinner()
      spinner.start('Processing')

      // Test different progress values to trigger formatProgress and renderProgressBar
      spinner.progress(0, 100)
      await new Promise(resolve => setTimeout(resolve, 50))

      spinner.progress(25, 100)
      await new Promise(resolve => setTimeout(resolve, 50))

      spinner.progress(50, 100)
      await new Promise(resolve => setTimeout(resolve, 50))

      spinner.progress(75, 100)
      await new Promise(resolve => setTimeout(resolve, 50))

      spinner.progress(100, 100, 'items')
      await new Promise(resolve => setTimeout(resolve, 50))

      spinner.stop()
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

    it('should convert string color to RGB via setter', () => {
      const spinner = Spinner()
      spinner.color = [255, 0, 255]
      // Setter and getter both work with RGB
      expect(spinner.color).toEqual([255, 0, 255])
    })

    it('should handle color changes during animation', async () => {
      const spinner = Spinner({ color: 'blue' })
      spinner.start('Testing')

      // Wait for first frame
      await new Promise(resolve => setTimeout(resolve, 50))

      // Change color during animation
      spinner.color = [0, 255, 0]
      expect(spinner.color).toEqual([0, 255, 0])

      spinner.stop()
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

  describe('Theme handling', () => {
    it('should accept theme as string name', () => {
      const spinner = Spinner({ theme: 'socket' })
      expect(spinner).toBeDefined()
    })

    it('should accept theme lush', () => {
      const spinner = Spinner({ theme: 'lush' })
      expect(spinner).toBeDefined()
    })

    it('should accept theme sunset', () => {
      const spinner = Spinner({ theme: 'sunset' })
      expect(spinner).toBeDefined()
    })

    it('should accept theme ultra', () => {
      const spinner = Spinner({ theme: 'ultra' })
      expect(spinner).toBeDefined()
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

  describe('Progress bars', () => {
    it('should show progress with percentage', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(25, 100)
      expect(result).toBe(spinner)
    })

    it('should show progress with unit parameter', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(50, 200, 'files')
      expect(result).toBe(spinner)
    })

    it('should show progress with unit', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(5, 10, 'files')
      expect(result).toBe(spinner)
    })

    it('should handle progress at 0%', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(0, 100)
      expect(result).toBe(spinner)
    })

    it('should handle progress at 100%', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(100, 100)
      expect(result).toBe(spinner)
    })

    it('should handle progress with decimal current value', () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(33, 100)
      expect(result).toBe(spinner)
    })

    it('should handle progressStep increments', () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(0, 10)
      const result = spinner.progressStep()
      expect(result).toBe(spinner)
    })

    it('should handle progressStep with custom increments', () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(0, 10)
      const result = spinner.progressStep(5)
      expect(result).toBe(spinner)
    })

    it('should handle progress with different units', () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(1, 5, 'packages')
      const result = spinner.progress(2, 5, 'modules')
      expect(result).toBe(spinner)
    })

    it('should allow progress updates while spinning', () => {
      const spinner = Spinner()
      spinner.start('Processing...')
      spinner.progress(10, 100, 'items')
      spinner.progressStep(10)
      spinner.progressStep(10)
      spinner.stop()
      expect(spinner.isSpinning).toBe(false)
    })

    it('should chain progress with other methods', () => {
      const spinner = Spinner()
      const result = spinner
        .start('Processing...')
        .progress(50, 100, 'files')
        .progressStep(10)
        .text('Still processing...')
        .stop()
      expect(result).toBe(spinner)
    })
  })

  describe('withSpinner error handling', () => {
    it('should handle errors gracefully', async () => {
      const spinner = Spinner()
      const error = new Error('Test error')

      await expect(
        withSpinner({
          message: 'Testing error...',
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
        message: 'Testing shimmer...',
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
        message: 'Testing shimmer...',
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
          message: 'Testing error...',
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
          message: 'Testing...',
          operation: async () => {
            await new Promise(resolve => setTimeout(resolve, 1))
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
          message: 'Testing error...',
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
        message: 'Testing shimmer...',
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
        message: 'Testing shimmer...',
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
          message: 'Testing error...',
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
        message: 'Computing...',
        operation: () => 42,
      })
      expect(result).toBe(42)
    })
  })

  describe('Spinner with various configurations', () => {
    it('should create spinner with color array', () => {
      const spinner = Spinner({ color: [255, 100, 50] })
      expect(spinner.color).toEqual([255, 100, 50])
    })

    it('should create spinner with named color', () => {
      const spinner = Spinner({ color: 'magenta' })
      expect(spinner.color).toBeDefined()
    })

    it('should create spinner with shimmer config', () => {
      const spinner = Spinner({ shimmer: { dir: 'rtl', speed: 2.0 } })
      expect(spinner.shimmerState).toBeDefined()
      expect(spinner.shimmerState?.mode).toBe('rtl')
      expect(spinner.shimmerState?.speed).toBe(2.0)
    })

    it('should create spinner with socket style', () => {
      const spinner = Spinner()
      expect(spinner).toBeDefined()
    })

    it('should create spinner with theme name', () => {
      const spinner = Spinner({ theme: 'socket' })
      expect(spinner).toBeDefined()
    })

    it('should handle spinner with indent methods', () => {
      const spinner = Spinner()
      spinner.start('Test')
      spinner.indent(2)
      spinner.dedent()
      spinner.stop()
      expect(spinner.isSpinning).toBe(false)
    })

    it('should handle all status methods', () => {
      const spinner = Spinner()
      spinner.start()
      spinner.debug('Debug message')
      spinner.done('Done message')
      spinner.error('Error message')
      spinner.fail('Fail message')
      spinner.info('Info message')
      spinner.log('Log message')
      spinner.skip('Skip message')
      spinner.step('Step message')
      spinner.substep('Substep message')
      spinner.success('Success message')
      spinner.warn('Warn message')
      spinner.stop()
      expect(spinner.isSpinning).toBe(false)
    })

    it('should call AndStop methods', () => {
      const spinner = Spinner()

      // Call each AndStop method - they should execute without error
      spinner.start()
      const result1 = spinner.debugAndStop('Debug')
      expect(result1).toBe(spinner)

      spinner.start()
      const result2 = spinner.doneAndStop('Done')
      expect(result2).toBe(spinner)

      spinner.start()
      const result3 = spinner.errorAndStop('Error')
      expect(result3).toBe(spinner)

      spinner.start()
      const result4 = spinner.failAndStop('Fail')
      expect(result4).toBe(spinner)

      spinner.start()
      const result5 = spinner.infoAndStop('Info')
      expect(result5).toBe(spinner)

      spinner.start()
      const result6 = spinner.logAndStop('Log')
      expect(result6).toBe(spinner)

      spinner.start()
      const result7 = spinner.skipAndStop('Skip')
      expect(result7).toBe(spinner)

      spinner.start()
      const result8 = spinner.successAndStop('Success')
      expect(result8).toBe(spinner)

      spinner.start()
      const result9 = spinner.warnAndStop('Warn')
      expect(result9).toBe(spinner)
    })
  })

  describe('Complex spinner workflows', () => {
    it('should handle complex async workflow', async () => {
      const result = await withSpinner({
        message: 'Processing...',
        operation: async () => {
          await new Promise(resolve => setTimeout(resolve, 1))
          return 'completed'
        },
        withOptions: {
          color: 'green',
          shimmer: { dir: 'ltr' },
        },
      })
      expect(result).toBe('completed')
    })

    it('should handle spinner text updates during operation', async () => {
      const spinner = Spinner()
      await withSpinner({
        message: 'Starting...',
        operation: async () => {
          spinner.text('Middle...')
          await new Promise(resolve => setTimeout(resolve, 1))
          spinner.text('Finishing...')
        },
        spinner,
      })
      expect(spinner).toBeDefined()
    })

    it('should handle progress updates during withSpinner', async () => {
      const spinner = Spinner()
      await withSpinner({
        message: 'Processing files...',
        operation: async () => {
          spinner.progress(0, 3, 'files')
          await new Promise(resolve => setTimeout(resolve, 1))
          spinner.progressStep()
          await new Promise(resolve => setTimeout(resolve, 1))
          spinner.progressStep()
          await new Promise(resolve => setTimeout(resolve, 1))
          spinner.progressStep()
        },
        spinner,
      })
      expect(spinner).toBeDefined()
    })

    it('should handle multiple spinner instances', () => {
      const spinner1 = Spinner({ color: 'cyan' })
      const spinner2 = Spinner({ color: 'magenta' })

      spinner1.start('Task 1')
      spinner2.start('Task 2')

      spinner1.stop()
      spinner2.stop()

      expect(spinner1.isSpinning).toBe(false)
      expect(spinner2.isSpinning).toBe(false)
    })

    it('should handle rapid start/stop cycles', () => {
      const spinner = Spinner()
      for (let i = 0; i < 5; i++) {
        spinner.start(`Iteration ${i}`)
        spinner.stop()
      }
      expect(spinner.isSpinning).toBe(false)
    })
  })
})
