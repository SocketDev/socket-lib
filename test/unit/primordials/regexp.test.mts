/**
 * @file Unit tests for src/primordials/regexp — RegExp primordials. Split out
 *   of the historical monolithic test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  RegExpPrototypeExec,
  RegExpPrototypeSymbolMatch,
  RegExpPrototypeSymbolReplace,
  RegExpPrototypeTest,
} from '../../../src/primordials/regexp'

describe('RegExp', () => {
  it('PrototypeExec / PrototypeTest', () => {
    expect(RegExpPrototypeTest(/foo/, 'foobar')).toBe(true)
    expect(RegExpPrototypeTest(/foo/, 'bar')).toBe(false)
    const match = RegExpPrototypeExec(/(\w+)/, 'abc')
    expect(match?.[1]).toBe('abc')
  })

  it('PrototypeSymbolMatch / PrototypeSymbolReplace', () => {
    const m = RegExpPrototypeSymbolMatch(/\d+/, 'a12b') as RegExpMatchArray
    expect(m[0]).toBe('12')
    const replaced = RegExpPrototypeSymbolReplace(/\d+/, 'a12b', 'XX')
    expect(replaced).toBe('aXXb')
  })
})
