/**
 * @file Unit tests for createSummaryFooter() — summary footers with stats
 *   (passed/failed/skipped/warnings/errors). Companion to footer.test.mts,
 *   which covers createFooter(). Split out to stay under the file-size cap.
 *   Used by Socket CLI for test result summaries.
 */

import { describe, expect, it } from 'vitest'

import { createSummaryFooter } from '../../../src/stdio/footer'

describe('stdio/footer createSummaryFooter', () => {
  describe('createSummaryFooter', () => {
    it('should export createSummaryFooter function', () => {
      expect(typeof createSummaryFooter).toBe('function')
    })

    it('should create summary with total', () => {
      const result = createSummaryFooter({ total: 100 })
      expect(result).toContain('Total: 100')
    })

    it('should create summary with success count', () => {
      const result = createSummaryFooter({ success: 95 })
      expect(result).toContain('95 passed')
    })

    it('should create summary with failed count', () => {
      const result = createSummaryFooter({ failed: 5 })
      expect(result).toContain('5 failed')
    })

    it('should not show failed when count is zero', () => {
      const result = createSummaryFooter({ failed: 0 })
      expect(result).not.toContain('failed')
    })

    it('should create summary with skipped count', () => {
      const result = createSummaryFooter({ skipped: 3 })
      expect(result).toContain('3 skipped')
    })

    it('should not show skipped when count is zero', () => {
      const result = createSummaryFooter({ skipped: 0 })
      expect(result).not.toContain('skipped')
    })

    it('should create summary with warnings', () => {
      const result = createSummaryFooter({ warnings: 10 })
      expect(result).toContain('10 warnings')
    })

    it('should not show warnings when count is zero', () => {
      const result = createSummaryFooter({ warnings: 0 })
      expect(result).not.toContain('warnings')
    })

    it('should create summary with errors', () => {
      const result = createSummaryFooter({ errors: 2 })
      expect(result).toContain('2 errors')
    })

    it('should not show errors when count is zero', () => {
      const result = createSummaryFooter({ errors: 0 })
      expect(result).not.toContain('errors')
    })

    it('should create comprehensive summary', () => {
      const result = createSummaryFooter({
        total: 150,
        success: 145,
        failed: 3,
        skipped: 2,
        warnings: 5,
      })
      expect(result).toContain('Total: 150')
      expect(result).toContain('145 passed')
      expect(result).toContain('3 failed')
      expect(result).toContain('2 skipped')
      expect(result).toContain('5 warnings')
    })

    it('should separate stats with pipe', () => {
      const result = createSummaryFooter({
        total: 100,
        success: 95,
        failed: 5,
      })
      expect(result).toContain('|')
    })

    // createSummaryFooter renders the canonical LOG_SYMBOLS shapes
    // (✔/✖/↻/⚠) — the same set used by logger.success / logger.fail /
    // logger.skip / logger.warn. Earlier expectations of ✓/✗/○
    // predated the migration to LOG_SYMBOLS in symbols-builder.ts.
    it('should use checkmark for success', () => {
      const result = createSummaryFooter({ success: 100 })
      // oxlint-disable-next-line socket/no-status-emoji -- expect string literal
      expect(result).toContain('✔')
    })

    it('should use cross for failed', () => {
      const result = createSummaryFooter({ failed: 5 })
      // oxlint-disable-next-line socket/no-status-emoji -- expect string literal
      expect(result).toContain('✖')
    })

    it('should use circle for skipped', () => {
      const result = createSummaryFooter({ skipped: 3 })
      // socket-lib's skip symbol is ↻ (cyan recycle); see
      // src/logger/symbols-builder.ts.
      expect(result).toContain('↻')
    })

    it('should use warning symbol for warnings', () => {
      const result = createSummaryFooter({ warnings: 10 })
      // oxlint-disable-next-line socket/no-status-emoji -- expect string literal
      expect(result).toContain('⚠')
    })

    it('should use cross for errors', () => {
      const result = createSummaryFooter({ errors: 2 })
      // oxlint-disable-next-line socket/no-status-emoji -- expect string literal
      expect(result).toContain('✖')
    })

    it('should handle empty stats', () => {
      const result = createSummaryFooter({})
      expect(result).toContain('='.repeat(80))
    })

    it('should handle single stat', () => {
      const result = createSummaryFooter({ total: 50 })
      expect(result).toContain('Total: 50')
    })

    it('should handle all stats', () => {
      const result = createSummaryFooter({
        total: 200,
        success: 180,
        failed: 10,
        skipped: 5,
        warnings: 15,
        errors: 5,
      })
      expect(result).toContain('Total: 200')
      expect(result).toContain('180 passed')
      expect(result).toContain('10 failed')
      expect(result).toContain('5 skipped')
      expect(result).toContain('15 warnings')
      expect(result).toContain('5 errors')
    })

    it('should accept footer options', () => {
      const result = createSummaryFooter(
        { total: 100 },
        { width: 60, borderChar: '-' },
      )
      expect(result).toContain('-'.repeat(60))
    })

    it('should show duration when provided', () => {
      const result = createSummaryFooter({
        total: 100,
        duration: 5000,
      })
      expect(result).toContain('Duration:')
    })

    it('should not show duration when undefined', () => {
      const result = createSummaryFooter({ total: 100 })
      expect(result).not.toContain('Duration:')
    })

    it('should handle zero values', () => {
      const result = createSummaryFooter({
        total: 0,
        success: 0,
      })
      expect(result).toContain('Total: 0')
      expect(result).toContain('0 passed')
    })

    it('should handle undefined total', () => {
      const result = createSummaryFooter({
        success: 100,
      })
      expect(result).not.toContain('Total:')
      expect(result).toContain('100 passed')
    })

    it('should handle large numbers', () => {
      const result = createSummaryFooter({
        total: 999_999,
        success: 999_998,
        failed: 1,
      })
      expect(result).toContain('Total: 999999')
      expect(result).toContain('999998 passed')
      expect(result).toContain('1 failed')
    })

    it('should return a string', () => {
      const result = createSummaryFooter({ total: 100 })
      expect(typeof result).toBe('string')
    })

    it('should end with border', () => {
      const result = createSummaryFooter({ total: 100 })
      const lines = result.split('\n')
      expect(lines[lines.length - 1]).toBe('='.repeat(80))
    })
  })

  describe('real-world usage', () => {
    it('should create test suite summary', () => {
      const summary = createSummaryFooter({
        total: 1247,
        success: 1245,
        failed: 2,
        skipped: 0,
        warnings: 15,
      })
      expect(summary).toContain('Total: 1247')
      expect(summary).toContain('1245 passed')
      expect(summary).toContain('2 failed')
      expect(summary).not.toContain('skipped')
      expect(summary).toContain('15 warnings')
    })

    it('should create build summary', () => {
      const summary = createSummaryFooter(
        {
          total: 350,
          success: 348,
          failed: 2,
          warnings: 25,
          duration: 15_000,
        },
        { color: 'blue' },
      )
      expect(summary).toContain('Total: 350')
      expect(summary).toContain('348 passed')
      expect(summary).toContain('2 failed')
      expect(summary).toContain('25 warnings')
      expect(summary).toContain('Duration:')
    })

    it('should create linter summary', () => {
      const summary = createSummaryFooter({
        total: 87,
        errors: 5,
        warnings: 23,
      })
      expect(summary).toContain('Total: 87')
      expect(summary).toContain('5 errors')
      expect(summary).toContain('23 warnings')
    })

    it('should create perfect test run summary', () => {
      const summary = createSummaryFooter({
        total: 500,
        success: 500,
        failed: 0,
        skipped: 0,
      })
      expect(summary).toContain('Total: 500')
      expect(summary).toContain('500 passed')
      expect(summary).not.toContain('failed')
      expect(summary).not.toContain('skipped')
    })

    it('should handle negative stat values', () => {
      const result = createSummaryFooter({
        total: -10,
        success: -5,
      })
      expect(result).toContain('Total: -10')
      expect(result).toContain('-5 passed')
    })
  })
})
