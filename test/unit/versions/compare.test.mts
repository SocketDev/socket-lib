import { describe, expect, it } from 'vitest'

import {
  compare,
  eq,
  gt,
  gte,
  lt,
  lte,
  rsort,
  sort,
} from '../../../src/versions/compare'

describe('versions/compare — compare', () => {
  it('compares equal versions', () => {
    expect(compare('1.0.0', '1.0.0')).toBe(0)
  })

  it('returns -1 when first is less than second', () => {
    expect(compare('1.0.0', '2.0.0')).toBe(-1)
    expect(compare('1.0.0', '1.1.0')).toBe(-1)
    expect(compare('1.0.0', '1.0.1')).toBe(-1)
  })

  it('returns 1 when first is greater than second', () => {
    expect(compare('2.0.0', '1.0.0')).toBe(1)
    expect(compare('1.1.0', '1.0.0')).toBe(1)
    expect(compare('1.0.1', '1.0.0')).toBe(1)
  })

  it('returns undefined for invalid versions', () => {
    expect(compare('invalid', '1.0.0')).toBeUndefined()
    expect(compare('1.0.0', 'invalid')).toBeUndefined()
  })
})

describe('versions/compare — eq / gt / gte / lt / lte', () => {
  it('checks version equality', () => {
    expect(eq('1.0.0', '1.0.0')).toBe(true)
    expect(eq('1.0.0', '1.0.1')).toBe(false)
  })

  it('checks if first version is greater', () => {
    expect(gt('2.0.0', '1.0.0')).toBe(true)
    expect(gt('1.0.0', '2.0.0')).toBe(false)
    expect(gt('1.0.0', '1.0.0')).toBe(false)
  })

  it('checks if first version is greater or equal', () => {
    expect(gte('2.0.0', '1.0.0')).toBe(true)
    expect(gte('1.0.0', '1.0.0')).toBe(true)
    expect(gte('1.0.0', '2.0.0')).toBe(false)
  })

  it('checks if first version is less', () => {
    expect(lt('1.0.0', '2.0.0')).toBe(true)
    expect(lt('2.0.0', '1.0.0')).toBe(false)
    expect(lt('1.0.0', '1.0.0')).toBe(false)
  })

  it('checks if first version is less or equal', () => {
    expect(lte('1.0.0', '2.0.0')).toBe(true)
    expect(lte('1.0.0', '1.0.0')).toBe(true)
    expect(lte('2.0.0', '1.0.0')).toBe(false)
  })
})

describe('versions/compare — sort / rsort', () => {
  it('sorts versions in ascending order', () => {
    const versions = ['2.0.0', '1.0.0', '1.9.0', '1.5.0']
    expect(sort(versions)).toEqual(['1.0.0', '1.5.0', '1.9.0', '2.0.0'])
  })

  it('does not mutate original array on sort', () => {
    const versions = ['2.0.0', '1.0.0']
    sort(versions)
    expect(versions).toEqual(['2.0.0', '1.0.0'])
  })

  it('sorts versions in descending order', () => {
    const versions = ['1.0.0', '2.0.0', '1.5.0', '1.9.0']
    expect(rsort(versions)).toEqual(['2.0.0', '1.9.0', '1.5.0', '1.0.0'])
  })

  it('does not mutate original array on rsort', () => {
    const versions = ['1.0.0', '2.0.0']
    rsort(versions)
    expect(versions).toEqual(['1.0.0', '2.0.0'])
  })
})
