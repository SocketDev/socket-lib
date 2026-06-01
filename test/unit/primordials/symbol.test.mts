/**
 * @file Unit tests for src/primordials/symbol — Symbol primordials. Split out
 *   of the historical monolithic test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  SymbolAsyncDispose,
  SymbolAsyncIterator,
  SymbolDispose,
  SymbolFor,
  SymbolHasInstance,
  SymbolIsConcatSpreadable,
  SymbolIterator,
  SymbolKeyFor,
  SymbolMatch,
  SymbolMatchAll,
  SymbolPrototypeDescription,
  SymbolPrototypeToString,
  SymbolPrototypeValueOf,
  SymbolReplace,
  SymbolSearch,
  SymbolSpecies,
  SymbolSplit,
  SymbolToPrimitive,
  SymbolToStringTag,
  SymbolUnscopables,
} from '../../../src/primordials/symbol'

describe('Symbol', () => {
  it('well-known symbols match globals', () => {
    expect(SymbolAsyncIterator).toBe(Symbol.asyncIterator)
    expect(SymbolHasInstance).toBe(Symbol.hasInstance)
    expect(SymbolIsConcatSpreadable).toBe(Symbol.isConcatSpreadable)
    expect(SymbolIterator).toBe(Symbol.iterator)
    expect(SymbolMatch).toBe(Symbol.match)
    expect(SymbolMatchAll).toBe(Symbol.matchAll)
    expect(SymbolReplace).toBe(Symbol.replace)
    expect(SymbolSearch).toBe(Symbol.search)
    expect(SymbolSpecies).toBe(Symbol.species)
    expect(SymbolSplit).toBe(Symbol.split)
    expect(SymbolToPrimitive).toBe(Symbol.toPrimitive)
    expect(SymbolToStringTag).toBe(Symbol.toStringTag)
    expect(SymbolUnscopables).toBe(Symbol.unscopables)
  })

  it('ES2024 dispose symbols mirror engine state', () => {
    // Node 20.4+ has both; older Node lacks them. Either way, the
    // primordial must equal the live global when present.
    expect(SymbolAsyncDispose).toBe(
      (Symbol as { asyncDispose?: symbol | undefined }).asyncDispose,
    )
    expect(SymbolDispose).toBe(
      (Symbol as { dispose?: symbol | undefined }).dispose,
    )
  })

  it('SymbolFor returns registry symbols', () => {
    expect(SymbolFor('primordials.test')).toBe(Symbol.for('primordials.test'))
  })

  it('SymbolKeyFor recovers keys from registry symbols', () => {
    const sym = SymbolFor('primordials.keyfor.test')
    expect(SymbolKeyFor(sym)).toBe('primordials.keyfor.test')
    // Unregistered symbols return undefined.
    expect(SymbolKeyFor(Symbol('not-registered'))).toBe(undefined)
  })

  it('SymbolPrototypeDescription reads the description accessor', () => {
    // `Symbol.prototype.description` is a getter; the helper resolves
    // it via __lookupGetter__ + falls back to direct property access.
    expect(SymbolPrototypeDescription(Symbol('hello'))).toBe('hello')
    expect(SymbolPrototypeDescription(Symbol())).toBe(undefined)
  })

  it('SymbolPrototypeToString matches Symbol#toString', () => {
    const s = Symbol('xyz')
    expect(SymbolPrototypeToString(s)).toBe('Symbol(xyz)')
  })

  it('SymbolPrototypeValueOf returns the symbol itself', () => {
    const s = Symbol('xyz')
    expect(SymbolPrototypeValueOf(s)).toBe(s)
  })
})
