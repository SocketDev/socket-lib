/**
 * @file Unit tests for src/dlx/binary-resolution.ts Windows-specific branches.
 *   The module-level `WIN32` constant is mocked via the constants/platform
 *   import path; this exercises the `.cmd/.bat/.ps1/.exe` wrapper-resolution
 *   tier + the cache-recency-bump path.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the platform constant BEFORE importing the SUT so it sees WIN32=true.
vi.mock('../../../src/constants/platform', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../src/constants/platform')>()
  return { ...actual, WIN32: true }
})

import {
  makePackageBinsExecutable,
  resolveBinaryPath,
} from '../../../src/dlx/binary-resolution'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'bin-resolve-win-test-'))
})

afterEach(() => {
  rmSync(tmp, { force: true, recursive: true })
})

describe('dlx/binary-resolution — resolveBinaryPath (WIN32 stub)', () => {
  it('returns the .cmd wrapper when present', () => {
    const base = path.join(tmp, 'tool')
    writeFileSync(`${base}.cmd`, 'rem cmd wrapper')
    expect(resolveBinaryPath(base)).toBe(`${base}.cmd`)
  })

  it('returns the .bat wrapper when .cmd is absent', () => {
    const base = path.join(tmp, 'tool-bat')
    writeFileSync(`${base}.bat`, 'rem bat wrapper')
    expect(resolveBinaryPath(base)).toBe(`${base}.bat`)
  })

  it('returns the .ps1 wrapper when .cmd and .bat are absent', () => {
    const base = path.join(tmp, 'tool-ps1')
    writeFileSync(`${base}.ps1`, '# ps1 wrapper')
    expect(resolveBinaryPath(base)).toBe(`${base}.ps1`)
  })

  it('returns the .exe wrapper when only .exe is present', () => {
    const base = path.join(tmp, 'tool-exe')
    writeFileSync(`${base}.exe`, 'MZ')
    expect(resolveBinaryPath(base)).toBe(`${base}.exe`)
  })

  it('returns the bare path when only bare exists', () => {
    const base = path.join(tmp, 'tool-bare')
    writeFileSync(base, '#!/usr/bin/env node')
    expect(resolveBinaryPath(base)).toBe(base)
  })

  it('returns basePath unchanged when no wrapper exists', () => {
    const base = path.join(tmp, 'tool-missing')
    expect(resolveBinaryPath(base)).toBe(base)
  })

  it('uses the cache on the second lookup (same path)', () => {
    const base = path.join(tmp, 'tool-cache')
    writeFileSync(`${base}.cmd`, 'rem')
    const first = resolveBinaryPath(base)
    const second = resolveBinaryPath(base)
    expect(second).toBe(first)
    expect(second).toBe(`${base}.cmd`)
  })

  it('drops the cached path when the cached file disappears', () => {
    const base = path.join(tmp, 'tool-stale')
    writeFileSync(`${base}.cmd`, 'rem')
    expect(resolveBinaryPath(base)).toBe(`${base}.cmd`)
    rmSync(`${base}.cmd`)
    // Subsequent lookup invalidates the stale cache entry.
    // With no wrapper present, falls back to basePath.
    expect(resolveBinaryPath(base)).toBe(base)
  })
})

describe('dlx/binary-resolution — makePackageBinsExecutable (WIN32 stub)', () => {
  it('early-returns without touching the filesystem on Windows', () => {
    // No package.json need exist; the Win32 path returns before any I/O.
    expect(() =>
      makePackageBinsExecutable(tmp, 'never-installed'),
    ).not.toThrow()
  })
})
