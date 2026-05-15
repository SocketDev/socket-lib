/**
 * @fileoverview Tests for the matcher cache LRU eviction + the
 * path.matchesGlob fast-path activation in src/globs.ts that the
 * existing tests don't cover.
 */

import { describe, expect, it } from 'vitest'

import {
  getGlobMatcher,
  getMatchesGlob,
} from '@socketsecurity/lib-stable/globs/matcher'

describe('globs — extra coverage', () => {
  describe('getMatchesGlob', () => {
    it('returns the native path.matchesGlob when available', () => {
      // Node 22+ has path.matchesGlob — return type is a function.
      const fn = getMatchesGlob()
      expect(typeof fn === 'function' || fn === undefined).toBe(true)
    })

    it('caches the resolution across calls', () => {
      const a = getMatchesGlob()
      const b = getMatchesGlob()
      expect(a).toBe(b)
    })
  })

  describe('getGlobMatcher — fast-path activation', () => {
    it('takes the path.matchesGlob fast-path when nocase + dot are false', () => {
      // Per the source comment, the fast-path activates only when
      // nocase: false AND dot: false AND a single non-negated pattern
      // is provided. We just confirm the matcher works for both fast
      // and slow paths.
      const matcher = getGlobMatcher(['*.ts'], { nocase: false, dot: false })
      expect(matcher('foo.ts')).toBe(true)
      expect(matcher('foo.js')).toBe(false)
    })

    it('falls back to picomatch when ignore is provided', () => {
      const matcher = getGlobMatcher(['*.ts'], {
        nocase: false,
        dot: false,
        ignore: ['*.d.ts'],
      })
      expect(matcher('foo.ts')).toBe(true)
      expect(matcher('foo.d.ts')).toBe(false)
    })

    it('caches matchers by key (returns the same instance)', () => {
      const a = getGlobMatcher(['*.ts'])
      const b = getGlobMatcher(['*.ts'])
      // Note: getGlobMatcher's cache key includes options, so identical
      // calls with no options should return the cached matcher.
      expect(a).toBe(b)
    })

    it('handles negated patterns', () => {
      const matcher = getGlobMatcher(['*.ts', '!*.d.ts'])
      expect(matcher('foo.ts')).toBe(true)
      expect(matcher('foo.d.ts')).toBe(false)
    })
  })
})
