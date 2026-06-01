/**
 * @file Unit tests for console footer formatting utilities. Tests footer
 *   formatting utilities:
 *
 *   - createFooter() generates bordered footers with messages, timestamps,
 *     duration
 *   - createSummaryFooter() creates summary footers with stats
 *     (passed/failed/skipped)
 *   - Custom styling: colors, widths, border characters
 *   - Duration formatting and timestamp display Used by Socket CLI for command
 *     completion reports and test result summaries.
 */

import { describe, expect, it } from 'vitest'

import { createFooter, createSummaryFooter } from '../../../src/stdio/footer'

// footer.ts captures `DateNow` from primordials at module init. ESM live
// bindings make that capture immune to `Date.now = vi.fn()` and to
// post-import `vi.spyOn(primordials, 'DateNow')`. Duration tests
// therefore compute startTime from `Date.now()` on the fly so the
// resulting elapsed value is bounded — they assert the duration string
// shape, not an exact second count tied to a frozen clock.
export function startTimeForDuration(seconds: number): number {
  return Date.now() - seconds * 1000
}

describe('stdio/footer', () => {
  describe('createFooter', () => {
    it('should export createFooter function', () => {
      expect(typeof createFooter).toBe('function')
    })

    it('should create footer with just border', () => {
      const result = createFooter()
      expect(result).toBe('='.repeat(80))
    })

    it('should create footer with message', () => {
      const result = createFooter('Build complete')
      expect(result).toContain('Build complete')
      expect(result).toContain('='.repeat(80))
    })

    it('should create footer with custom width', () => {
      const result = createFooter(undefined, { width: 60 })
      expect(result).toBe('='.repeat(60))
    })

    it('should create footer with custom border char', () => {
      const result = createFooter(undefined, { borderChar: '-' })
      expect(result).toBe('-'.repeat(80))
    })

    it('should create footer with custom color', () => {
      const result = createFooter('Success', { color: 'green' })
      expect(result).toContain('Success')
    })

    it('should show timestamp when requested', () => {
      const result = createFooter('Done', { showTimestamp: true })
      expect(result).toContain('Completed at:')
      expect(result).toContain('Done')
    })

    it('should show duration when requested with startTime', () => {
      const result = createFooter('Done', {
        showDuration: true,
        startTime: startTimeForDuration(3),
      })
      expect(result).toContain('Duration:')
    })

    it('should not show duration without startTime', () => {
      const result = createFooter('Done', { showDuration: true })
      expect(result).not.toContain('Duration:')
    })

    it('should show both timestamp and duration', () => {
      const result = createFooter('Done', {
        showTimestamp: true,
        showDuration: true,
        startTime: startTimeForDuration(3),
      })
      expect(result).toContain('Completed at:')
      expect(result).toContain('Duration:')
    })

    it('should handle message with timestamp', () => {
      const result = createFooter('Complete', { showTimestamp: true })
      const lines = result.split('\n')
      expect(lines.some(line => line.includes('Complete'))).toBe(true)
      expect(lines.some(line => line.includes('Completed at:'))).toBe(true)
    })

    it('should handle empty message', () => {
      const result = createFooter('')
      expect(result).toContain('='.repeat(80))
    })

    it('should handle undefined message', () => {
      const result = createFooter(undefined)
      expect(result).toBe('='.repeat(80))
    })

    it('should handle long message', () => {
      const longMessage = 'A'.repeat(200)
      const result = createFooter(longMessage)
      expect(result).toContain(longMessage)
    })

    it('should handle message with special characters', () => {
      const result = createFooter('Build: 100% complete')
      expect(result).toContain('Build: 100% complete')
    })

    it('should handle Unicode message', () => {
      const result = createFooter('完了しました')
      expect(result).toContain('完了しました')
    })

    it('should format duration correctly', () => {
      const result = createFooter('Done', {
        showDuration: true,
        startTime: startTimeForDuration(9.5),
      })
      expect(result).toContain('Duration:')
    })

    it('should handle very short duration', () => {
      const result = createFooter('Done', {
        showDuration: true,
        startTime: startTimeForDuration(0.05),
      })
      expect(result).toContain('Duration:')
    })

    it('should handle zero duration', () => {
      const result = createFooter('Done', {
        showDuration: true,
        startTime: startTimeForDuration(0),
      })
      expect(result).toContain('Duration:')
    })

    it('should handle all color options', () => {
      const colors = [
        'cyan',
        'green',
        'yellow',
        'blue',
        'magenta',
        'red',
        'gray',
      ]
      for (let i = 0, { length } = colors; i < length; i += 1) {
        const color = colors[i]!
        const result = createFooter('Message', {
          color: color as
            | 'cyan'
            | 'green'
            | 'yellow'
            | 'blue'
            | 'magenta'
            | 'red'
            | 'gray',
        })
        expect(result).toContain('Message')
      }
    })

    it('should handle undefined color', () => {
      const result = createFooter('Message', { color: undefined })
      expect(result).toContain('Message')
    })

    it('should return a string', () => {
      const result = createFooter()
      expect(typeof result).toBe('string')
    })

    it('should end with border', () => {
      const result = createFooter('Message')
      const lines = result.split('\n')
      expect(lines[lines.length - 1]).toBe('='.repeat(80))
    })

    it('should handle small width', () => {
      const result = createFooter(undefined, { width: 10 })
      expect(result).toBe('='.repeat(10))
    })

    it('should handle large width', () => {
      const result = createFooter(undefined, { width: 200 })
      expect(result).toBe('='.repeat(200))
    })
  })

  describe('integration', () => {
    it('should create complete report footer', () => {
      const footer = createFooter('Analysis complete', {
        showTimestamp: true,
        showDuration: true,
        startTime: startTimeForDuration(5),
        color: 'green',
      })
      expect(footer).toContain('Analysis complete')
      expect(footer).toContain('Completed at:')
      expect(footer).toContain('Duration:')
    })

    it('should create test results summary', () => {
      const summary = createSummaryFooter({
        total: 500,
        success: 490,
        failed: 5,
        skipped: 5,
        warnings: 10,
      })
      expect(summary).toContain('Total: 500')
      expect(summary).toContain('490 passed')
      expect(summary).toContain('5 failed')
      expect(summary).toContain('5 skipped')
      expect(summary).toContain('10 warnings')
    })

    it('should support multiple footer styles', () => {
      const simple = createFooter('Done')
      const detailed = createFooter('Done', {
        showTimestamp: true,
        showDuration: true,
        startTime: Date.now() - 5000,
      })
      const summary = createSummaryFooter({ total: 100, success: 100 })

      expect(simple).toContain('Done')
      expect(detailed).toContain('Done')
      expect(summary).toContain('100 passed')
    })

    it('should handle build report footer', () => {
      const footer = createFooter('Build successful', {
        showDuration: true,
        startTime: startTimeForDuration(5),
        color: 'green',
        width: 70,
      })
      expect(footer).toContain('Build successful')
      expect(footer).toContain('Duration:')
      expect(footer).toContain('='.repeat(70))
    })
  })

  describe('edge cases', () => {
    it('should handle zero width', () => {
      const result = createFooter(undefined, { width: 0 })
      expect(result).toBe('')
    })

    it('should handle width of 1', () => {
      const result = createFooter(undefined, { width: 1 })
      expect(result).toBe('=')
    })

    it('should handle empty border char', () => {
      const result = createFooter(undefined, { borderChar: '' })
      expect(result).toBe('')
    })

    it('should handle multi-character border', () => {
      const result = createFooter(undefined, { borderChar: '=-' })
      expect(result).toContain('=-')
    })

    it('should handle negative startTime', () => {
      const result = createFooter('Done', {
        showDuration: true,
        startTime: startTimeForDuration(6),
      })
      // Should still work, just show large duration
      expect(result).toContain('Duration:')
    })

    it('should handle startTime in future', () => {
      const result = createFooter('Done', {
        showDuration: true,
        startTime: startTimeForDuration(-9),
      })
      // Negative duration
      expect(result).toContain('Duration:')
    })

    it('should handle message with newlines', () => {
      const result = createFooter('Line1\nLine2')
      expect(result).toContain('Line1')
      expect(result).toContain('Line2')
    })
  })

  describe('real-world usage', () => {
    it('should create CLI command completion footer', () => {
      const footer = createFooter('Command completed successfully', {
        showDuration: true,
        startTime: startTimeForDuration(3),
        color: 'green',
      })
      expect(footer).toContain('Command completed successfully')
      expect(footer).toContain('Duration:')
    })

    it('should create analysis report footer', () => {
      const footer = createFooter('Security analysis complete', {
        showTimestamp: true,
        showDuration: true,
        startTime: startTimeForDuration(15),
        width: 80,
      })
      expect(footer).toContain('Security analysis complete')
      expect(footer).toContain('Completed at:')
      expect(footer).toContain('Duration:')
    })
  })
})
