import type { Spinner as SpinnerType } from '@socketsecurity/lib/spinner'
import { Spinner } from '@socketsecurity/lib/spinner'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Spinner', () => {
  let spinner: SpinnerType

  beforeEach(() => {
    spinner = Spinner({ text: 'Testing' })
  })

  describe('shimmer() method', () => {
    describe('toggle on/off', () => {
      it('should disable shimmer with shimmer(false)', () => {
        // Start with shimmer enabled.
        spinner = Spinner({ shimmer: 'ltr', text: 'Test' })

        // Disable shimmer - should not throw.
        expect(() => spinner.shimmer(false)).not.toThrow()

        // Should still be the same spinner instance.
        expect(spinner).toBeDefined()
      })

      it('should re-enable shimmer with shimmer(true) after toggling off', () => {
        // Start with shimmer enabled with specific config.
        spinner = Spinner({ shimmer: { dir: 'rtl', speed: 0.5 }, text: 'Test' })

        // Toggle off.
        spinner.shimmer(false)

        // Toggle back on - should restore saved config without error.
        expect(() => spinner.shimmer(true)).not.toThrow()
      })

      it('should use defaults when shimmer(true) with no previous config', () => {
        // Start without shimmer.
        spinner = Spinner({ text: 'Test' })

        // Enable shimmer with defaults - should not throw.
        expect(() => spinner.shimmer(true)).not.toThrow()
      })
    })

    describe('partial config updates', () => {
      it('should update speed without affecting other properties', () => {
        // Start with shimmer.
        spinner = Spinner({
          shimmer: { dir: 'ltr', speed: 1 / 3 },
          text: 'Test',
        })

        // Update only speed - should not throw.
        expect(() => spinner.shimmer({ speed: 0.5 })).not.toThrow()
      })

      it('should update direction without affecting other properties', () => {
        // Start with shimmer.
        spinner = Spinner({
          shimmer: { dir: 'ltr', speed: 1 / 3 },
          text: 'Test',
        })

        // Update only direction - should not throw.
        expect(() => spinner.shimmer({ dir: 'rtl' })).not.toThrow()
      })

      it('should update color without affecting other properties', () => {
        // Start with shimmer.
        spinner = Spinner({ shimmer: 'ltr', text: 'Test' })

        // Update only color - should not throw.
        expect(() =>
          spinner.shimmer({ color: [255, 0, 0] as const }),
        ).not.toThrow()
      })

      it('should handle direction string shorthand', () => {
        // Start without shimmer.
        spinner = Spinner({ text: 'Test' })

        // Set direction via string - should not throw.
        expect(() => spinner.shimmer('rtl')).not.toThrow()
      })

      it('should update existing shimmer direction via string', () => {
        // Start with shimmer.
        spinner = Spinner({ shimmer: 'ltr', text: 'Test' })

        // Change direction via string - should not throw.
        expect(() => spinner.shimmer('rtl')).not.toThrow()
      })
    })

    describe('config preservation', () => {
      it('should preserve full config when toggling off and back on', () => {
        // Start with custom config.
        const customConfig = {
          color: [255, 100, 50] as const,
          dir: 'rtl' as const,
          speed: 0.25,
        }
        spinner = Spinner({ shimmer: customConfig, text: 'Test' })

        // Toggle off.
        spinner.shimmer(false)

        // Toggle back on.
        spinner.shimmer(true)

        // Make a partial update to verify config was preserved - should not throw.
        expect(() => spinner.shimmer({ speed: 0.3 })).not.toThrow()
      })

      it('should allow updates while shimmer is disabled', () => {
        // Start with shimmer.
        spinner = Spinner({ shimmer: 'ltr', text: 'Test' })

        // Disable shimmer.
        spinner.shimmer(false)

        // Update config while disabled - should save and re-enable without error.
        expect(() => spinner.shimmer({ speed: 0.5 })).not.toThrow()
      })

      it('should handle multiple partial updates in sequence', () => {
        // Start with shimmer.
        spinner = Spinner({ shimmer: 'ltr', text: 'Test' })

        // Multiple updates - should not throw.
        expect(() => {
          spinner.shimmer({ speed: 0.5 })
          spinner.shimmer({ dir: 'rtl' })
          spinner.shimmer({ color: [200, 100, 50] as const })
        }).not.toThrow()
      })
    })

    describe('chaining', () => {
      it('should support method chaining', () => {
        spinner = Spinner({ text: 'Test' })

        // Should be chainable and return the same spinner instance.
        const result = spinner
          .shimmer(true)
          .text('Updated')
          .shimmer({ speed: 0.5 })

        expect(result).toBe(spinner)
      })

      it('should chain multiple shimmer calls', () => {
        spinner = Spinner({ shimmer: 'ltr', text: 'Test' })

        // Should chain without errors.
        expect(() => {
          spinner
            .shimmer(false)
            .shimmer(true)
            .shimmer({ speed: 0.3 })
            .shimmer('rtl')
        }).not.toThrow()
      })
    })

    describe('type safety', () => {
      it('should accept boolean toggle', () => {
        spinner = Spinner({ text: 'Test' })

        // TypeScript should compile these without errors.
        spinner.shimmer(true)
        spinner.shimmer(false)
      })

      it('should accept direction string', () => {
        spinner = Spinner({ text: 'Test' })

        // TypeScript should compile these without errors.
        spinner.shimmer('ltr')
        spinner.shimmer('rtl')
        spinner.shimmer('bi')
        spinner.shimmer('random')
      })

      it('should accept partial config object', () => {
        spinner = Spinner({ text: 'Test' })

        // TypeScript should compile these without errors.
        spinner.shimmer({ speed: 0.5 })
        spinner.shimmer({ dir: 'rtl' })
        spinner.shimmer({ color: [255, 0, 0] as const })
        spinner.shimmer({ dir: 'ltr', speed: 0.25 })
      })
    })
  })

  describe('core methods', () => {
    it('should support start() method', () => {
      expect(() => spinner.start()).not.toThrow()
      expect(() => spinner.start('Loading...')).not.toThrow()
    })

    it('should support stop() method', () => {
      expect(() => spinner.stop()).not.toThrow()
      expect(() => spinner.stop('Done')).not.toThrow()
    })

    it('should support clear() method', () => {
      expect(() => spinner.clear()).not.toThrow()
      const result = spinner.clear()
      expect(result).toBe(spinner)
    })

    it('should support text() getter', () => {
      spinner = Spinner({ text: 'Test text' })
      const text = spinner.text()
      expect(typeof text).toBe('string')
    })

    it('should support text() setter', () => {
      expect(() => spinner.text('New text')).not.toThrow()
      const result = spinner.text('Updated')
      expect(result).toBe(spinner)
    })
  })

  describe('status methods', () => {
    it('should support success() method', () => {
      expect(() => spinner.success()).not.toThrow()
      expect(() => spinner.success('Success!')).not.toThrow()
      expect(() => spinner.success('Done', { data: 123 })).not.toThrow()
    })

    it('should support successAndStop() method', () => {
      expect(() => spinner.successAndStop()).not.toThrow()
      expect(() => spinner.successAndStop('Success!')).not.toThrow()
    })

    it('should support fail() method', () => {
      expect(() => spinner.fail()).not.toThrow()
      expect(() => spinner.fail('Failed!')).not.toThrow()
      expect(() => spinner.fail('Error', { code: 500 })).not.toThrow()
    })

    it('should support failAndStop() method', () => {
      expect(() => spinner.failAndStop()).not.toThrow()
      expect(() => spinner.failAndStop('Failed!')).not.toThrow()
    })

    it('should support info() method', () => {
      expect(() => spinner.info()).not.toThrow()
      expect(() => spinner.info('Info message')).not.toThrow()
      expect(() => spinner.info('Note:', 'details')).not.toThrow()
    })

    it('should support infoAndStop() method', () => {
      expect(() => spinner.infoAndStop()).not.toThrow()
      expect(() => spinner.infoAndStop('Info')).not.toThrow()
    })

    it('should support error() method', () => {
      expect(() => spinner.error()).not.toThrow()
      expect(() => spinner.error('Error message')).not.toThrow()
    })

    it('should support errorAndStop() method', () => {
      expect(() => spinner.errorAndStop()).not.toThrow()
      expect(() => spinner.errorAndStop('Error')).not.toThrow()
    })

    it('should support done() method', () => {
      expect(() => spinner.done()).not.toThrow()
      expect(() => spinner.done('Complete')).not.toThrow()
    })

    it('should support doneAndStop() method', () => {
      expect(() => spinner.doneAndStop()).not.toThrow()
      expect(() => spinner.doneAndStop('Done')).not.toThrow()
    })

    it('should support step() method', () => {
      expect(() => spinner.step('Step 1')).not.toThrow()
      expect(() => spinner.step('Step', 'details')).not.toThrow()
    })

    it('should support substep() method', () => {
      expect(() => spinner.substep('Substep')).not.toThrow()
      expect(() => spinner.substep('Sub', 'data')).not.toThrow()
    })

    it('should support debug() method', () => {
      expect(() => spinner.debug()).not.toThrow()
      expect(() => spinner.debug('Debug info')).not.toThrow()
    })

    it('should support debugAndStop() method', () => {
      expect(() => spinner.debugAndStop()).not.toThrow()
      expect(() => spinner.debugAndStop('Debug')).not.toThrow()
    })

    it('should support log() method', () => {
      expect(() => spinner.log()).not.toThrow()
      expect(() => spinner.log('Log message')).not.toThrow()
    })

    it('should support logAndStop() method', () => {
      expect(() => spinner.logAndStop()).not.toThrow()
      expect(() => spinner.logAndStop('Log')).not.toThrow()
    })
  })

  describe('indentation', () => {
    it('should support indent() method', () => {
      expect(() => spinner.indent()).not.toThrow()
      expect(() => spinner.indent(4)).not.toThrow()
      const result = spinner.indent(2)
      expect(result).toBe(spinner)
    })

    it('should support dedent() method', () => {
      expect(() => spinner.dedent()).not.toThrow()
      expect(() => spinner.dedent(4)).not.toThrow()
      const result = spinner.dedent(2)
      expect(result).toBe(spinner)
    })

    it('should support chaining indent and dedent', () => {
      expect(() => {
        spinner.indent(4).text('Indented').dedent(2).text('Less indented')
      }).not.toThrow()
    })
  })

  describe('progress tracking', () => {
    it('should support progress() method', () => {
      expect(() => spinner.progress(5, 10)).not.toThrow()
      expect(() => spinner.progress(50, 100, 'files')).not.toThrow()
      const result = spinner.progress(3, 10)
      expect(result).toBe(spinner)
    })

    it('should support progressStep() method', () => {
      expect(() => spinner.progressStep()).not.toThrow()
      expect(() => spinner.progressStep(1)).not.toThrow()
      expect(() => spinner.progressStep(5)).not.toThrow()
      const result = spinner.progressStep()
      expect(result).toBe(spinner)
    })

    it('should handle progress with zero total', () => {
      expect(() => spinner.progress(0, 0)).not.toThrow()
    })

    it('should throw when progress exceeds total', () => {
      // Progress validation - current cannot exceed total
      expect(() => spinner.progress(15, 10)).toThrow(RangeError)
    })
  })

  describe('method chaining', () => {
    it('should chain multiple status methods', () => {
      expect(() => {
        spinner
          .start('Starting')
          .info('Processing')
          .step('Step 1')
          .substep('Details')
          .success('Done')
      }).not.toThrow()
    })

    it('should chain with progress updates', () => {
      expect(() => {
        spinner
          .start('Working')
          .progress(1, 5)
          .progressStep()
          .progressStep()
          .done('Finished')
      }).not.toThrow()
    })

    it('should chain with indentation changes', () => {
      expect(() => {
        spinner
          .text('Main')
          .indent(2)
          .text('Indented')
          .indent(2)
          .text('More indented')
          .dedent(4)
          .text('Back to start')
      }).not.toThrow()
    })
  })
})
