/**
 * @file Tests for ai/ profiles — verifies the lockdown shapes are what callers
 *   expect, and that the capability ladder (read ⊂ edit ⊂ create ⊂ full)
 *   holds.
 */

import { describe, expect, it } from 'vitest'

import { AI_PROFILE } from '../../../src/ai/profiles.mts'

describe('AI_PROFILE.read', () => {
  it('denies all mutation tools', () => {
    expect(AI_PROFILE.read.disallow).toContain('Bash')
    expect(AI_PROFILE.read.disallow).toContain('Edit')
    expect(AI_PROFILE.read.disallow).toContain('Write')
  })

  it('uses dontAsk permission', () => {
    expect(AI_PROFILE.read.permissionMode).toBe('dontAsk')
  })

  it('allows read tools', () => {
    expect(AI_PROFILE.read.tools).toContain('Read')
    expect(AI_PROFILE.read.tools).toContain('Grep')
    expect(AI_PROFILE.read.tools).toContain('Glob')
  })
})

describe('AI_PROFILE.edit', () => {
  it('allows Edit but NOT Write / MultiEdit (in-place only)', () => {
    expect(AI_PROFILE.edit.tools).toContain('Edit')
    expect(AI_PROFILE.edit.tools).not.toContain('Write')
    expect(AI_PROFILE.edit.tools).not.toContain('MultiEdit')
    expect(AI_PROFILE.edit.disallow).toContain('Write')
    expect(AI_PROFILE.edit.disallow).toContain('MultiEdit')
  })

  it('denies bash and uses acceptEdits', () => {
    expect(AI_PROFILE.edit.disallow).toContain('Bash')
    expect(AI_PROFILE.edit.permissionMode).toBe('acceptEdits')
  })
})

describe('AI_PROFILE.create', () => {
  it('allows Write + MultiEdit (can create files) but not Bash', () => {
    expect(AI_PROFILE.create.tools).toContain('Write')
    expect(AI_PROFILE.create.tools).toContain('MultiEdit')
    expect(AI_PROFILE.create.tools).not.toContain('Bash')
    expect(AI_PROFILE.create.disallow).toContain('Bash')
  })
})

describe('AI_PROFILE.full', () => {
  it('allows bash but allowlists shell calls', () => {
    expect(AI_PROFILE.full.tools).toContain('Bash')
    expect(AI_PROFILE.full.allow.length).toBeGreaterThan(0)
    for (const entry of AI_PROFILE.full.allow) {
      expect(entry).toMatch(/^Bash\(/)
    }
  })

  it('denies webfetch and websearch', () => {
    expect(AI_PROFILE.full.disallow).toContain('WebFetch')
    expect(AI_PROFILE.full.disallow).toContain('WebSearch')
  })
})

const TIERS = [
  ['read', AI_PROFILE.read],
  ['edit', AI_PROFILE.edit],
  ['create', AI_PROFILE.create],
  ['full', AI_PROFILE.full],
] as const

describe('all profiles', () => {
  it.each(TIERS)('%s tools are alphabetically sorted', (_name, profile) => {
    const sorted = [...profile.tools].toSorted()
    expect(profile.tools).toStrictEqual(sorted)
  })

  it.each(TIERS)('%s disallow is alphabetically sorted', (_name, profile) => {
    const sorted = [...profile.disallow].toSorted()
    expect(profile.disallow).toStrictEqual(sorted)
  })

  it.each(TIERS)('%s denies Agent (no sub-agent escape)', (_name, profile) => {
    expect(profile.disallow).toContain('Agent')
  })
})

describe('capability ladder (read ⊂ edit ⊂ create ⊂ full)', () => {
  it('each tier mutation-tool set is a superset of the previous', () => {
    // Compare the editing/writing/bash tools only — read's Web* tools
    // are orthogonal (research surface, dropped once we start mutating).
    const mutating = (p: { tools: readonly string[] }) =>
      new Set(
        p.tools.filter(t => ['Bash', 'Edit', 'MultiEdit', 'Write'].includes(t)),
      )
    const edit = mutating(AI_PROFILE.edit)
    const create = mutating(AI_PROFILE.create)
    const full = mutating(AI_PROFILE.full)
    // edit ⊂ create
    for (const t of edit) {
      expect(create.has(t)).toBe(true)
    }
    expect(create.size).toBeGreaterThan(edit.size)
    // create ⊂ full
    for (const t of create) {
      expect(full.has(t)).toBe(true)
    }
    expect(full.size).toBeGreaterThan(create.size)
  })
})
