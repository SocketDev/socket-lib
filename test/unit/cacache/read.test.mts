/**
 * @file Unit tests for src/cacache/read — get, safeGet.
 */

import { describe, expect, it } from 'vitest'

import { get, safeGet } from '../../../src/cacache/read'
import type { GetOptions } from '../../../src/cacache/types'

describe('get', () => {
  it('should export get function', () => {
    expect(typeof get).toBe('function')
  })

  it('should reject keys with wildcards', async () => {
    await expect(get('test*key')).rejects.toThrow(TypeError)
    await expect(get('test*key')).rejects.toThrow(
      'Cache key cannot contain wildcards (*)',
    )
  })

  it('should reject keys with wildcards in middle', async () => {
    await expect(get('socket:*:key')).rejects.toThrow(TypeError)
  })

  it('should reject keys with wildcards at end', async () => {
    await expect(get('socket:key*')).rejects.toThrow(TypeError)
  })

  it('should accept keys without wildcards', async () => {
    await expect(get('nonexistent-key')).rejects.toThrow()
  })

  it('should accept GetOptions', async () => {
    const opts: GetOptions = {
      integrity: 'sha512-abc',
      memoize: false,
    }
    await expect(get('nonexistent-key', opts)).rejects.toThrow()
  })
})

describe('safeGet', () => {
  it('should export safeGet function', () => {
    expect(typeof safeGet).toBe('function')
  })

  it('should return undefined for nonexistent keys', async () => {
    const result = await safeGet('nonexistent-key')
    expect(result).toBeUndefined()
  })

  it('should return undefined on wildcard errors', async () => {
    const result = await safeGet('test*key')
    expect(result).toBeUndefined()
  })

  it('should accept GetOptions', async () => {
    const opts: GetOptions = {
      integrity: 'sha512-abc',
      memoize: false,
    }
    const result = await safeGet('nonexistent-key', opts)
    expect(result).toBeUndefined()
  })

  it('should not throw on errors', async () => {
    await expect(safeGet('any-key')).resolves.toBeUndefined()
    await expect(safeGet('test*key')).resolves.toBeUndefined()
  })
})
