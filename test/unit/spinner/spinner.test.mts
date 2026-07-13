/**
 * @file Unit tests for the Spinner class shimmer and progress animation
 *   methods: enableShimmer/disableShimmer/setShimmer/updateShimmer state,
 *   shimmer direction/speed/palette defaults, progress()/progressStep() updates
 *   and chaining, and progress-bar rendering paths. Used by Socket CLI for
 *   long-running operations (package scanning, API calls).
 */

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { tolerantSleep } from '../../_shared/fleet/lib/timing.mts'

import { Spinner } from '../../../src/spinner/spinner'

describe('spinner — animation', () => {
  // Mock stdout/stderr to prevent actual spinner output during tests
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
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
      expect(spinner.shimmerState?.direction).toBe('rtl')
      expect(spinner.shimmerState?.speed).toBe(2)
    })

    it('should update shimmer configuration', () => {
      const spinner = Spinner({ shimmer: { dir: 'ltr', speed: 1 } })
      const result = spinner.updateShimmer({ speed: 3 })
      expect(result).toBe(spinner)
      expect(spinner.shimmerState?.direction).toBe('ltr')
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
      await new Promise(resolve => setTimeout(resolve, tolerantSleep(100)))

      expect(spinner.shimmerState).toBeDefined()
      spinner.stop()
    })

    it('should update shimmer state during animation', async () => {
      const spinner = Spinner()
      spinner.start('Loading')
      spinner.enableShimmer()
      spinner.updateShimmer({ dir: 'rtl' })

      // Let animation run
      await new Promise(resolve => setTimeout(resolve, tolerantSleep(50)))

      expect(spinner.shimmerState?.direction).toBe('rtl')
      spinner.disableShimmer()
      expect(spinner.shimmerState).toBeUndefined()
      spinner.stop()
    })

    it('should expose a frame counter starting at 0', () => {
      const spinner = Spinner({ shimmer: { dir: 'ltr' } })
      expect(spinner.shimmerState?.frame).toBe(0)
    })

    it('should default speed to 1/3 when omitted', () => {
      const spinner = Spinner({ shimmer: { dir: 'ltr' } })
      expect(spinner.shimmerState?.speed).toBeCloseTo(1 / 3, 5)
    })

    it('should default direction to ltr when shimmer is a string keyword', () => {
      const spinner = Spinner({ shimmer: 'ltr' })
      expect(spinner.shimmerState?.direction).toBe('ltr')
    })

    it('should accept rtl direction as a string shorthand', () => {
      const spinner = Spinner({ shimmer: 'rtl' })
      expect(spinner.shimmerState?.direction).toBe('rtl')
    })

    it('should accept a per-character palette as shimmer color', () => {
      const palette: Array<[number, number, number]> = [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ]
      const spinner = Spinner({ shimmer: { color: palette, dir: 'ltr' } })
      expect(spinner.shimmerState?.color).toEqual(palette)
    })

    it('should reset frame counter to 0 when re-enabling shimmer', () => {
      const spinner = Spinner({ shimmer: { dir: 'ltr' } })
      // Frame begins at 0; manually nudge it via setShimmer.
      spinner.setShimmer({ dir: 'ltr' })
      const before = spinner.shimmerState?.frame
      expect(before).toBe(0)
      spinner.disableShimmer()
      spinner.enableShimmer()
      expect(spinner.shimmerState?.frame).toBe(0)
    })

    it('should accept dir: none and store it in state', () => {
      const spinner = Spinner({ shimmer: { dir: 'none' } })
      expect(spinner.shimmerState?.direction).toBe('none')
    })
  })

  describe('Progress methods', () => {
    it('should update progress', async () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(50, 100)
      expect(result).toBe(spinner)
      spinner.stop()
    })

    it('should update progress with unit', async () => {
      const spinner = Spinner()
      spinner.start()
      const result = spinner.progress(25, 100, 'files')
      expect(result).toBe(spinner)
      spinner.stop()
    })

    it('should increment progress step', async () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(0, 100)
      const result = spinner.progressStep(10)
      expect(result).toBe(spinner)
      spinner.stop()
    })

    it('should increment progress step by default amount', async () => {
      const spinner = Spinner()
      spinner.start()
      spinner.progress(0, 100)
      const result = spinner.progressStep()
      expect(result).toBe(spinner)
      spinner.stop()
    })

    it('should accept progress at each quartile without throwing', () => {
      const spinner = Spinner()
      spinner.start('Processing')
      expect(() => {
        spinner.progress(0, 100)
        spinner.progress(25, 100)
        spinner.progress(50, 100)
        spinner.progress(75, 100)
        spinner.progress(100, 100, 'items')
      }).not.toThrow()
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
      spinner.start('Processing…')
      spinner.progress(10, 100, 'items')
      spinner.progressStep(10)
      spinner.progressStep(10)
      spinner.stop()
      expect(spinner.isSpinning).toBe(false)
    })

    it('should chain progress with other methods', () => {
      const spinner = Spinner()
      const result = spinner
        .start('Processing…')
        .progress(50, 100, 'files')
        .progressStep(10)
        .text('Still processing…')
        .stop()
      expect(result).toBe(spinner)
    })
  })
})

// Status tests — merged from status.test.mts.

describe('spinner — status', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
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
})
