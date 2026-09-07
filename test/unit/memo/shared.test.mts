import { describe, expect, it } from 'vitest'

import { defaultKeyGen } from '../../../src/memo/shared.mjs'

describe('defaultKeyGen collection arguments', () => {
  it('retains nested map entries and set values in cache keys', () => {
    const nested = new Map([
      ['packages', new Set(['example-one', 'example-two'])],
    ])
    expect(JSON.parse(defaultKeyGen([nested]))).toEqual([
      {
        __tag: 'Map',
        entries: [
          [
            'packages',
            { __tag: 'Set', values: ['example-one', 'example-two'] },
          ],
        ],
      },
    ])
  })

  it('distinguishes empty maps, empty sets, and plain objects', () => {
    const keys = [new Map(), new Set(), {}].map(value => defaultKeyGen([value]))
    expect(new Set(keys).size).toBe(3)
  })

  it('preserves undefined and bigint values inside collections', () => {
    expect(JSON.parse(defaultKeyGen([new Set([7n, undefined])]))).toEqual([
      { __tag: 'Set', values: ['\0bigint:7', '\0undefined'] },
    ])
  })
})
