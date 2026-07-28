/**
 * @file Unit tests for src/bin/which — whichReal, whichRealSync. Split out of
 *   the historical monolithic test/unit/bin.test.mts.
 */

import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { whichLocalBin, whichReal, whichRealSync } from '../../../src/bin/which'

describe('whichReal (async)', () => {
  it('resolves node to a real path and caches it', async () => {
    const result = await whichReal('node')
    expect(typeof result).toBe('string')
    expect(result as string).toContain('node')
    // Second call should hit the cache fast-path; result must match.
    const again = await whichReal('node')
    expect(again).toBe(result)
  })

  it('returns undefined for a binary that does not exist', async () => {
    const result = await whichReal('totally-nonexistent-binary-zxy-12345')
    expect(result).toBeUndefined()
  })
})

describe('whichRealSync', () => {
  it('should find node executable', () => {
    const result = whichRealSync('node')
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
    if (typeof result === 'string') {
      expect(result).toContain('node')
    }
  })

  it('should return undefined for non-existent binary', () => {
    const result = whichRealSync('totally-nonexistent-binary-12345')
    expect(result).toBeUndefined()
  })

  it('should return undefined by default when binary not found', () => {
    const result = whichRealSync('nonexistent-bin')
    expect(result).toBeUndefined()
  })

  it('should return undefined when nothrow is false and binary not found', () => {
    // Observed behavior: our wrapper returns undefined for missing
    // binaries regardless of nothrow. The option is passed through
    // to which-module; its behavior has evolved in recent versions.
    expect(
      whichRealSync('nonexistent-bin-xyz', { nothrow: false }),
    ).toBeUndefined()
  })

  it('should return array when all option is true', () => {
    const result = whichRealSync('node', { all: true })
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result) && result.length > 0) {
      expect(result[0]).toContain('node')
    }
  })

  it('should return undefined array when all is true and binary not found', () => {
    const result = whichRealSync('nonexistent-binary-12345', { all: true })
    expect(result).toBeUndefined()
  })

  it('should resolve node path when all is false', () => {
    // node is guaranteed to be on PATH (we are running under node).
    const result = whichRealSync('node', { all: false })
    expect(typeof result).toBe('string')
    expect(result).toContain('node')
    expect(result).not.toContain('\\')
  })

  it('should handle empty binary name', () => {
    const result = whichRealSync('')
    expect(result).toBeUndefined()
  })
})

describe('whichReal', () => {
  it('should find node executable', async () => {
    const result = await whichReal('node')
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
    if (typeof result === 'string') {
      expect(result).toContain('node')
    }
  })

  it('should return undefined for non-existent binary', async () => {
    const result = await whichReal('totally-nonexistent-binary-12345')
    expect(result).toBeUndefined()
  })

  it('should return array when all option is true', async () => {
    const result = await whichReal('node', { all: true })
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result) && result.length > 0) {
      expect(result[0]).toContain('node')
    }
  })

  it('should return undefined array when all is true and binary not found', async () => {
    const result = await whichReal('nonexistent-binary-12345', { all: true })
    expect(result).toBeUndefined()
  })

  it('should resolve paths when all is true', async () => {
    const result = await whichReal('node', { all: true })
    if (Array.isArray(result) && result.length > 0) {
      for (let i = 0, { length } = result; i < length; i += 1) {
        const p = result[i]!
        expect(typeof p).toBe('string')
        expect(p).not.toContain('\\')
      }
    }
  })

  it('should handle nothrow option', async () => {
    const result = await whichReal('nonexistent-bin', { nothrow: true })
    expect(result).toBeUndefined()
  })

  it('should return single path when all is false', async () => {
    const result = await whichReal('node', { all: false })
    expect(typeof result).toBe('string')
  })

  it('should handle empty binary name', async () => {
    const result = await whichReal('')
    expect(result).toBeUndefined()
  })
})

describe('whichRealSync and whichReal - options coverage', () => {
  it('should handle options with all explicitly set to undefined', () => {
    const result = whichRealSync('node', { all: undefined })
    expect(result).toBeDefined()
  })

  it('should handle async version with all explicitly set to undefined', async () => {
    const result = await whichReal('node', { all: undefined })
    expect(result).toBeDefined()
  })

  it('should handle multiple paths when all is true', () => {
    const result = whichRealSync('node', { all: true, nothrow: true })
    if (result && Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('should handle async multiple paths when all is true', async () => {
    const result = await whichReal('node', { all: true, nothrow: true })
    if (result && Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

describe('whichLocalBin', () => {
  it('resolves a project-local dep bin from node_modules/.bin', () => {
    // vitest is this package's own dev dependency, so its bin is always
    // linked into the project-local node_modules/.bin.
    const result = whichLocalBin('vitest')
    expect(typeof result).toBe('string')
    expect(result).toContain('vitest')
    expect(result).toContain('.bin')
  })

  it('honors an explicit cwd as the project root', () => {
    const result = whichLocalBin('vitest', { cwd: process.cwd() })
    expect(typeof result).toBe('string')
    expect(result).toContain('vitest')
  })

  it('uses an explicit options.path as the local bin dir', () => {
    const localBin = path.join(process.cwd(), 'node_modules', '.bin')
    const result = whichLocalBin('vitest', { path: localBin })
    expect(typeof result).toBe('string')
    expect(result).toContain('vitest')
  })

  it('falls back to PATH for a tool not in node_modules/.bin', () => {
    // node is a system binary, never linked into node_modules/.bin, so it
    // exercises the PATH-fallback branch (local miss → plain whichSync hit).
    const result = whichLocalBin('node')
    expect(typeof result).toBe('string')
    expect(result).toContain('node')
  })

  it('returns undefined when the tool resolves nowhere', () => {
    expect(
      whichLocalBin('totally-nonexistent-binary-zxy-98765'),
    ).toBeUndefined()
  })
})
