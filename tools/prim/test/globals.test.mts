/**
 * @file Unit tests for prim's global-shape helpers. `guessReceiverType` is a
 *   name heuristic that drives real rewrites, so the tests pin which naming
 *   conventions it claims and - just as importantly - which ones it refuses:
 *   `pattern` is deliberately NOT a RegExp hint, because misreading it turns
 *   every string `.replace` into a RegExp prototype call.
 *   `prototypePrimordialName` is the guard that stops a wrong guess becoming a
 *   fabricated primordial name.
 */

import { describe, expect, it } from 'vitest'

import {
  ctorPrimordialName,
  getPrototypeMethods,
  guessReceiverType,
  prototypePrimordialName,
  staticPrimordialName,
} from '../src/globals.mts'

describe('name builders', () => {
  it('suffixes a constructor primordial with Ctor', () => {
    expect(ctorPrimordialName('Map')).toBe('MapCtor')
  })

  it('capitalizes the member for a static primordial', () => {
    expect(staticPrimordialName('Object', 'keys')).toBe('ObjectKeys')
  })
})

describe('getPrototypeMethods', () => {
  it('lists the prototype methods of a real global', () => {
    const methods = getPrototypeMethods('Array')
    expect(methods.has('map')).toBe(true)
    expect(methods.has('slice')).toBe(true)
  })

  it('folds Uint8Array methods into Buffer, which extends it', () => {
    // `buf.subarray` lives on Uint8Array.prototype; without the fold, a real
    // Buffer call site is reported as a surface gap.
    const methods = getPrototypeMethods('Buffer')
    expect(methods.has('toString')).toBe(true)
    expect(methods.has('subarray')).toBe(true)
  })

  it('answers an empty set for a name that is not a global', () => {
    expect(getPrototypeMethods('NotAGlobalAnywhere').size).toBe(0)
  })

  it('answers the same set object on a repeat lookup', () => {
    const first = getPrototypeMethods('Array')
    const second = getPrototypeMethods('Array')
    expect(first).toBe(second)
  })
})

describe('guessReceiverType', () => {
  it('reads common string names as String', () => {
    for (const name of ['text', 'path', 'message', 'sourceCode']) {
      expect(guessReceiverType(name)).toBe('String')
    }
  })

  it('reads counter and size names as Number', () => {
    for (const name of ['i', 'idx', 'count', 'length', 'width']) {
      expect(guessReceiverType(name)).toBe('Number')
    }
  })

  it('reads time-flavoured names and At/Date/Time suffixes as Date', () => {
    expect(guessReceiverType('timestamp')).toBe('Date')
    expect(guessReceiverType('createdAt')).toBe('Date')
    expect(guessReceiverType('startTime')).toBe('Date')
  })

  it('reads re/regex names and RegExp suffixes as RegExp', () => {
    expect(guessReceiverType('re')).toBe('RegExp')
    expect(guessReceiverType('regexp')).toBe('RegExp')
    expect(guessReceiverType('fileRegex')).toBe('RegExp')
  })

  it('refuses to read `pattern` as a RegExp', () => {
    // `pattern` is just as often a regex SOURCE string, and guessing wrong
    // reclassifies every string .replace on it.
    expect(guessReceiverType('pattern')).toBe(undefined)
  })

  it('reads p/promise names and Promise suffixes as Promise', () => {
    expect(guessReceiverType('p')).toBe('Promise')
    expect(guessReceiverType('promise')).toBe('Promise')
    expect(guessReceiverType('readPromise')).toBe('Promise')
  })

  it('reads buf/bytes names and Buffer suffixes as Buffer', () => {
    expect(guessReceiverType('buf')).toBe('Buffer')
    expect(guessReceiverType('bytes')).toBe('Buffer')
    expect(guessReceiverType('headerBuffer')).toBe('Buffer')
  })

  it('answers undefined for a name that suggests nothing', () => {
    expect(guessReceiverType('thing')).toBe(undefined)
    expect(guessReceiverType('')).toBe(undefined)
  })
})

describe('prototypePrimordialName', () => {
  it('names the primordial when the method really exists', () => {
    expect(prototypePrimordialName('Array', 'map')).toBe('ArrayPrototypeMap')
    expect(prototypePrimordialName('String', 'slice')).toBe(
      'StringPrototypeSlice',
    )
  })

  it('answers undefined when the guessed type has no such method', () => {
    // Without this guard a variable named `p` holding anything at all mints
    // `PromisePrototypeLoad`, and the audit reports a gap that cannot exist.
    expect(prototypePrimordialName('Promise', 'load')).toBe(undefined)
  })

  it('answers undefined for a name that is not a global', () => {
    expect(prototypePrimordialName('NotAGlobalAnywhere', 'map')).toBe(undefined)
  })
})
