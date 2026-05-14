/**
 * @fileoverview Unit tests for src/smol/is-module-builtin.ts.
 */

import { describe, expect, it } from 'vitest'

import { isModuleBuiltin } from '@socketsecurity/lib/smol/is-module-builtin'

describe('smol/is-module-builtin', () => {
  it('returns true for a real Node built-in', () => {
    expect(isModuleBuiltin('fs')).toBe(true)
    expect(isModuleBuiltin('node:fs')).toBe(true)
    expect(isModuleBuiltin('node:module')).toBe(true)
  })

  it('returns false for non-existent modules', () => {
    expect(isModuleBuiltin('not-a-real-module')).toBe(false)
    expect(isModuleBuiltin('node:smol-vfs')).toBe(false)
  })

  it('returns false for npm packages (not built-ins)', () => {
    expect(isModuleBuiltin('vitest')).toBe(false)
  })
})
