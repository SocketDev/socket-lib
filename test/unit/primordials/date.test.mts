import { describe, expect, it } from 'vitest'

import {
  DatePrototypeGetTime,
  DatePrototypeToISOString,
  DatePrototypeToLocaleString,
  DatePrototypeValueOf,
} from '../../../src/primordials/date'

describe('primordials/date', () => {
  it('GetTime / ToISOString / ValueOf', () => {
    const d = new Date(0)
    expect(DatePrototypeGetTime(d)).toBe(0)
    expect(DatePrototypeToISOString(d)).toBe('1970-01-01T00:00:00.000Z')
    expect(DatePrototypeValueOf(d)).toBe(0)
  })

  it('ToLocaleString returns a non-empty string', () => {
    const d = new Date(0)
    expect(typeof DatePrototypeToLocaleString(d)).toBe('string')
    expect(DatePrototypeToLocaleString(d).length).toBeGreaterThan(0)
  })
})
