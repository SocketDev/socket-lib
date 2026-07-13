/**
 * @file Unit tests for src/env/case-insensitive — findCaseInsensitiveEnvKey.
 */

import { describe, expect, it } from 'vitest'

import { findCaseInsensitiveEnvKey } from '../../../src/env/case-insensitive'

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
