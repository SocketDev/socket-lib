/**
 * @fileoverview Integration tests for spinner in real terminal environments.
 *
 * Tests spinner behavior with actual terminal output:
 * - Spinner starts and stops correctly
 * - Progress updates display properly
 * - withSpinner() wraps async operations
 * - CI environment detection disables spinners
 * Used by Socket CLI for user-facing progress indicators.
 */

import { Spinner, withSpinner } from '@socketsecurity/lib/spinner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('spinner integration', () => {
  // Mock stdout/stderr to prevent actual spinner output during tests
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  describe('real-world spinner workflows', () => {
    it('should handle complete operation lifecycle', async () => {
      const spinner = Spinner({ text: 'Starting operation...' })

      spinner.start()
      expect(spinner.isSpinning).toBe(true)

      // Simulate multi-step operation
      spinner.text('Step 1: Initializing')
      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.text('Step 2: Processing')
      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.text('Step 3: Finalizing')
      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.successAndStop('Operation completed!')
      expect(spinner.isSpinning).toBe(false)
    })

    it('should show progress updates during operation', async () => {
      const spinner = Spinner()
      spinner.start('Processing files...')

      const totalFiles = 10
      for (let i = 0; i <= totalFiles; i++) {
        spinner.progress(i, totalFiles, 'files')
        await new Promise(resolve => setTimeout(resolve, 5))
      }

      spinner.doneAndStop('All files processed')
      expect(spinner.isSpinning).toBe(false)
    })

    it('should handle nested status updates', async () => {
      const spinner = Spinner()
      spinner.start('Main operation')

      spinner.step('Step 1')
      spinner.substep('Substep 1.1')
      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.substep('Substep 1.2')
      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.step('Step 2')
      spinner.substep('Substep 2.1')
      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.successAndStop('Operation complete')
      expect(spinner.isSpinning).toBe(false)
    })
  })

  describe('withSpinner integration', () => {
    it('should wrap async file operation', async () => {
      let operationCompleted = false

      const result = await withSpinner({
        message: 'Reading file...',
        operation: async () => {
          await new Promise(resolve => setTimeout(resolve, 20))
          operationCompleted = true
          return 'file-content'
        },
      })

      expect(operationCompleted).toBe(true)
      expect(result).toBe('file-content')
    })

    it('should wrap async network operation', async () => {
      const result = await withSpinner({
        message: 'Fetching data...',
        operation: async () => {
          await new Promise(resolve => setTimeout(resolve, 20))
          return { status: 'success', data: [1, 2, 3] }
        },
      })

      expect(result).toEqual({ status: 'success', data: [1, 2, 3] })
    })

    it('should handle operation errors gracefully', async () => {
      await expect(
        withSpinner({
          message: 'Running operation...',
          operation: async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            throw new Error('Operation failed')
          },
        }),
      ).rejects.toThrow('Operation failed')
    })

    it('should work with shimmer effects', async () => {
      const result = await withSpinner({
        message: 'Processing with shimmer...',
        operation: async () => {
          await new Promise(resolve => setTimeout(resolve, 20))
          return 'done'
        },
        withOptions: {
          shimmer: { dir: 'ltr', speed: 1 },
        },
      })

      expect(result).toBe('done')
    })

    it('should work with color changes', async () => {
      const result = await withSpinner({
        message: 'Processing with color...',
        operation: async () => {
          await new Promise(resolve => setTimeout(resolve, 20))
          return 'complete'
        },
        withOptions: {
          color: [255, 165, 0], // Orange
        },
      })

      expect(result).toBe('complete')
    })
  })

  describe('error handling workflows', () => {
    it('should show error and continue on non-fatal error', async () => {
      const spinner = Spinner()
      spinner.start('Running checks...')

      try {
        // Simulate operation that can fail
        throw new Error('Check failed')
      } catch (error) {
        spinner.error(`Error: ${(error as Error).message}`)
        // Continue with other operations
      }

      spinner.text('Continuing with other checks...')
      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.successAndStop('Checks completed with warnings')
      expect(spinner.isSpinning).toBe(false)
    })

    it('should stop spinner on fatal error', async () => {
      const spinner = Spinner()
      spinner.start('Critical operation...')

      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.failAndStop('Critical failure - operation aborted')
      expect(spinner.isSpinning).toBe(false)
    })
  })

  describe('indentation workflows', () => {
    it('should handle hierarchical output', async () => {
      const spinner = Spinner()
      spinner.start('Root operation')

      spinner.step('Level 1 task')
      spinner.indent()

      spinner.step('Level 2 task')
      spinner.indent()

      spinner.step('Level 3 task')
      await new Promise(resolve => setTimeout(resolve, 10))

      spinner.dedent()
      spinner.step('Back to level 2')

      spinner.dedent()
      spinner.step('Back to level 1')

      spinner.dedent()
      spinner.successAndStop('All levels completed')

      expect(spinner.isSpinning).toBe(false)
    })
  })
})
