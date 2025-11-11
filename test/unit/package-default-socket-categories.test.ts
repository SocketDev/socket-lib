/**
 * @fileoverview Unit tests for default Socket security categories.
 */

import { packageDefaultSocketCategories } from '@socketsecurity/lib/package-default-socket-categories'
import { describe, expect, it } from 'vitest'

describe('package-default-socket-categories', () => {
  it('should export an array with cleanup category', () => {
    expect(packageDefaultSocketCategories).toEqual(['cleanup'])
  })

  it('should be a frozen array', () => {
    expect(Object.isFrozen(packageDefaultSocketCategories)).toBe(true)
  })

  it('should be an array', () => {
    expect(Array.isArray(packageDefaultSocketCategories)).toBe(true)
  })

  it('should have length of 1', () => {
    expect(packageDefaultSocketCategories).toHaveLength(1)
  })

  it('should not be modifiable', () => {
    expect(() => {
      // @ts-expect-error - testing immutability
      packageDefaultSocketCategories.push('new-category')
    }).toThrow()
  })

  it('should contain only string values', () => {
    for (const category of packageDefaultSocketCategories) {
      expect(typeof category).toBe('string')
    }
  })

  it('should contain cleanup as first element', () => {
    expect(packageDefaultSocketCategories[0]).toBe('cleanup')
  })
})
