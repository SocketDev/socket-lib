/**
 * @fileoverview Tests for the wildcard-pattern getAll() path in
 * src/cache-with-ttl.ts that walks cacache.ls.stream.
 *
 * Mocks the cacache module's `getCacache().ls.stream` to yield fake
 * entries so we can exercise: prefix-mismatch skip, pattern-match
 * filter, in-memory-dedupe skip, expired-entry remove, and the
 * memoize-update branch.
 */

import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTtlCache } from '../../src/cache-with-ttl'
import { resetEnv, setEnv } from '../../src/env/rewire'
import { safeDelete } from '../../src/fs/safe'
import { invalidateCaches } from '../../src/paths/rewire'

import * as cacacheModule from '../../src/cacache'

interface FakeStreamEntry {
  key: string
}

function makeFakeStream(
  entries: FakeStreamEntry[],
): AsyncIterable<FakeStreamEntry> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of entries) {
        yield e
      }
    },
  }
}

vi.mock('../../src/cacache', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/cacache')>()
  return {
    ...original,
    getCacache: vi.fn(original.getCacache),
    safeGet: vi.fn(original.safeGet),
    remove: vi.fn(original.remove),
  }
})

describe.sequential('cache-with-ttl — getAll wildcard', () => {
  let testCacheDir: string

  beforeEach(() => {
    invalidateCaches()
    testCacheDir = path.join(
      tmpdir(),
      `socket-getall-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    setEnv('SOCKET_CACACHE_DIR', testCacheDir)
    vi.mocked(cacacheModule.getCacache).mockClear()
    vi.mocked(cacacheModule.safeGet).mockClear()
    vi.mocked(cacacheModule.remove).mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    resetEnv()
    invalidateCaches()
    try {
      await safeDelete(testCacheDir, { force: true })
    } catch {}
  })

  it('iterates cacache stream and returns matched entries', async () => {
    const cache = createTtlCache({
      ttl: 60_000,
      prefix: 'pfx',
      memoize: false,
    })
    // Stub stream with 3 entries: 1 matches, 1 wrong-prefix, 1 expired.
    const validEntry = { data: 'value-a', expiresAt: Date.now() + 60_000 }
    const expiredEntry = { data: 'expired', expiresAt: Date.now() - 1000 }
    const fakeCacache = {
      ls: {
        stream: () =>
          makeFakeStream([
            { key: 'pfx:keep-a' },
            { key: 'wrongprefix:skip' },
            { key: 'pfx:expired' },
          ]),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    vi.mocked(cacacheModule.getCacache).mockReturnValue(fakeCacache)
    vi.mocked(cacacheModule.safeGet).mockImplementation(async (key: string) => {
      if (key === 'pfx:keep-a') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { data: Buffer.from(JSON.stringify(validEntry), 'utf8') } as any
      }
      if (key === 'pfx:expired') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {
          data: Buffer.from(JSON.stringify(expiredEntry), 'utf8'),
        } as any
      }
      return undefined
    })

    const result = await cache.getAll<string>('*')
    // 'keep-a' present (originalKey strips prefix); 'skip' filtered;
    // 'expired' filtered.
    expect(result.size).toBe(1)
    expect(result.get('keep-a')).toBe('value-a')
    // Expired entry triggers cacache.remove.
    expect(cacacheModule.remove).toHaveBeenCalledWith('pfx:expired')
  })

  it('updates memoize cache from persistent results when memoize:true', async () => {
    const cache = createTtlCache({
      ttl: 60_000,
      prefix: 'memo',
      memoize: true,
    })
    const validEntry = { data: 'memoized', expiresAt: Date.now() + 60_000 }
    const fakeCacache = {
      ls: {
        stream: () => makeFakeStream([{ key: 'memo:k1' }]),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    vi.mocked(cacacheModule.getCacache).mockReturnValue(fakeCacache)
    vi.mocked(cacacheModule.safeGet).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { data: Buffer.from(JSON.stringify(validEntry), 'utf8') } as any,
    )

    const result = await cache.getAll<string>('*')
    expect(result.get('k1')).toBe('memoized')
    // Subsequent get() should hit memo cache (we can't directly assert
    // memoSet, but the value is returned without a second persistent
    // lookup — verified by clearing safeGet and re-getting).
    vi.mocked(cacacheModule.safeGet).mockClear()
    const cached = await cache.get<string>('k1')
    expect(cached).toBe('memoized')
    expect(cacacheModule.safeGet).not.toHaveBeenCalled()
  })

  it('skips entries already in in-memory results (memoize:true dedup)', async () => {
    const cache = createTtlCache({
      ttl: 60_000,
      prefix: 'dedup',
      memoize: true,
    })
    // Pre-populate memo cache via set().
    await cache.set('shared', 'from-memo')
    // Stream yields the same key — getAll should dedupe.
    const fakeCacache = {
      ls: {
        stream: () => makeFakeStream([{ key: 'dedup:shared' }]),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    vi.mocked(cacacheModule.getCacache).mockReturnValue(fakeCacache)
    // safeGet should NOT be called for the dedup'd entry.
    vi.mocked(cacacheModule.safeGet).mockClear()
    const result = await cache.getAll<string>('*')
    expect(result.get('shared')).toBe('from-memo')
  })

  it('swallows safeGet errors during stream iteration', async () => {
    const cache = createTtlCache({
      ttl: 60_000,
      prefix: 'errs',
      memoize: false,
    })
    const fakeCacache = {
      ls: {
        stream: () => makeFakeStream([{ key: 'errs:bad' }]),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    vi.mocked(cacacheModule.getCacache).mockReturnValue(fakeCacache)
    vi.mocked(cacacheModule.safeGet).mockRejectedValueOnce(
      new Error('safeGet-failed'),
    )
    // getAll must not propagate the error.
    await expect(cache.getAll<string>('*')).resolves.toBeInstanceOf(Map)
  })

  it('skips entries returning undefined from safeGet', async () => {
    const cache = createTtlCache({
      ttl: 60_000,
      prefix: 'gone',
      memoize: false,
    })
    const fakeCacache = {
      ls: {
        stream: () => makeFakeStream([{ key: 'gone:k' }]),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    vi.mocked(cacacheModule.getCacache).mockReturnValue(fakeCacache)
    vi.mocked(cacacheModule.safeGet).mockResolvedValueOnce(undefined)
    const result = await cache.getAll<string>('*')
    expect(result.size).toBe(0)
  })
})
