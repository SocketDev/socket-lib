import { describe, expect, it } from 'vitest'

import {
  BufferCtor,
  BufferPrototypeSlice,
  BufferPrototypeToString,
} from '../../../src/primordials/buffer'

describe('primordials/buffer', () => {
  it('BufferCtor matches globalThis.Buffer when available', () => {
    if (typeof Buffer === 'undefined') {
      expect(BufferCtor).toBeUndefined()
      return
    }
    expect(BufferCtor).toBe(Buffer)
    const buf = Buffer.from('hello')
    expect(BufferPrototypeToString?.(buf, 'utf8')).toBe('hello')
    expect(BufferPrototypeSlice?.(buf, 0, 3).toString('utf8')).toBe('hel')
  })
})
