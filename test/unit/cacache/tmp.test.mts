/**
 * @file Unit tests for src/cacache/tmp — withTmp.
 */

import { describe, expect, it, vi } from 'vitest'

import { withTmp } from '../../../src/cacache/tmp'

describe('withTmp', () => {
  it('should export withTmp function', () => {
    expect(typeof withTmp).toBe('function')
  })

  it('should call callback with temp directory path', async () => {
    const callback = vi.fn(async (tmpDir: string) => {
      expect(typeof tmpDir).toBe('string')
      expect(tmpDir.length).toBeGreaterThan(0)
      return 'result'
    })

    try {
      const result = await withTmp(callback)
      expect(callback).toHaveBeenCalled()
      expect(result).toBe('result')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should return callback result', async () => {
    try {
      const result = await withTmp(async () => {
        return 42
      })
      expect(result).toBe(42)
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should support async callbacks', async () => {
    try {
      const result = await withTmp(async tmpDir => {
        await Promise.resolve()
        return tmpDir.length
      })
      expect(typeof result).toBe('number')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })

  it('should propagate callback errors', async () => {
    try {
      await withTmp(async () => {
        throw new Error('callback error')
      })
    } catch (e) {
      expect((e as Error).message).not.toMatch(/wildcard/i)
    }
  })
})
