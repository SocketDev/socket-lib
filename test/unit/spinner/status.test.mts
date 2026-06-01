/**
 * @file Unit tests for the Spinner class status reporting methods: the
 *   chainable status methods (debug/done/error/fail/info/log/skip/step/
 *   substep/success/warn) that keep spinning, and their *AndStop counterparts
 *   that stop the spinner. Used by Socket CLI for long-running operations
 *   (package scanning, API calls).
 */

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Spinner } from '../../../src/spinner/spinner'

describe('spinner — status', () => {
  // Mock stdout/stderr to prevent actual spinner output during tests
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
})
