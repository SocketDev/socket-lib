/**
 * @file Unit tests for src/cacache/write — put, remove.
 */

import { describe, expect, it } from 'vitest'

import { put, remove } from '../../../src/cacache/write'

describe('put', () => {
  it('should export put function', () => {
    expect(typeof put).toBe('function')
  })

  it('should reject keys with wildcards', async () => {
    await expect(put('test*key', 'data')).rejects.toThrow(TypeError)
    await expect(put('test*key', 'data')).rejects.toThrow(
      'Cache key cannot contain wildcards (*)',
    )
  })

  it('should reject keys with wildcards in middle', async () => {
    await expect(put('socket:*:key', 'data')).rejects.toThrow(TypeError)
  })

  it('should reject keys with wildcards at end', async () => {
    await expect(put('socket:key*', 'data')).rejects.toThrow(TypeError)
  })

  it('should accept keys without wildcards', async () => {
    const key = `test-key-${Date.now()}`
    try {
      await put(key, 'test data')
      await remove(key)
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })
})

describe('remove', () => {
  it('should export remove function', () => {
    expect(typeof remove).toBe('function')
  })

  it('should reject keys with wildcards', async () => {
    await expect(remove('test*key')).rejects.toThrow(TypeError)
    await expect(remove('test*key')).rejects.toThrow(
      'Cache key cannot contain wildcards (*)',
    )
  })

  it('should reject keys with wildcards in middle', async () => {
    await expect(remove('socket:*:key')).rejects.toThrow(TypeError)
  })

  it('should reject keys with wildcards at end', async () => {
    await expect(remove('socket:key*')).rejects.toThrow(TypeError)
  })

  it('should suggest using clear for wildcards', async () => {
    await expect(remove('test*')).rejects.toThrow(
      'Use clear({ prefix: "pattern*" })',
    )
  })

  it('should accept keys without wildcards', async () => {
    try {
      await remove('nonexistent-key')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })
})
