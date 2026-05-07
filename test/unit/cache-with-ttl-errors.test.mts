/**
 * @fileoverview Tests for catch branches in src/cache-with-ttl.ts that
 * fire when persistent-cache reads or writes fail. Mocks the cacache
 * helpers (`safeGet`, `remove`, `safePut`) so the SUT exercises the
 * try/catch around JSON.parse and cacache.remove.
 */

import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTtlCache } from '../../src/cache-with-ttl'
import { resetEnv, setEnv } from '../../src/env/rewire'
import { safeDeleteSync } from '../../src/fs'
import { invalidateCaches } from '../../src/paths/rewire'

import * as cacacheModule from '../../src/cacache'

vi.mock('../../src/cacache', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/cacache')>()
  return {
    ...original,
    safeGet: vi.fn(original.safeGet),
    remove: vi.fn(original.remove),
  }
})

describe.sequential('cache-with-ttl — error branches', () => {
  let testCacheDir: string

  beforeEach(() => {
    invalidateCaches()
    testCacheDir = path.join(
      tmpdir(),
      `socket-cache-err-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    setEnv('SOCKET_CACACHE_DIR', testCacheDir)
    vi.mocked(cacacheModule.safeGet).mockClear()
    vi.mocked(cacacheModule.remove).mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    resetEnv()
    invalidateCaches()
    try {
      safeDeleteSync(testCacheDir, { force: true })
    } catch {}
  })

  describe('get() — corrupted entry path', () => {
    it('returns undefined when cached JSON is malformed', async () => {
      const cache = createTtlCache({
        ttl: 60_000,
        prefix: 'corrupt',
        memoize: false,
      })
      // Return a valid cacache entry shape with malformed JSON in data.
      vi.mocked(cacacheModule.safeGet).mockResolvedValueOnce({
        data: Buffer.from('this is not valid json{{{', 'utf8'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const result = await cache.get('any-key')
      expect(result).toBeUndefined()
      // The catch branch attempts to remove the corrupt entry.
      expect(cacacheModule.remove).toHaveBeenCalled()
    })

    it('swallows remove errors during corrupted-entry cleanup', async () => {
      const cache = createTtlCache({
        ttl: 60_000,
        prefix: 'corrupt-rm-fail',
        memoize: false,
      })
      vi.mocked(cacacheModule.safeGet).mockResolvedValueOnce({
        data: Buffer.from('garbage', 'utf8'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      vi.mocked(cacacheModule.remove).mockRejectedValueOnce(
        new Error('rm-failed'),
      )
      // Even with rm failing, get() must still return undefined cleanly.
      await expect(cache.get('any-key')).resolves.toBeUndefined()
    })
  })

  describe('get() — expired entry path', () => {
    it('returns undefined and attempts removal when entry is expired', async () => {
      const cache = createTtlCache({
        ttl: 60_000,
        prefix: 'expired',
        memoize: false,
      })
      // Build a TtlCacheEntry shape with expiresAt in the past.
      const expiredEntry = {
        data: 'value',
        expiresAt: Date.now() - 10_000,
      }
      vi.mocked(cacacheModule.safeGet).mockResolvedValueOnce({
        data: Buffer.from(JSON.stringify(expiredEntry), 'utf8'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const result = await cache.get('expired-key')
      expect(result).toBeUndefined()
      expect(cacacheModule.remove).toHaveBeenCalled()
    })

    it('swallows remove errors during expired-entry cleanup', async () => {
      const cache = createTtlCache({
        ttl: 60_000,
        prefix: 'expired-rm-fail',
        memoize: false,
      })
      const expiredEntry = {
        data: 'value',
        expiresAt: Date.now() - 10_000,
      }
      vi.mocked(cacacheModule.safeGet).mockResolvedValueOnce({
        data: Buffer.from(JSON.stringify(expiredEntry), 'utf8'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      vi.mocked(cacacheModule.remove).mockRejectedValueOnce(
        new Error('rm-failed-2'),
      )
      await expect(cache.get('expired-key')).resolves.toBeUndefined()
    })
  })

  describe('isExpired() — clock-skew detection', () => {
    it('treats far-future expiresAt as expired (clock-skew defense)', async () => {
      const cache = createTtlCache({
        ttl: 60_000,
        prefix: 'skew',
        memoize: false,
      })
      // expiresAt more than ttl + 10s past now → looks malformed.
      const skewedEntry = {
        data: 'should-be-rejected',
        // 10 minutes in the future, well past ttl + skew window
        expiresAt: Date.now() + 600_000,
      }
      vi.mocked(cacacheModule.safeGet).mockResolvedValueOnce({
        data: Buffer.from(JSON.stringify(skewedEntry), 'utf8'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      const result = await cache.get('skew-key')
      expect(result).toBeUndefined()
    })
  })
})
