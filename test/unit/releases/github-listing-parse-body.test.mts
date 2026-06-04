/**
 * @file Regression test for parseResponseBody — the fix for the "Failed to
 *   parse <owner>/<repo> releases response" build failure. The http layer may
 *   hand back an already-parsed object/array (not a Buffer/string); the old
 *   code did `body.toString('utf8')` + JSON.parse, which on an object yields
 *   "[object Object]" and throws. parseResponseBody must accept all shapes.
 */

import { describe, expect, it } from 'vitest'

import { parseResponseBody } from '../../../src/releases/github-listing'

describe('parseResponseBody', () => {
  it('parses a JSON string', () => {
    expect(parseResponseBody('[{"tag_name":"v1"}]')).toEqual([
      { tag_name: 'v1' },
    ])
    expect(parseResponseBody('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses a Buffer of JSON', () => {
    const buf = Buffer.from('[{"tag_name":"v2"}]', 'utf8')
    expect(parseResponseBody(buf)).toEqual([{ tag_name: 'v2' }])
  })

  it('passes through an already-parsed array (the bug shape)', () => {
    const arr = [{ tag_name: 'v3' }]
    // This is the case the old `body.toString()` + JSON.parse path broke on.
    expect(parseResponseBody(arr)).toBe(arr)
  })

  it('passes through an already-parsed object', () => {
    const obj = { data: { repository: { releases: { nodes: [] } } } }
    expect(parseResponseBody(obj)).toBe(obj)
  })

  it('throws on genuinely malformed JSON text', () => {
    expect(() => parseResponseBody('{not json')).toThrow()
  })
})
