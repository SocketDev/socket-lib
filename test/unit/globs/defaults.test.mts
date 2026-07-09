import { describe, expect, it } from 'vitest'

import { defaultIgnore } from '../../../src/globs/defaults'

describe('globs/defaults — defaultIgnore', () => {
  it('should be an array', () => {
    expect(Array.isArray(defaultIgnore)).toBe(true)
  })

  it('should contain common ignore patterns', () => {
    expect(defaultIgnore).toContain('**/.git')
    expect(defaultIgnore).toContain('**/.npmrc')
    expect(defaultIgnore).toContain('**/node_modules')
    expect(defaultIgnore).toContain('**/.DS_Store')
  })

  it('should include npm-packlist defaults', () => {
    expect(defaultIgnore).toContain('**/.gitignore')
    expect(defaultIgnore).toContain('**/.svn')
    expect(defaultIgnore).toContain('**/CVS')
    expect(defaultIgnore).toContain('**/npm-debug.log')
  })

  it('should include additional common ignores', () => {
    expect(defaultIgnore).toContain('**/.env')
    expect(defaultIgnore).toContain('**/.eslintcache')
    expect(defaultIgnore).toContain('**/.vscode')
    expect(defaultIgnore).toContain('**/Thumbs.db')
  })

  it('should be frozen', () => {
    expect(Object.isFrozen(defaultIgnore)).toBe(true)
  })

  it('should not be modifiable', () => {
    const originalLength = defaultIgnore.length
    expect(() => {
      ;(defaultIgnore as string[]).push('new-pattern')
    }).toThrow()
    expect(defaultIgnore.length).toBe(originalLength)
  })

  it('should have reasonable length', () => {
    expect(defaultIgnore.length).toBeGreaterThan(10)
    expect(defaultIgnore.length).toBeLessThan(100)
  })

  it('should contain glob patterns', () => {
    for (const pattern of defaultIgnore) {
      expect(typeof pattern).toBe('string')
      expect(pattern.length).toBeGreaterThan(0)
    }
  })
})
