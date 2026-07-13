import { describe, expect, it } from 'vitest'

import {
  PromisePrototypeCatch,
  PromisePrototypeFinally,
  PromisePrototypeThen,
} from '../../../src/primordials/promise'

describe('primordials/promise', () => {
  it('PromisePrototypeThen / Catch / Finally preserve semantics', async () => {
    const resolved = PromisePrototypeThen(
      Promise.resolve(1),
      (x: number) => x + 1,
    )
    expect(await resolved).toBe(2)

    const caught = PromisePrototypeCatch(
      Promise.reject(new Error('boom')) as Promise<number>,
      (e: Error) => e.message,
    )
    expect(await caught).toBe('boom')

    let finallyCalled = false
    await PromisePrototypeFinally(Promise.resolve(1), () => {
      finallyCalled = true
    })
    expect(finallyCalled).toBe(true)
  })
})
