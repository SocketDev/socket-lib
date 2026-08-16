import { describe, expect, it, vi } from 'vitest'

import { createDebouncer } from '../../../src/promises/debounce.mts'

describe('createDebouncer', () => {
  it('cancels the in-flight request when a new one arrives', async () => {
    vi.useFakeTimers()
    const fn = vi.fn(async (_signal: AbortSignal, _id: string) => 'result')
    const debouncer = createDebouncer(fn, { delayMs: 100 })
    const first = debouncer()
    // Abandon the first promise (the old timer is cleared and the controller
    // aborted when the second request arrives). No rejection to handle.
    void first.promise.catch(() => undefined)
    const second = debouncer()
    await vi.advanceTimersByTimeAsync(150)
    const result = await second.promise
    expect(result).toBe('result')
    vi.useRealTimers()
  })

  it('uses the caller-provided requestId', () => {
    const debouncer = createDebouncer(async () => 'ok')
    const req = debouncer('my-id')
    expect(req.requestId).toBe('my-id')
  })

  it('increments the requestId when not provided', () => {
    const debouncer = createDebouncer(async () => 'ok')
    expect(debouncer().requestId).toBe('1')
    expect(debouncer().requestId).toBe('2')
  })

  it('honors a custom delay', async () => {
    vi.useFakeTimers()
    const debouncer = createDebouncer(async () => 'ok', { delayMs: 50 })
    const req = debouncer()
    await vi.advanceTimersByTimeAsync(50)
    await expect(req.promise).resolves.toBe('ok')
    vi.useRealTimers()
  })
})
