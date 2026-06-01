import { beforeEach, describe, expect, test } from 'vitest'

import {
  cacheKey,
  dedupeRead,
  getCached,
  has,
  invalidate,
  invalidateAll,
  setCached,
} from '../../../src/secrets/_internal'

beforeEach(() => {
  invalidateAll()
})

describe.sequential('secrets/_internal — cacheKey', () => {
  test('combines service + account with a space separator', () => {
    const key = cacheKey('svc', 'acct')
    expect(key).toBe('svc acct')
  })

  test('keys differ when service differs', () => {
    const key1 = cacheKey('svc1', 'a')
    const key2 = cacheKey('svc2', 'a')
    expect(key1).not.toBe(key2)
  })

  test('keys differ when account differs', () => {
    const key1 = cacheKey('s', 'a1')
    const key2 = cacheKey('s', 'a2')
    expect(key1).not.toBe(key2)
  })
})

describe.sequential('secrets/_internal — setCached / getCached / has', () => {
  test('getCached returns undefined before anything is cached', () => {
    expect(getCached('svc', 'acct')).toBeUndefined()
    expect(has('svc', 'acct')).toBe(false)
  })

  test('setCached stores a string and getCached returns it', () => {
    setCached('svc', 'acct', 'tok-1')
    expect(getCached('svc', 'acct')).toBe('tok-1')
    expect(has('svc', 'acct')).toBe(true)
  })

  test('setCached can store undefined (cache the absence)', () => {
    setCached('svc', 'acct', undefined)
    expect(getCached('svc', 'acct')).toBeUndefined()
    expect(has('svc', 'acct')).toBe(true)
  })

  test('different service/account pairs are independent', () => {
    setCached('s1', 'a1', 'one')
    setCached('s2', 'a2', 'two')
    expect(getCached('s1', 'a1')).toBe('one')
    expect(getCached('s2', 'a2')).toBe('two')
  })
})

describe.sequential('secrets/_internal — invalidate', () => {
  test('invalidate drops a single cache entry', () => {
    setCached('svc', 'a', 'tok')
    invalidate('svc', 'a')
    expect(has('svc', 'a')).toBe(false)
  })

  test('invalidate leaves other entries alone', () => {
    setCached('svc', 'a', 'tok-a')
    setCached('svc', 'b', 'tok-b')
    invalidate('svc', 'a')
    expect(has('svc', 'a')).toBe(false)
    expect(getCached('svc', 'b')).toBe('tok-b')
  })

  test('invalidate is a no-op for missing entries', () => {
    expect(() => invalidate('svc', 'never-set')).not.toThrow()
  })
})

describe.sequential('secrets/_internal — invalidateAll', () => {
  test('clears every entry', () => {
    setCached('s1', 'a', '1')
    setCached('s2', 'b', '2')
    setCached('s3', 'c', '3')
    invalidateAll()
    expect(has('s1', 'a')).toBe(false)
    expect(has('s2', 'b')).toBe(false)
    expect(has('s3', 'c')).toBe(false)
  })
})

describe.sequential('secrets/_internal — dedupeRead', () => {
  test('calls reader once on first read and caches the result', async () => {
    let calls = 0
    const reader = async () => {
      calls += 1
      return 'fresh-value'
    }
    expect(await dedupeRead('svc', 'a', reader)).toBe('fresh-value')
    expect(calls).toBe(1)
    expect(getCached('svc', 'a')).toBe('fresh-value')
  })

  test('returns the cached value on subsequent reads (no reader call)', async () => {
    let calls = 0
    const reader = async () => {
      calls += 1
      return 'fresh'
    }
    await dedupeRead('svc', 'a', reader)
    await dedupeRead('svc', 'a', reader)
    await dedupeRead('svc', 'a', reader)
    expect(calls).toBe(1)
  })

  test('coalesces two concurrent reads into a single reader call', async () => {
    let calls = 0
    let resolveReader: (v: string | undefined) => void = () => {}
    const reader = () =>
      new Promise<string | undefined>(resolve => {
        calls += 1
        resolveReader = resolve
      })
    const p1 = dedupeRead('svc', 'a', reader)
    const p2 = dedupeRead('svc', 'a', reader)
    expect(calls).toBe(1)
    resolveReader('coalesced')
    expect(await p1).toBe('coalesced')
    expect(await p2).toBe('coalesced')
    expect(calls).toBe(1)
  })

  test('caches undefined results (the absence is durable)', async () => {
    let calls = 0
    const reader = async () => {
      calls += 1
      return undefined
    }
    expect(await dedupeRead('svc', 'a', reader)).toBeUndefined()
    expect(await dedupeRead('svc', 'a', reader)).toBeUndefined()
    expect(calls).toBe(1)
    expect(has('svc', 'a')).toBe(true)
  })

  test('drops the inflight slot after the reader settles', async () => {
    const reader = async () => 'val'
    await dedupeRead('svc', 'a', reader)
    // A fresh call after settle goes through the value cache (no inflight slot).
    let secondCalls = 0
    const secondReader = async () => {
      secondCalls += 1
      return 'different'
    }
    await dedupeRead('svc', 'a', secondReader)
    expect(secondCalls).toBe(0)
  })

  test('drops the inflight slot even when the reader rejects', async () => {
    const reader = async (): Promise<string | undefined> => {
      throw new Error('reader-fail')
    }
    await expect(dedupeRead('svc', 'a', reader)).rejects.toThrow('reader-fail')
    // After a failed read, the inflight slot is gone AND the value isn't cached,
    // so the next call calls the reader again.
    expect(has('svc', 'a')).toBe(false)
    const okReader = async () => 'now-it-works'
    expect(await dedupeRead('svc', 'a', okReader)).toBe('now-it-works')
  })
})
