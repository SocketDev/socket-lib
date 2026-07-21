/**
 * @file Property/fuzz tests for src/json/parse (Tier-1 fast-check).
 *   Contracts under test (read from source):
 *
 *   - parseJson(content, options): returns `JsonValue | undefined`. Throws a
 *     SyntaxError on invalid input by default; with `{ throws: false }` it
 *     NEVER throws and returns `undefined` on failure. Strips a leading BOM and
 *     accepts Buffer input (utf8).
 *   - parseJsonSafe(str, schema?, options?): returns the parsed value; THROWS on
 *     invalid JSON, on exceeding `maxSize`, and on prototype-pollution keys
 *     (`__proto__` / `constructor` / `prototype`) at any depth.
 *   - isBuffer / isJsonPrimitive / prototypePollutionReviver: pure predicates.
 *     Properties are constructed so the expected outcome is known up front; the
 *     only "oracle" used is the platform `JSON.parse`, which is legitimately
 *     the reference implementation parseJson delegates to.
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import {
  isBuffer,
  isJsonPrimitive,
  parseJson,
  parseJsonSafe,
  prototypePollutionReviver,
} from '../../../src/json/parse'

const BOM = '﻿'
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'] as const

// A JSON value whose object keys are drawn from a fixed safe set (never a
// prototype-pollution key) and whose numbers are integers (no -0 / precision /
// non-finite hazards). Round-trips exactly through JSON.stringify -> parse.
const safeJsonValue = fc.letrec<{ node: unknown }>(tie => ({
  node: fc.oneof(
    { maxDepth: 4, depthSize: 'small' },
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- null is a JSON value under test
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.string(),
    fc.array(tie('node')),
    fc.dictionary(
      fc.constantFrom('a', 'b', 'c', 'name', 'value', 'nested', 'items', 'x'),
      tie('node'),
      // Plain-prototype objects only: a null-prototype object would survive
      // JSON round-trip as a normal `{}`, tripping toStrictEqual on prototype.
      { noNullPrototype: true },
    ),
  ),
})).node

describe('json/parse property tests', () => {
  // Round-trip (classical #4): parse(stringify(v)) deep-equals v.
  test('parseJson round-trips any safe JSON value', () => {
    fc.assert(
      fc.property(safeJsonValue, v => {
        expect(parseJson(JSON.stringify(v))).toStrictEqual(v)
      }),
    )
  })

  // Oracle (classical #5): parseJson agrees with the platform JSON.parse on any
  // valid JSON string.
  test('parseJson agrees with JSON.parse on valid JSON strings', () => {
    fc.assert(
      fc.property(fc.json(), jsonStr => {
        expect(parseJson(jsonStr, { throws: false })).toStrictEqual(
          JSON.parse(jsonStr),
        )
      }),
    )
  })

  // Derived-from-input (classical #2): a leading BOM is transparent.
  test('parseJson strips a leading BOM before parsing', () => {
    fc.assert(
      fc.property(fc.json(), jsonStr => {
        expect(parseJson(BOM + jsonStr, { throws: false })).toStrictEqual(
          JSON.parse(jsonStr),
        )
      }),
    )
  })

  // Buffer input is equivalent to its utf8 string.
  test('parseJson accepts a Buffer equivalently to its utf8 string', () => {
    fc.assert(
      fc.property(fc.json(), jsonStr => {
        const fromBuffer = parseJson(Buffer.from(jsonStr, 'utf8'), {
          throws: false,
        })
        expect(fromBuffer).toStrictEqual(JSON.parse(jsonStr))
      }),
    )
  })

  // Invariant (classical #1): with throws:false the parser NEVER throws on any
  // string, and returns exactly `undefined` for un-parseable input.
  test('parseJson never throws with throws:false on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), s => {
        let result: unknown
        let threw = false
        try {
          result = parseJson(s, { throws: false })
        } catch {
          threw = true
        }
        expect(threw).toBe(false)
        // Result mirrors JSON.parse: undefined iff JSON.parse rejects the
        // BOM-stripped input.
        let oracleFailed = false
        try {
          JSON.parse(s.startsWith(BOM) ? s.slice(1) : s)
        } catch {
          oracleFailed = true
        }
        if (oracleFailed) {
          expect(result).toBeUndefined()
        }
      }),
    )
  })

  // Round-trip for parseJsonSafe on safe values (no dangerous keys).
  test('parseJsonSafe round-trips any safe JSON value', () => {
    fc.assert(
      fc.property(safeJsonValue, v => {
        expect(parseJsonSafe(JSON.stringify(v))).toStrictEqual(v)
      }),
    )
  })

  // Restricted-input: any input whose utf8 byte-length exceeds maxSize throws.
  test('parseJsonSafe throws when input exceeds maxSize', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), payload => {
        const jsonStr = JSON.stringify(payload)
        const byteLen = Buffer.byteLength(jsonStr, 'utf8')
        expect(() =>
          parseJsonSafe(jsonStr, undefined, { maxSize: byteLen - 1 }),
        ).toThrow(/exceeds maximum size/)
      }),
    )
  })

  // Security invariant: a prototype-pollution key at any depth is rejected.
  test('parseJsonSafe rejects prototype-pollution keys at any depth', () => {
    const wrapDepth = fc.integer({ min: 0, max: 4 })
    fc.assert(
      fc.property(
        fc.constantFrom(...DANGEROUS_KEYS),
        wrapDepth,
        (key, depth) => {
          let inner = `{${JSON.stringify(key)}:1}`
          for (let i = 0; i < depth; i += 1) {
            inner = `{"a":${inner}}`
          }
          expect(() => parseJsonSafe(inner)).toThrow(/prototype pollution/)
        },
      ),
    )
  })

  // ...but allowPrototype:true lets those keys through without throwing.
  test('parseJsonSafe allows dangerous keys when allowPrototype is true', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DANGEROUS_KEYS), key => {
        expect(() =>
          parseJsonSafe(`{${JSON.stringify(key)}:1}`, undefined, {
            allowPrototype: true,
          }),
        ).not.toThrow()
      }),
    )
  })

  // isJsonPrimitive: true for JSON primitives, false for containers/undefined.
  test('isJsonPrimitive is true exactly for JSON primitives', () => {
    const primitive = fc.oneof(
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- null is a JSON primitive under test
      fc.constant(null),
      fc.boolean(),
      fc.double(),
      fc.string(),
    )
    fc.assert(
      fc.property(primitive, v => {
        expect(isJsonPrimitive(v)).toBe(true)
      }),
    )
    const nonPrimitive = fc.oneof(
      fc.array(fc.anything()),
      fc.dictionary(fc.string(), fc.anything()),
      fc.constant(undefined),
    )
    fc.assert(
      fc.property(nonPrimitive, v => {
        expect(isJsonPrimitive(v)).toBe(false)
      }),
    )
  })

  // isBuffer: true for real Buffers, false for arbitrary non-Buffer values.
  test('isBuffer is true for real Buffers and false otherwise', () => {
    fc.assert(
      fc.property(fc.uint8Array(), bytes => {
        expect(isBuffer(Buffer.from(bytes))).toBe(true)
      }),
    )
    const nonBuffer = fc.oneof(
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- null is a valid non-Buffer input under test
      fc.constant(null),
      fc.constant(undefined),
      fc.boolean(),
      fc.double(),
      fc.string(),
      fc.array(fc.integer()),
      fc.dictionary(fc.string(), fc.integer()),
    )
    fc.assert(
      fc.property(nonBuffer, v => {
        expect(isBuffer(v)).toBe(false)
      }),
    )
  })

  // prototypePollutionReviver: identity on safe keys, throws on dangerous keys.
  test('prototypePollutionReviver passes through safe keys unchanged', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('a', 'b', 'name', 'value', '', '0', 'proto'),
        fc.anything(),
        (key, value) => {
          expect(prototypePollutionReviver(key, value)).toBe(value)
        },
      ),
    )
  })

  test('prototypePollutionReviver throws on dangerous keys', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DANGEROUS_KEYS),
        fc.anything(),
        (key, value) => {
          expect(() => prototypePollutionReviver(key, value)).toThrow(
            /prototype pollution/,
          )
        },
      ),
    )
  })
})
