/**
 * @file Unit tests for end-to-end spinner workflows: withSpinner() driving an
 *   async operation with color/shimmer options, text updates mid-run, chained
 *   progress calls inside an operation, multiple concurrent spinner instances,
 *   and rapid start/stop cycles. Used by Socket CLI for long-running operations
 *   (package scanning, API calls).
 */

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Spinner } from '../../../src/spinner/spinner'
import { withSpinner } from '../../../src/spinner/with'

describe('spinner — workflows', () => {
  // Mock stdout/stderr to prevent actual spinner output during tests
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  describe('Complex spinner workflows', () => {
    it('should handle complex async workflow', async () => {
      const result = await withSpinner({
        message: 'Processing…',
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

    it('should invoke the operation when text is updated during run', async () => {
      // withSpinner resets spinner text after completion — observable is
      // that the operation actually ran (text calls would throw on a
      // broken spinner/operation callback wiring).
      const spinner = Spinner()
      let opRan = false
      await withSpinner({
        message: 'Starting…',
        operation: async () => {
          spinner.text('Middle…')
          spinner.text('Finishing…')
          opRan = true
        },
        spinner,
      })
      expect(opRan).toBe(true)
    })

    it('should chain progress calls during withSpinner without throwing', async () => {
      const spinner = Spinner()
      // #progress is private — best observable is that the operation
      // completes and each progressStep() returns the spinner (chainable).
      const result = await withSpinner({
        message: 'Processing files…',
        operation: async () => {
          spinner.progress(0, 3, 'files')
          const a = spinner.progressStep()
          const b = spinner.progressStep()
          const c = spinner.progressStep()
          return a === spinner && b === spinner && c === spinner
        },
        spinner,
      })
      expect(result).toBe(true)
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
