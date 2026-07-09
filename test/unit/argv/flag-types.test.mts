/**
 * @file Unit tests for src/argv/flag-types — COMMON_FLAGS and FlagValues types.
 */

import { describe, expect, it } from 'vitest'

import { COMMON_FLAGS } from '../../../src/argv/flag-types'

describe('argv/flag-types', () => {
  describe('COMMON_FLAGS', () => {
    it('should be defined', () => {
      expect(COMMON_FLAGS).toBeDefined()
      expect(typeof COMMON_FLAGS).toBe('object')
    })

    it.each([
      { name: 'all', extra: { default: false } },
      { name: 'changed' },
      { name: 'coverage' },
      { name: 'debug' },
      { name: 'dry-run' },
      { name: 'fix' },
      { name: 'force' },
      { name: 'help', extra: { short: 'h' } },
      { name: 'json' },
      { name: 'quiet', extra: { short: 'q' } },
      { name: 'silent' },
      { name: 'staged' },
      { name: 'update', extra: { short: 'u' } },
      { name: 'verbose', extra: { short: 'v' } },
      { name: 'watch', extra: { short: 'w' } },
    ])('should define $name as boolean flag', ({ name, extra }) => {
      const flag = COMMON_FLAGS[name as keyof typeof COMMON_FLAGS]
      expect(flag).toBeDefined()
      expect(flag.type).toBe('boolean')
      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          expect(flag[key as keyof typeof flag]).toBe(value)
        }
      }
    })

    it('should have descriptions for all flags', () => {
      for (const { 1: config } of Object.entries(COMMON_FLAGS)) {
        expect(config.description).toBeDefined()
        expect(typeof config.description).toBe('string')
        expect(config.description.length).toBeGreaterThan(0)
      }
    })
  })
})
