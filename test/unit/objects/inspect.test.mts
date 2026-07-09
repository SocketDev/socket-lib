import { describe, expect, it } from 'vitest'

import {
  getKeys,
  getOwn,
  getOwnPropertyValues,
} from '../../../src/objects/inspect'

describe('objects/inspect — getKeys', () => {
  it('should return enumerable own keys', () => {
    const obj = { a: 1, b: 2, c: 3 }
    const keys = getKeys(obj)
    expect(keys).toEqual(['a', 'b', 'c'])
  })

  it('should return empty array for non-objects', () => {
    expect(getKeys(undefined)).toEqual([])
    expect(getKeys(undefined)).toEqual([])
    expect(getKeys(123)).toEqual([])
    expect(getKeys('string')).toEqual([])
  })

  it('should return empty array for objects without keys', () => {
    expect(getKeys({})).toEqual([])
  })

  it('should work with arrays', () => {
    const arr = ['a', 'b', 'c']
    const keys = getKeys(arr)
    expect(keys).toEqual(['0', '1', '2'])
  })
})

describe('objects/inspect — getOwn', () => {
  it('should get own property value', () => {
    const obj = { a: 1, b: 2 }
    expect(getOwn(obj, 'a')).toBe(1)
    expect(getOwn(obj, 'b')).toBe(2)
  })

  it('should return undefined for non-existent properties', () => {
    const obj = { a: 1 }
    expect(getOwn(obj, 'b')).toBeUndefined()
  })

  it('should return undefined for null/undefined', () => {
    expect(getOwn(undefined, 'a')).toBeUndefined()
    expect(getOwn(undefined, 'a')).toBeUndefined()
  })

  it('should not access prototype properties', () => {
    const proto = { inherited: 'value' }
    const obj = Object.create(proto)
    obj.own = 'owned'
    expect(getOwn(obj, 'own')).toBe('owned')
    expect(getOwn(obj, 'inherited')).toBeUndefined()
  })

  it('should handle symbol keys', () => {
    const sym = Symbol('test')
    const obj = { [sym]: 'value' }
    expect(getOwn(obj, sym)).toBe('value')
  })

  it('should handle number keys', () => {
    const obj = { 123: 'value' }
    expect(getOwn(obj, 123)).toBe('value')
  })

  it('should handle arrays', () => {
    const arr = ['a', 'b', 'c']
    expect(getOwn(arr, 0)).toBe('a')
    expect(getOwn(arr, '1')).toBe('b')
    expect(getOwn(arr, 'length')).toBe(3)
  })
})

describe('objects/inspect — getOwnPropertyValues', () => {
  it('should return all own property values', () => {
    const obj = { a: 1, b: 2, c: 3 }
    const values = getOwnPropertyValues(obj)
    expect(values).toContain(1)
    expect(values).toContain(2)
    expect(values).toContain(3)
    expect(values).toHaveLength(3)
  })

  it('should return empty array for null/undefined', () => {
    expect(getOwnPropertyValues(undefined)).toEqual([])
    expect(getOwnPropertyValues(undefined)).toEqual([])
  })

  it('should return empty array for objects without properties', () => {
    expect(getOwnPropertyValues({})).toEqual([])
  })

  it('should include non-enumerable properties', () => {
    const obj = { a: 1 }
    Object.defineProperty(obj, 'hidden', {
      value: 'secret',
      enumerable: false,
    })
    const values = getOwnPropertyValues(obj)
    expect(values).toContain(1)
    expect(values).toContain('secret')
  })
})
