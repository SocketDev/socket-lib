/**
 * @file Tests for ai/ profiles — verifies the lockdown shapes are what callers
 *   expect, and that the capability ladder (read ⊂ edit ⊂ create ⊂ full)
 *   holds.
 */

import { describe, expect, it } from 'vitest'

import { AI_PROFILE, BASH_ALLOW } from '../../../src/ai/profiles.mts'

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
  it('allows Edit but NOT Write (in-place only)', () => {
    expect(AI_PROFILE.edit.tools).toContain('Edit')
    expect(AI_PROFILE.edit.tools).not.toContain('Write')
    expect(AI_PROFILE.edit.disallow).toContain('Write')
  })

  it('names no unknown tools — the CLI hard-errors on a deny rule for a tool it does not recognize', () => {
    const profiles = Object.values(AI_PROFILE)
    for (let i = 0, { length } = profiles; i < length; i += 1) {
      const profile = profiles[i]!
      expect(profile.tools).not.toContain('MultiEdit')
      expect(profile.disallow).not.toContain('MultiEdit')
    }
  })

  it('denies bash and uses acceptEdits', () => {
    expect(AI_PROFILE.edit.disallow).toContain('Bash')
    expect(AI_PROFILE.edit.permissionMode).toBe('acceptEdits')
  })
})

describe('AI_PROFILE.create', () => {
  it('allows Write (can create files) but not Bash', () => {
    expect(AI_PROFILE.create.tools).toContain('Write')
    expect(AI_PROFILE.create.tools).not.toContain('Bash')
    expect(AI_PROFILE.create.disallow).toContain('Bash')
  })
})

describe('AI_PROFILE.verify', () => {
  it('allows Bash + Write (author + self-verify)', () => {
    expect(AI_PROFILE.verify.tools).toContain('Bash')
    expect(AI_PROFILE.verify.tools).toContain('Write')
  })

  it('allows running code + tests but NOT landing (no git add/commit)', () => {
    const allow = AI_PROFILE.verify.allow
    expect(allow).toContain('Bash(node:*)')
    expect(allow).toContain('Bash(pnpm test:*)')
    expect(allow).toContain('Bash(git status:*)')
    // The bright line: verify must not be able to land its own work.
    expect(allow).not.toContain('Bash(git add:*)')
    expect(allow).not.toContain('Bash(git commit:*)')
  })

  it('every allow entry is a Bash glob', () => {
    for (const entry of AI_PROFILE.verify.allow) {
      expect(entry).toMatch(/^Bash\(/)
    }
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

  it('adds the mutating git commands verify withholds', () => {
    expect(AI_PROFILE.full.allow).toContain('Bash(git add:*)')
    expect(AI_PROFILE.full.allow).toContain('Bash(git commit:*)')
  })

  it('denies webfetch and websearch', () => {
    expect(AI_PROFILE.full.disallow).toContain('WebFetch')
    expect(AI_PROFILE.full.disallow).toContain('WebSearch')
  })
})

describe('BASH_ALLOW building blocks', () => {
  it('every entry across every group is a Bash glob', () => {
    const groups = Object.values(BASH_ALLOW)
    for (let i = 0, { length } = groups; i < length; i += 1) {
      const group = groups[i]!
      for (let j = 0, { length: glen } = group; j < glen; j += 1) {
        expect(group[j]).toMatch(/^Bash\([^)]+:\*\)$/)
      }
    }
  })

  // Expected value is a LITERAL of the exact full-tier surface — not built
  // from BASH_ALLOW (no-src-import-in-test-expect: a test must not validate
  // src against itself, and these symbols are too new for the -stable
  // snapshot). If the composition in profiles.mts changes, this literal must
  // be updated in lockstep — which is the point: the literal is the
  // independent oracle.
  it('full = verify-surface ∪ gitWrite ∪ pkgExec (composed, no drift)', () => {
    expect(new Set(AI_PROFILE.full.allow)).toStrictEqual(
      new Set([
        'Bash(git add:*)',
        'Bash(git commit:*)',
        'Bash(git diff:*)',
        'Bash(git log:*)',
        'Bash(git status:*)',
        'Bash(node:*)',
        'Bash(pnpm exec:*)',
        'Bash(pnpm run:*)',
        'Bash(pnpm test:*)',
      ]),
    )
  })
})

const TIERS = [
  ['read', AI_PROFILE.read],
  ['edit', AI_PROFILE.edit],
  ['create', AI_PROFILE.create],
  ['verify', AI_PROFILE.verify],
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

describe('capability ladder (read ⊂ edit ⊂ create ⊂ verify ⊂ full)', () => {
  it('each tier mutation-tool set is a superset of the previous', () => {
    // Compare the editing/writing/bash tools only — read's Web* tools
    // are orthogonal (research surface, dropped once we start mutating).
    const mutating = (p: { tools: readonly string[] }) =>
      new Set(
        p.tools.filter(t => ['Bash', 'Edit', 'MultiEdit', 'Write'].includes(t)),
      )
    const edit = mutating(AI_PROFILE.edit)
    const create = mutating(AI_PROFILE.create)
    const verify = mutating(AI_PROFILE.verify)
    const full = mutating(AI_PROFILE.full)
    // edit ⊂ create
    for (const t of edit) {
      expect(create.has(t)).toBe(true)
    }
    expect(create.size).toBeGreaterThan(edit.size)
    // create ⊂ verify (verify adds Bash)
    for (const t of create) {
      expect(verify.has(t)).toBe(true)
    }
    expect(verify.size).toBeGreaterThan(create.size)
    // verify ⊆ full at the tool level; the Bash ALLOWLIST is the true
    // widening (full adds git add/commit + pnpm exec).
    for (const t of verify) {
      expect(full.has(t)).toBe(true)
    }
    // Capture the counts into locals so the matcher argument is a plain
    // number, not a src-member-expression (no-src-import-in-test-expect).
    const fullAllowCount = AI_PROFILE.full.allow.length
    const verifyAllowCount = AI_PROFILE.verify.allow.length
    expect(fullAllowCount).toBeGreaterThan(verifyAllowCount)
  })
})
