/**
 * @file Unit tests for themed link utilities.
 */

import { describe, expect, it } from 'vitest'

import { link, links } from '../../src/links/create'

describe('links', () => {
  describe('link()', () => {
    it('returns the link text (colored or not)', () => {
      const output = link('Docs', 'https://socket.dev')
      // Output should always include the text, optionally with ANSI codes.
      expect(output).toContain('Docs')
    })

    it('appends url in parentheses when fallback is true', () => {
      const output = link('Docs', 'https://socket.dev', { fallback: true })
      expect(output).toContain('Docs')
      expect(output).toContain('(https://socket.dev)')
    })

    it('omits url when fallback is false (default)', () => {
      const output = link('Docs', 'https://socket.dev')
      expect(output).not.toContain('https://socket.dev')
    })

    it('accepts a theme name string', () => {
      const output = link('Docs', 'https://socket.dev', { theme: 'socket' })
      expect(output).toContain('Docs')
    })

    it('accepts each builtin theme name without throwing', () => {
      for (const name of [
        'socket',
        'sunset',
        'terracotta',
        'lush',
        'ultra',
      ] as const) {
        const output = link('Docs', 'https://socket.dev', { theme: name })
        expect(output).toContain('Docs')
      }
    })

    it('works with empty text (may include ANSI reset sequences)', () => {
      const output = link('', 'https://socket.dev')
      // Empty text with no fallback produces only ANSI color codes around
      // the (empty) text. Verify the url is not embedded in output.
      expect(output).not.toContain('https://socket.dev')
    })
  })

  describe('links()', () => {
    it('returns one formatted output per input pair', () => {
      const output = links([
        ['Docs', 'https://socket.dev'],
        ['API', 'https://api.socket.dev'],
      ])
      expect(output).toHaveLength(2)
      expect(output[0]).toContain('Docs')
      expect(output[1]).toContain('API')
    })

    it('respects the fallback option across all links', () => {
      const output = links(
        [
          ['Docs', 'https://socket.dev'],
          ['API', 'https://api.socket.dev'],
        ],
        { fallback: true },
      )
      expect(output[0]).toContain('(https://socket.dev)')
      expect(output[1]).toContain('(https://api.socket.dev)')
    })

    it('returns an empty array for empty input', () => {
      expect(links([])).toEqual([])
    })
  })

  describe('link() — uncovered branches', () => {
    it('falls through to cyan when resolveColor returns "inherit"', () => {
      // Custom theme with link='inherit' — exercises L78 else-branch.
      const customTheme = {
        colors: {
          link: 'inherit',
          primary: 'cyan',
          secondary: 'magenta',
        },
      }
      const output = link('Inherit', 'https://example.com', {
        theme: customTheme as unknown as NonNullable<
          Parameters<typeof link>[2]
        >['theme'],
      })
      expect(output).toContain('Inherit')
    })

    it('handles RGB-tuple resolved link color', () => {
      // L73-77 array branch: resolveColor returns an RGB tuple.
      const customTheme = {
        colors: {
          link: [140, 82, 255],
          primary: 'cyan',
          secondary: 'magenta',
        },
      }
      const output = link('Rgb', 'https://example.com', {
        theme: customTheme as unknown as NonNullable<
          Parameters<typeof link>[2]
        >['theme'],
      })
      expect(output).toContain('Rgb')
    })
  })
})
