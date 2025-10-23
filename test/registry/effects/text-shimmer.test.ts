import { stripAnsi } from '@socketsecurity/lib/ansi'
import {
  applyShimmer,
  DIR_LTR,
  DIR_NONE,
  type ShimmerState,
} from '@socketsecurity/lib/effects/text-shimmer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('text-shimmer', () => {
  describe('applyShimmer()', () => {
    let state: ShimmerState

    beforeEach(() => {
      state = {
        __proto__: null,
        currentDir: DIR_LTR,
        mode: DIR_LTR,
        speed: 1 / 3,
        step: 0,
      } as ShimmerState
    })

    describe('CI environment', () => {
      it('should disable shimmer effect when CI is true', async () => {
        // Mock CI environment
        vi.doMock('#env/ci', () => ({ CI: true }))
        const { applyShimmer: applyShimmerCI } = await import(
          '@socketsecurity/lib/effects/text-shimmer'
        )

        const text = 'Test text'
        const result = applyShimmerCI(text, state, {
          color: [140, 82, 255] as const,
          direction: DIR_LTR,
        })

        // Result should be colored but not have shimmer animation codes
        const stripped = stripAnsi(result)
        expect(stripped).toBe(text)

        // Should contain color codes but not varying intensity
        expect(result).toContain('\x1b[38;2;')
        expect(result).toContain('140;82;255')

        vi.doUnmock('#env/ci')
      })

      it('should return static colored text in CI regardless of direction', async () => {
        // Mock CI environment
        vi.doMock('#env/ci', () => ({ CI: true }))
        const { applyShimmer: applyShimmerCI } = await import(
          '@socketsecurity/lib/effects/text-shimmer'
        )

        const text = 'Test'
        const directions = [DIR_LTR, 'rtl', 'bi', 'random'] as const

        for (const dir of directions) {
          const result = applyShimmerCI(text, state, {
            color: [255, 0, 0] as const,
            direction: dir,
          })

          const stripped = stripAnsi(result)
          expect(stripped).toBe(text)
        }

        vi.doUnmock('#env/ci')
      })
    })

    describe('non-CI environment', () => {
      it('should apply shimmer effect when CI is false', () => {
        const text = 'Test'
        const result = applyShimmer(text, state, {
          color: [140, 82, 255] as const,
          direction: DIR_LTR,
        })

        // Result should contain ANSI color codes
        expect(result).toContain('\x1b[38;2;')
        // Result should have the original text when stripped
        expect(stripAnsi(result)).toBe(text)
      })

      it('should animate shimmer position across frames', () => {
        const text = 'Testing'
        const state1: ShimmerState = {
          currentDir: DIR_LTR,
          mode: DIR_LTR,
          speed: 1,
          step: 0,
        }

        const result1 = applyShimmer(text, state1, {
          color: [140, 82, 255] as const,
          direction: DIR_LTR,
        })

        // Step should advance
        expect(state1.step).toBe(1)

        const result2 = applyShimmer(text, state1, {
          color: [140, 82, 255] as const,
          direction: DIR_LTR,
        })

        // Step should advance again
        expect(state1.step).toBe(2)

        // Results should be different due to shimmer position change
        expect(result1).not.toBe(result2)
      })
    })

    describe('direction modes', () => {
      it('should respect DIR_NONE and not apply shimmer', () => {
        const text = 'Test'
        const result = applyShimmer(text, state, {
          color: [140, 82, 255] as const,
          direction: DIR_NONE,
        })

        // Should be colored but state.step should not advance
        expect(state.step).toBe(0)
        expect(stripAnsi(result)).toBe(text)
      })

      it('should apply LTR direction shimmer', () => {
        const text = 'Test'
        const result = applyShimmer(text, state, {
          color: [140, 82, 255] as const,
          direction: DIR_LTR,
        })

        // Step should advance
        expect(state.step).toBeGreaterThan(0)
        expect(stripAnsi(result)).toBe(text)
      })
    })

    describe('color options', () => {
      it('should apply single color to text', () => {
        const text = 'Test'
        const color: readonly [number, number, number] = [255, 0, 0] as const

        const result = applyShimmer(text, state, {
          color,
          direction: DIR_LTR,
        })

        // Should contain the red color code
        expect(result).toContain('\x1b[38;2;')
        expect(stripAnsi(result)).toBe(text)
      })

      it('should apply gradient colors to text', () => {
        const text = 'Test'
        const gradient: readonly (readonly [number, number, number])[] = [
          [255, 0, 0],
          [0, 255, 0],
          [0, 0, 255],
        ] as const

        const result = applyShimmer(text, state, {
          color: gradient,
          direction: DIR_LTR,
        })

        // Should contain color codes
        expect(result).toContain('\x1b[38;2;')
        expect(stripAnsi(result)).toBe(text)
      })
    })

    describe('edge cases', () => {
      it('should handle empty text', () => {
        const result = applyShimmer('', state, {
          color: [140, 82, 255] as const,
          direction: DIR_LTR,
        })

        expect(result).toBe('')
      })

      it('should preserve text content when shimmer is applied', () => {
        const texts = ['Simple', 'With Spaces', 'Special!@#$%']

        for (const text of texts) {
          const result = applyShimmer(text, state, {
            color: [140, 82, 255] as const,
            direction: DIR_LTR,
          })

          expect(stripAnsi(result)).toBe(text)
        }
      })
    })
  })
})
