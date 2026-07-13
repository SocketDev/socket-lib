import { describe, expect, it } from 'vitest'

import {
  URLSearchParamsPrototypeAppend,
  URLSearchParamsPrototypeDelete,
  URLSearchParamsPrototypeForEach,
  URLSearchParamsPrototypeGet,
  URLSearchParamsPrototypeGetAll,
  URLSearchParamsPrototypeHas,
  URLSearchParamsPrototypeSet,
} from '../../../src/primordials/url'

describe('primordials/url — URLSearchParams', () => {
  it('Append / Delete / Get / GetAll / Has / Set / ForEach', () => {
    const p = new URLSearchParams()
    URLSearchParamsPrototypeAppend(p, 'a', '1')
    URLSearchParamsPrototypeAppend(p, 'a', '2')
    URLSearchParamsPrototypeSet(p, 'b', '3')
    expect(URLSearchParamsPrototypeGet(p, 'a')).toBe('1')
    expect(URLSearchParamsPrototypeGetAll(p, 'a')).toEqual(['1', '2'])
    expect(URLSearchParamsPrototypeHas(p, 'b')).toBe(true)
    const seen: Array<[string, string]> = []
    URLSearchParamsPrototypeForEach(p, (v, k) => seen.push([k, v]))
    expect(seen).toEqual([
      ['a', '1'],
      ['a', '2'],
      ['b', '3'],
    ])
    URLSearchParamsPrototypeDelete(p, 'a')
    expect(URLSearchParamsPrototypeHas(p, 'a')).toBe(false)
  })
})
