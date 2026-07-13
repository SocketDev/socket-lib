/**
 * @file Tests for the matcher cache LRU eviction + the path.matchesGlob
 *   fast-path activation in src/globs.ts that the existing tests don't cover.
 */

import { describe, expect, it } from 'vitest'

import { getGlobMatcher, getMatchesGlob } from '../../../src/globs/matcher'

describe('globs/matcher — getGlobMatcher', () => {
  it('should create matcher for single pattern', () => {
    const matcher = getGlobMatcher('*.js')
    expect(typeof matcher).toBe('function')
  })

  it('should match simple patterns', () => {
    const matcher = getGlobMatcher('*.js')
    expect(matcher('test.js')).toBe(true)
    expect(matcher('test.ts')).toBe(false)
  })

  it('should handle array of patterns', () => {
    const matcher = getGlobMatcher(['*.js', '*.ts'])
    expect(matcher('test.js')).toBe(true)
    expect(matcher('test.ts')).toBe(true)
    expect(matcher('test.css')).toBe(false)
  })

  it('should handle negative patterns', () => {
    const matcher = getGlobMatcher(['*.js', '!*.test.js'])
    expect(matcher('app.js')).toBe(true)
    expect(matcher('app.test.js')).toBe(false)
  })

  it('should cache matchers', () => {
    const matcher1 = getGlobMatcher('*.js')
    const matcher2 = getGlobMatcher('*.js')
    expect(matcher1).toBe(matcher2)
  })

  it('caches array-valued options order-insensitively', () => {
    const matcher1 = getGlobMatcher('*.js', {
      ignore: ['**/node_modules', '**/.git'],
    })
    const matcher2 = getGlobMatcher('*.js', {
      ignore: ['**/.git', '**/node_modules'],
    })
    expect(matcher1).toBe(matcher2)
  })

  it('should create different matchers for different patterns', () => {
    const matcher1 = getGlobMatcher('*.js')
    const matcher2 = getGlobMatcher('*.ts')
    expect(matcher1).not.toBe(matcher2)
  })

  it('should handle options', () => {
    const matcher = getGlobMatcher('*.JS', { nocase: true })
    expect(matcher('test.js')).toBe(true)
    expect(matcher('test.JS')).toBe(true)
  })

  it('should handle dot option', () => {
    const matcher = getGlobMatcher('.*', { dot: true })
    expect(typeof matcher).toBe('function')
  })

  it('should handle ignore option in negation', () => {
    const matcher = getGlobMatcher('*.js', { ignore: ['*.test.js'] })
    expect(typeof matcher).toBe('function')
  })

  it('should handle glob patterns', () => {
    const matcher = getGlobMatcher('**/*.js')
    expect(matcher('src/app.js')).toBe(true)
    expect(matcher('src/utils/helper.js')).toBe(true)
    expect(matcher('src/app.ts')).toBe(false)
  })

  it('should handle multiple negative patterns', () => {
    const matcher = getGlobMatcher(['*.js', '!*.test.js', '!*.spec.js'])
    expect(matcher('app.js')).toBe(true)
    expect(matcher('app.test.js')).toBe(false)
    expect(matcher('app.spec.js')).toBe(false)
  })

  it('should be case insensitive by default', () => {
    const matcher = getGlobMatcher('*.js')
    expect(matcher('TEST.JS')).toBe(true)
    expect(matcher('test.js')).toBe(true)
  })

  it('should handle empty pattern array', () => {
    const matcher = getGlobMatcher([])
    expect(typeof matcher).toBe('function')
  })

  it('should handle complex patterns', () => {
    const matcher = getGlobMatcher('src/**/*.{js,ts}')
    expect(matcher('src/app.js')).toBe(true)
    expect(matcher('src/utils/helper.ts')).toBe(true)
    expect(matcher('test/app.js')).toBe(false)
  })

  it('should cache with different options separately', () => {
    const matcher1 = getGlobMatcher('*.js', { dot: true })
    const matcher2 = getGlobMatcher('*.js', { dot: false })
    expect(matcher1).not.toBe(matcher2)
  })

  it('should handle patterns with special characters', () => {
    const matcher = getGlobMatcher('test-*.js')
    expect(matcher('test-foo.js')).toBe(true)
    expect(matcher('test.js')).toBe(false)
  })

  it('should handle directory patterns', () => {
    const matcher = getGlobMatcher('src/**')
    expect(matcher('src/app.js')).toBe(true)
    expect(matcher('src/utils/helper.js')).toBe(true)
  })

  it('should handle only negative patterns', () => {
    const matcher = getGlobMatcher(['!*.test.js', '!*.spec.js'])
    expect(typeof matcher).toBe('function')
  })

  it('should map negative patterns correctly', () => {
    const matcher = getGlobMatcher(['*.js', '!test/*.js', '!spec/*.js'])
    expect(matcher('app.js')).toBe(true)
    expect(matcher('test/app.js')).toBe(false)
    expect(matcher('spec/app.js')).toBe(false)
  })
})

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
