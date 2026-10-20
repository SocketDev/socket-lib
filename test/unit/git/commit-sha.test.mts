import { describe, expect, it } from 'vitest'

import { isFullCommitSha } from '../../../src/git/commit-sha.mts'

describe('isFullCommitSha', () => {
  it('accepts a full lowercase commit SHA', () => {
    expect(isFullCommitSha('a'.repeat(40))).toBe(true)
  })

  it('rejects non-string values', () => {
    expect(isFullCommitSha(undefined)).toBe(false)
    expect(isFullCommitSha(null)).toBe(false)
    expect(isFullCommitSha(42)).toBe(false)
  })

  it('rejects short and long values', () => {
    expect(isFullCommitSha('a'.repeat(39))).toBe(false)
    expect(isFullCommitSha('a'.repeat(41))).toBe(false)
  })

  it('rejects non-hex and uppercase characters', () => {
    expect(isFullCommitSha(`${'a'.repeat(39)}g`)).toBe(false)
    expect(isFullCommitSha('A'.repeat(40))).toBe(false)
  })
})
