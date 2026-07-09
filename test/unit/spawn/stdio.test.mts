import { describe, expect, it } from 'vitest'

import { isStdioType } from '../../../src/process/spawn/stdio'

describe('spawn/stdio — isStdioType', () => {
  describe('single argument mode (validation)', () => {
    it('returns true for valid stdio types', () => {
      expect(isStdioType('pipe')).toBe(true)
      expect(isStdioType('ignore')).toBe(true)
      expect(isStdioType('inherit')).toBe(true)
      expect(isStdioType('overlapped')).toBe(true)
    })

    it('returns false for invalid types', () => {
      expect(isStdioType('invalid')).toBe(false)
      expect(isStdioType('ipc')).toBe(false)
      expect(isStdioType('')).toBe(false)
    })

    it('returns false for arrays', () => {
      expect(isStdioType(['pipe'])).toBe(false)
    })
  })

  describe('two argument mode (matching)', () => {
    it('matches exact string types', () => {
      expect(isStdioType('pipe', 'pipe')).toBe(true)
      expect(isStdioType('ignore', 'ignore')).toBe(true)
      expect(isStdioType('inherit', 'inherit')).toBe(true)
    })

    it('does not match different types', () => {
      expect(isStdioType('pipe', 'ignore')).toBe(false)
      expect(isStdioType('ignore', 'pipe')).toBe(false)
    })

    it('treats null/undefined as pipe', () => {
      expect(isStdioType(undefined as unknown as string, 'pipe')).toBe(true)
      expect(isStdioType(undefined as unknown as string, 'pipe')).toBe(true)
      expect(isStdioType(undefined as unknown as string, 'ignore')).toBe(false)
    })

    it('matches array with all elements same as type', () => {
      expect(isStdioType(['pipe', 'pipe', 'pipe'], 'pipe')).toBe(true)
      expect(isStdioType(['ignore', 'ignore', 'ignore'], 'ignore')).toBe(true)
    })

    it('does not match array with different elements', () => {
      expect(isStdioType(['pipe', 'ignore', 'pipe'], 'pipe')).toBe(false)
      expect(isStdioType(['pipe', 'pipe', 'ignore'], 'pipe')).toBe(false)
    })

    it('does not match array with less than 3 elements', () => {
      expect(isStdioType(['pipe', 'pipe'], 'pipe')).toBe(false)
      expect(isStdioType(['pipe'], 'pipe')).toBe(false)
    })

    it('matches array with more than 3 elements if first 3 match', () => {
      expect(isStdioType(['pipe', 'pipe', 'pipe', 'inherit'], 'pipe')).toBe(
        true,
      )
    })
  })
})
