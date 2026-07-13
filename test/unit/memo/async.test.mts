import { describe, expect, it, vi } from 'vitest'

import { memoizeAsync } from '../../../src/memo/async'

describe('memo/async — memoizeAsync', () => {
  it('dedupes concurrent first-time callers (cold dedup)', async () => {
    let calls = 0
    let resolveOuter: (v: number) => void = () => {}
    const slowFn = vi.fn(async () => {
      calls += 1
      return await new Promise<number>(r => {
        resolveOuter = r
      })
    })
    const memo = memoizeAsync(slowFn)
    const p1 = memo()
    const p2 = memo()
    resolveOuter(42)
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe(42)
    expect(r2).toBe(42)
    expect(calls).toBe(1)
  })

  it('returns cached value on hit (no recompute)', async () => {
    let calls = 0
    const memo = memoizeAsync(async (x: number) => {
      calls += 1
      return x * 3
    })
    expect(await memo(2)).toBe(6)
    expect(await memo(2)).toBe(6)
    expect(calls).toBe(1)
  })

  it('handles function-name fallback for anonymous fns', async () => {
    const memo = memoizeAsync(async () => 'anon')
    expect(await memo()).toBe('anon')
  })
})
