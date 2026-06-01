/**
 * @file Unit tests for src/json/parse — prototypePollutionReviver. Split out of
 *   test/unit/json/parse.test.mts to keep each test file under the fleet's
 *   500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

import { prototypePollutionReviver } from '../../../src/json/parse'

describe('prototypePollutionReviver', () => {
  it('throws on __proto__ key', () => {
    expect(() => prototypePollutionReviver('__proto__', {})).toThrow(
      /prototype pollution/,
    )
  })

  it('throws on constructor key', () => {
    expect(() => prototypePollutionReviver('constructor', {})).toThrow(
      /prototype pollution/,
    )
  })

  it('throws on prototype key', () => {
    expect(() => prototypePollutionReviver('prototype', {})).toThrow(
      /prototype pollution/,
    )
  })

  it('passes through safe keys', () => {
    expect(prototypePollutionReviver('name', 'Alice')).toBe('Alice')
    expect(prototypePollutionReviver('age', 42)).toBe(42)
    expect(prototypePollutionReviver('', { x: 1 })).toEqual({ x: 1 })
  })

  it('catches dangerous keys when used as JSON.parse reviver', () => {
    expect(() =>
      JSON.parse(
        '{"__proto__": {"polluted": true}}',
        prototypePollutionReviver,
      ),
    ).toThrow(/prototype pollution/)
  })

  it('does not block legitimate JSON via JSON.parse reviver', () => {
    const data = JSON.parse(
      '{"name": "Alice", "items": [1, 2, 3]}',
      prototypePollutionReviver,
    )
    expect(data).toEqual({ name: 'Alice', items: [1, 2, 3] })
  })
})
