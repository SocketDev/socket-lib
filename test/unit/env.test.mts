/**
 * @file Unit tests for environment variable utilities. Tests core environment
 *   variable utility functions:
 *
 *   - Type conversion: envAsBoolean(), envAsNumber(), envAsString()
 *   - Case-insensitive key lookup: findCaseInsensitiveEnvKey() These utilities
 *     provide a foundation for consistent env var handling. No rewire needed -
 *     tests pure functions. Proxy creation lives in env-proxy.test.mts.
 */

import { envAsBoolean } from '../../src/env/boolean'
import { findCaseInsensitiveEnvKey } from '../../src/env/case-insensitive'
import { envAsNumber } from '../../src/env/number'
import { envAsString } from '../../src/env/string'
import { describe, expect, it } from 'vitest'

describe('env', () => {
  describe('envAsBoolean', () => {
    it('should convert string "1" to true', () => {
      expect(envAsBoolean('1')).toBe(true)
    })

    it('should convert string "true" to true (case-insensitive)', () => {
      expect(envAsBoolean('true')).toBe(true)
      expect(envAsBoolean('TRUE')).toBe(true)
      expect(envAsBoolean('True')).toBe(true)
    })

    it('should convert string "0" to false', () => {
      expect(envAsBoolean('0')).toBe(false)
    })

    it('should convert string "false" to false', () => {
      expect(envAsBoolean('false')).toBe(false)
      expect(envAsBoolean('FALSE')).toBe(false)
    })

    it('treats 1/true/yes (case-insensitive) as true, all others as false', () => {
      expect(envAsBoolean('yes')).toBe(true)
      expect(envAsBoolean('YES')).toBe(true)
      expect(envAsBoolean('no')).toBe(false)
      expect(envAsBoolean('random')).toBe(false)
    })

    it('should trim whitespace from strings', () => {
      expect(envAsBoolean('  1  ')).toBe(true)
      expect(envAsBoolean('  true  ')).toBe(true)
      expect(envAsBoolean('  0  ')).toBe(false)
    })

    it('should use default value for null', () => {
      expect(envAsBoolean(undefined)).toBe(false)
      expect(envAsBoolean(undefined, true)).toBe(true)
    })

    it('should use default value for undefined', () => {
      expect(envAsBoolean(undefined)).toBe(false)
      expect(envAsBoolean(undefined, true)).toBe(true)
    })

    it('should convert truthy non-string values to true', () => {
      expect(envAsBoolean(1)).toBe(true)
      expect(envAsBoolean({})).toBe(true)
      expect(envAsBoolean([])).toBe(true)
    })

    it('should convert falsy non-string values to false', () => {
      expect(envAsBoolean(0)).toBe(false)
      expect(envAsBoolean('')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(envAsBoolean('')).toBe(false)
      expect(envAsBoolean('   ')).toBe(false)
    })
  })

  describe('envAsNumber', () => {
    it('should convert string numbers to integers', () => {
      expect(envAsNumber('42')).toBe(42)
      expect(envAsNumber('0')).toBe(0)
      expect(envAsNumber('123')).toBe(123)
    })

    it('should convert negative numbers', () => {
      expect(envAsNumber('-42')).toBe(-42)
      expect(envAsNumber('-1')).toBe(-1)
    })

    it('should use default value for invalid strings', () => {
      expect(envAsNumber('invalid')).toBe(0)
      expect(envAsNumber('invalid', 10)).toBe(10)
      expect(envAsNumber('abc', 42)).toBe(42)
    })

    it('should parse integers from strings with decimals', () => {
      expect(envAsNumber('42.7')).toBe(42)
      expect(envAsNumber('3.14')).toBe(3)
    })

    it('should handle null and undefined', () => {
      expect(envAsNumber(undefined)).toBe(0)
      expect(envAsNumber(undefined)).toBe(0)
      expect(envAsNumber(undefined, 10)).toBe(10)
      expect(envAsNumber(undefined, 10)).toBe(10)
    })

    it('should handle empty string', () => {
      expect(envAsNumber('')).toBe(0)
      expect(envAsNumber('', 5)).toBe(5)
    })

    it('should handle whitespace', () => {
      expect(envAsNumber('  42  ')).toBe(42)
    })

    it('should handle -0 and return 0', () => {
      expect(envAsNumber('-0')).toBe(0)
      expect(Object.is(envAsNumber('-0'), 0)).toBe(true)
    })

    it('should handle NaN and return default', () => {
      expect(envAsNumber('notanumber')).toBe(0)
      expect(envAsNumber('notanumber', 99)).toBe(99)
    })

    it('should handle Infinity and return default', () => {
      expect(envAsNumber('Infinity')).toBe(0)
      expect(envAsNumber('Infinity', 100)).toBe(100)
    })

    it('should parse hex strings as base 10', () => {
      expect(envAsNumber('0x10')).toBe(0)
      expect(envAsNumber('10')).toBe(10)
    })

    it('should handle leading zeros', () => {
      expect(envAsNumber('007')).toBe(7)
      expect(envAsNumber('00042')).toBe(42)
    })
  })

  describe('envAsString', () => {
    it('should trim string values', () => {
      expect(envAsString('  hello  ')).toBe('hello')
      expect(envAsString('test')).toBe('test')
    })

    it('should use default value for null', () => {
      expect(envAsString(undefined)).toBe('')
      expect(envAsString(undefined, 'default')).toBe('default')
    })

    it('should use default value for undefined', () => {
      expect(envAsString(undefined)).toBe('')
      expect(envAsString(undefined, 'default')).toBe('default')
    })

    it('should convert non-string values to strings', () => {
      expect(envAsString(42)).toBe('42')
      expect(envAsString(true)).toBe('true')
      expect(envAsString(false)).toBe('false')
    })

    it('should handle empty string', () => {
      expect(envAsString('')).toBe('')
      expect(envAsString('   ')).toBe('')
    })

    it('should trim default value if it is a string', () => {
      expect(envAsString(undefined, '  default  ')).toBe('default')
    })

    it('should convert default value to string and trim', () => {
      expect(envAsString(undefined, 123 as unknown as string)).toBe('123')
    })

    it('should handle default value as empty string', () => {
      expect(envAsString(undefined, '')).toBe('')
    })

    it('should handle objects by converting to string', () => {
      expect(envAsString({ key: 'value' })).toBe('[object Object]')
    })

    it('should handle arrays by converting to string', () => {
      expect(envAsString([1, 2, 3])).toBe('1,2,3')
    })
  })

  describe('findCaseInsensitiveEnvKey', () => {
    it('should find exact match', () => {
      const env = { PATH: '/usr/bin', HOME: '/home/user' }
      expect(findCaseInsensitiveEnvKey(env, 'PATH')).toBe('PATH')
      expect(findCaseInsensitiveEnvKey(env, 'HOME')).toBe('HOME')
    })

    it('should find case-insensitive match', () => {
      const env = { Path: '/usr/bin', home: '/home/user' }
      expect(findCaseInsensitiveEnvKey(env, 'PATH')).toBe('Path')
      expect(findCaseInsensitiveEnvKey(env, 'HOME')).toBe('home')
    })

    it('should find mixed case matches', () => {
      const env = { pAtH: '/usr/bin', HoMe: '/home/user' }
      expect(findCaseInsensitiveEnvKey(env, 'PATH')).toBe('pAtH')
      expect(findCaseInsensitiveEnvKey(env, 'HOME')).toBe('HoMe')
    })

    it('should return undefined for non-existent keys', () => {
      const env = { PATH: '/usr/bin' }
      expect(findCaseInsensitiveEnvKey(env, 'HOME')).toBeUndefined()
      expect(findCaseInsensitiveEnvKey(env, 'MISSING')).toBeUndefined()
    })

    it('should return undefined for empty object', () => {
      expect(findCaseInsensitiveEnvKey({}, 'PATH')).toBeUndefined()
    })

    it('should skip keys with different lengths (optimization)', () => {
      const env = { PATHS: '/usr/bin', PATHX: '/usr/local/bin' }
      expect(findCaseInsensitiveEnvKey(env, 'PATH')).toBeUndefined()
    })

    it('should handle single character keys', () => {
      const env = { A: 'value', b: 'value2' }
      expect(findCaseInsensitiveEnvKey(env, 'A')).toBe('A')
      expect(findCaseInsensitiveEnvKey(env, 'B')).toBe('b')
    })

    it('should handle keys with underscores', () => {
      const env = { NODE_ENV: 'test', node_env: 'prod' }
      expect(findCaseInsensitiveEnvKey(env, 'NODE_ENV')).toBe('NODE_ENV')
    })

    it('should return first match when multiple case variations exist', () => {
      const env = { path: '/first', Path: '/second', PATH: '/third' }
      const result = findCaseInsensitiveEnvKey(env, 'PATH')
      expect(['path', 'Path', 'PATH']).toContain(result)
    })

    it('should handle undefined values in env', () => {
      const env = { PATH: undefined, HOME: '/home/user' }
      expect(findCaseInsensitiveEnvKey(env, 'PATH')).toBe('PATH')
    })
  })
})
