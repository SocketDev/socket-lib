/**
 * @file Tests for ai/ profiles — verifies the lockdown shapes are what callers
 *   expect.
 */

import { describe, expect, it } from 'vitest'

import {
  EDIT_ONLY_PROFILE,
  FULL_FIX_PROFILE,
  READ_ONLY_PROFILE,
} from '../../../src/ai/profiles.mts'

describe('READ_ONLY_PROFILE', () => {
  it('has bash explicitly denied', () => {
    expect(READ_ONLY_PROFILE.disallow).toContain('Bash')
    expect(READ_ONLY_PROFILE.disallow).toContain('Edit')
    expect(READ_ONLY_PROFILE.disallow).toContain('Write')
  })

  it('uses dontAsk permission', () => {
    expect(READ_ONLY_PROFILE.permissionMode).toBe('dontAsk')
  })

  it('allows read tools', () => {
    expect(READ_ONLY_PROFILE.tools).toContain('Read')
    expect(READ_ONLY_PROFILE.tools).toContain('Grep')
    expect(READ_ONLY_PROFILE.tools).toContain('Glob')
  })
})

describe('EDIT_ONLY_PROFILE', () => {
  it('denies bash and allows edit', () => {
    expect(EDIT_ONLY_PROFILE.disallow).toContain('Bash')
    expect(EDIT_ONLY_PROFILE.tools).toContain('Edit')
    expect(EDIT_ONLY_PROFILE.tools).toContain('Write')
  })

  it('uses acceptEdits permission', () => {
    expect(EDIT_ONLY_PROFILE.permissionMode).toBe('acceptEdits')
  })
})

describe('FULL_FIX_PROFILE', () => {
  it('allows bash but allowlists shell calls', () => {
    expect(FULL_FIX_PROFILE.tools).toContain('Bash')
    expect(FULL_FIX_PROFILE.allow.length).toBeGreaterThan(0)
    for (const entry of FULL_FIX_PROFILE.allow) {
      expect(entry).toMatch(/^Bash\(/)
    }
  })

  it('denies webfetch and websearch', () => {
    expect(FULL_FIX_PROFILE.disallow).toContain('WebFetch')
    expect(FULL_FIX_PROFILE.disallow).toContain('WebSearch')
  })
})

describe('all profiles', () => {
  it.each([
    ['READ_ONLY', READ_ONLY_PROFILE],
    ['EDIT_ONLY', EDIT_ONLY_PROFILE],
    ['FULL_FIX', FULL_FIX_PROFILE],
  ] as const)('%s tools are alphabetically sorted', (_name, profile) => {
    const sorted = [...profile.tools].sort()
    expect(profile.tools).toStrictEqual(sorted)
  })

  it.each([
    ['READ_ONLY', READ_ONLY_PROFILE],
    ['EDIT_ONLY', EDIT_ONLY_PROFILE],
    ['FULL_FIX', FULL_FIX_PROFILE],
  ] as const)('%s disallow is alphabetically sorted', (_name, profile) => {
    const sorted = [...profile.disallow].sort()
    expect(profile.disallow).toStrictEqual(sorted)
  })
})
