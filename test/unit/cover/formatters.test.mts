/**
 * @fileoverview Unit tests for coverage output formatters.
 *
 * Covers `formatCoverage` (default/simple/json formats) and
 * `getCoverageEmoji` (every threshold band).
 */

import { describe, expect, it } from 'vitest'

import {
  formatCoverage,
  getCoverageEmoji,
} from '@socketsecurity/lib/cover/formatters'

const sampleCode = {
  statements: { covered: 85, total: 100, percent: '85.00' },
  branches: { covered: 80, total: 100, percent: '80.00' },
  functions: { covered: 90, total: 100, percent: '90.00' },
  lines: { covered: 88, total: 100, percent: '88.00' },
}

describe('cover/formatters', () => {
  describe('getCoverageEmoji', () => {
    it('returns rocket for >= 99%', () => {
      expect(getCoverageEmoji(99)).toBe(' 🚀')
      expect(getCoverageEmoji(100)).toBe(' 🚀')
    })

    it('returns target for >= 95%', () => {
      expect(getCoverageEmoji(95)).toBe(' 🎯')
      expect(getCoverageEmoji(98.99)).toBe(' 🎯')
    })

    it('returns sparkles for >= 90%', () => {
      expect(getCoverageEmoji(90)).toBe(' ✨')
      expect(getCoverageEmoji(94.99)).toBe(' ✨')
    })

    it('returns heart for >= 85%', () => {
      expect(getCoverageEmoji(85)).toBe(' 💚')
      expect(getCoverageEmoji(89.99)).toBe(' 💚')
    })

    it('returns check for >= 80%', () => {
      expect(getCoverageEmoji(80)).toBe(' ✅')
    })

    it('returns green-circle for >= 70%', () => {
      expect(getCoverageEmoji(70)).toBe(' 🟢')
    })

    it('returns yellow-circle for >= 60%', () => {
      expect(getCoverageEmoji(60)).toBe(' 🟡')
    })

    it('returns hammer for >= 50%', () => {
      expect(getCoverageEmoji(50)).toBe(' 🔨')
    })

    it('returns warning for < 50%', () => {
      expect(getCoverageEmoji(49)).toBe(' ⚠️')
      expect(getCoverageEmoji(0)).toBe(' ⚠️')
    })

    it('handles negative percentages by returning empty string', () => {
      // No threshold matches; .find returns undefined → '' fallback.
      expect(getCoverageEmoji(-1)).toBe('')
    })
  })

  describe('formatCoverage', () => {
    it('produces a default human-readable report', () => {
      const out = formatCoverage({ code: sampleCode })
      expect(out).toContain('Code Coverage:')
      expect(out).toContain('Statements: 85.00%')
      expect(out).toContain('Branches: 80.00%')
      expect(out).toContain('Functions: 90.00%')
      expect(out).toContain('Lines: 88.00%')
      expect(out).toContain('Overall: 85.75%')
    })

    it('returns JSON when format=json', () => {
      const out = formatCoverage({ code: sampleCode, format: 'json' })
      const parsed = JSON.parse(out)
      expect(parsed.code).toEqual(sampleCode)
    })

    it('returns just the overall percent when format=simple', () => {
      const out = formatCoverage({ code: sampleCode, format: 'simple' })
      expect(out).toBe('85.75')
    })

    it('includes type coverage section when present', () => {
      const out = formatCoverage({
        code: sampleCode,
        type: { covered: 1500, total: 2000, percent: '75.00' },
      })
      expect(out).toContain('Type Coverage:')
      expect(out).toContain('75.00% (1500/2000)')
    })

    it('includes type in overall average when present', () => {
      const out = formatCoverage({
        code: sampleCode,
        type: { covered: 5, total: 10, percent: '50.00' },
        format: 'simple',
      })
      // average of (85, 80, 90, 88, 50) = 78.6
      expect(out).toBe('78.60')
    })

    it('handles NaN percent values as 0', () => {
      const broken = {
        statements: { covered: 0, total: 0, percent: 'NaN' },
        branches: { covered: 0, total: 0, percent: 'NaN' },
        functions: { covered: 0, total: 0, percent: 'NaN' },
        lines: { covered: 0, total: 0, percent: 'NaN' },
      }
      const out = formatCoverage({ code: broken, format: 'simple' })
      expect(out).toBe('0.00')
    })

    it('appends an emoji to the overall line in default format', () => {
      const out = formatCoverage({ code: sampleCode })
      // 85.75% overall → 💚 band.
      expect(out).toContain('💚')
    })
  })
})
