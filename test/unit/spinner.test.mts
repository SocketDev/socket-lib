/**
 * @file Unit tests for the Spinner class lifecycle and methods:
 *
 *   - Spinner class for manual control (start, stop, update text)
 *   - Indentation, text/control, color methods
 *   - Method chaining, edge cases, theme handling, getCliSpinners, streams
 *   - Color preservation after spinner operations
 *
 *   The withSpinner()/withSpinnerSync() wrapper tests live in
 *   spinner/with.test.mts; status and AndStop method tests in
 *   spinner/status.test.mts; shimmer and progress animation tests in
 *   spinner/animation.test.mts; end-to-end workflow tests in
 *   spinner/workflows.test.mts. Used by Socket CLI for long-running
 *   operations (package scanning, API calls).
 */

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Spinner } from '../../src/spinner/spinner'
import { getCliSpinners } from '../../src/spinner/default'

describe('spinner', () => {
  // Mock stdout/stderr to prevent actual spinner output during tests
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
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
      const result = spinner.start('loading…')
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

    it('should accept color changes during animation', () => {
      const spinner = Spinner({ color: 'blue' })
      spinner.start('Testing')
      spinner.color = [0, 255, 0]
      expect(spinner.color).toEqual([0, 255, 0])
      spinner.stop()
    })
  })

  describe('Method chaining', () => {
    it('should chain multiple status methods', () => {
      const spinner = Spinner()
      const result = spinner
        .start('Starting…')
        .info('Info message')
        .warn('Warning message')
        .success('Success message')
      expect(result).toBe(spinner)
      expect(spinner.isSpinning).toBe(true)
    })

    it('should chain complex workflow', () => {
      const spinner = Spinner({ color: 'cyan' })
      const result = spinner
        .start('Processing…')
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
    it.each(['socket', 'lush', 'sunset', 'ultra'] as const)(
      'should accept %s theme name without throwing and return a spinner with methods',
      themeName => {
        const spinner = Spinner({ theme: themeName })
        expect(typeof spinner.start).toBe('function')
        expect(typeof spinner.stop).toBe('function')
      },
    )
  })

  describe('getCliSpinners', () => {
    it('should return socket custom spinner', () => {
      const socket = getCliSpinners('socket')
      expect(socket).toBeDefined()
      expect(Array.isArray(socket!.frames)).toBe(true)
      expect(typeof socket!.interval).toBe('number')
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
      expect(spinner.shimmerState?.direction).toBe('rtl')
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

})
