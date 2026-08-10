/**
 * @file Tests for ai/json — the zero-dep JSON hardening primitives hoisted from
 *   the on-device provider. Each is pure and runs on a repair path: strip a
 *   fence, normalize typographic punctuation, canonicalize keys, extract the
 *   first balanced object, or close an under-terminated one.
 */

import { describe, expect, it } from 'vitest'

import {
  closeUnbalancedJson,
  findCanonicalKey,
  normalizeJsonPunctuation,
  normalizeKeys,
  repairJson,
  stripJsonFence,
} from '../../../src/ai/json'

describe('stripJsonFence', () => {
  it('extracts the body of a ```json fence', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('extracts the body of a bare ``` fence', () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('trims and returns the input when there is no fence', () => {
    expect(stripJsonFence('  {"a":1}  ')).toBe('{"a":1}')
  })

  it('takes the first fence when several are present', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```\n```\n{"b":2}\n```')).toBe(
      '{"a":1}',
    )
  })
})

describe('normalizeJsonPunctuation', () => {
  it('replaces fullwidth comma, colon, and semicolon with ASCII', () => {
    expect(normalizeJsonPunctuation('{"a"\u{FF1A}1\u{FF0C}"b"\u{FF1A}2}')).toBe(
      '{"a":1,"b":2}',
    )
    expect(normalizeJsonPunctuation('a\u{FF1B}b')).toBe('a;b')
  })

  it('replaces curly double and single quotes with ASCII', () => {
    expect(normalizeJsonPunctuation('\u{201C}x\u{201D}')).toBe('"x"')
    expect(normalizeJsonPunctuation('\u{2018}y\u{2019}')).toBe("'y'")
  })

  it('leaves already-ASCII text unchanged', () => {
    expect(normalizeJsonPunctuation('{"a":1}')).toBe('{"a":1}')
  })
})

describe('findCanonicalKey', () => {
  const synonyms = { summary: ['description', 'desc'], severity: ['level'] }

  it('returns the canonical name for a synonym (case-insensitive)', () => {
    expect(findCanonicalKey('description', synonyms)).toBe('summary')
    expect(findCanonicalKey('DESC', synonyms)).toBe('summary')
    expect(findCanonicalKey('Level', synonyms)).toBe('severity')
  })

  it('returns the canonical name when the key already matches it', () => {
    expect(findCanonicalKey('SUMMARY', synonyms)).toBe('summary')
  })

  it('returns the original key when no synonym matches', () => {
    expect(findCanonicalKey('unknown', synonyms)).toBe('unknown')
  })
})

describe('normalizeKeys', () => {
  const synonyms = { summary: ['description'], severity: ['level'] }

  it('rewrites object keys to their canonical form', () => {
    expect(
      normalizeKeys({ description: 'x', level: 'high' }, synonyms),
    ).toStrictEqual({ summary: 'x', severity: 'high' })
  })

  it('recurses into nested objects and arrays', () => {
    expect(
      normalizeKeys(
        { items: [{ description: 'a' }, { description: 'b' }] },
        synonyms,
      ),
    ).toStrictEqual({ items: [{ summary: 'a' }, { summary: 'b' }] })
  })

  it('passes primitives through untouched', () => {
    expect(normalizeKeys(42, synonyms)).toBe(42)
    expect(normalizeKeys('s', synonyms)).toBe('s')
    // JSON.parse('null') yields a null without a bare null literal in source.
    expect(normalizeKeys(JSON.parse('null'), synonyms)).toBeNull()
  })
})

describe('repairJson', () => {
  it('extracts the first balanced object from surrounding prose', () => {
    expect(repairJson('Here you go: {"a":1} — done')).toBe('{"a":1}')
  })

  it('respects braces inside string values', () => {
    expect(repairJson('{"a":"}"}')).toBe('{"a":"}"}')
  })

  it('handles nested objects', () => {
    expect(repairJson('{"a":{"b":1}}')).toBe('{"a":{"b":1}}')
  })

  it('returns "{}" when there is no object start', () => {
    expect(repairJson('no json here')).toBe('{}')
  })

  it('returns "{}" when the object never closes', () => {
    expect(repairJson('{"a":1')).toBe('{}')
  })
})

describe('closeUnbalancedJson', () => {
  it('appends the missing closer for an object one brace short', () => {
    expect(closeUnbalancedJson('{"a":1')).toBe('{"a":1}')
  })

  it('closes nested objects and arrays in reverse open order', () => {
    expect(closeUnbalancedJson('{"a":[1,2')).toBe('{"a":[1,2]}')
    expect(closeUnbalancedJson('{"a":{"b":1')).toBe('{"a":{"b":1}}')
  })

  it('ignores brackets inside strings', () => {
    expect(closeUnbalancedJson('{"a":"[unclosed"')).toBe('{"a":"[unclosed"}')
  })

  it('returns undefined when the text has no object start', () => {
    expect(closeUnbalancedJson('nope')).toBeUndefined()
  })

  it('returns undefined when the object is already balanced', () => {
    expect(closeUnbalancedJson('{"a":1}')).toBeUndefined()
  })

  it('returns undefined when a bracket mismatches', () => {
    expect(closeUnbalancedJson('{"a":[1}')).toBeUndefined()
  })

  it('returns undefined when the text ends inside a string', () => {
    expect(closeUnbalancedJson('{"a":"unterminated')).toBeUndefined()
  })
})
