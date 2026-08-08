/**
 * @file Unit tests for entrypoint detection. The symlink case is the reason
 *   the module exists: a script invoked through a symlinked path (macOS
 *   `/var` → `/private/var`, the shape every mkdtemp-based integration test
 *   hits) must still detect itself as the entrypoint, so the test builds a
 *   real file + symlink pair under `os.tmpdir()` and compares through it.
 */

import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isMainModule } from '../../../src/cli/is-main-module'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

let scratchDir: string
let realScript: string
let linkedScript: string

beforeAll(() => {
  scratchDir = mkdtempSync(path.join(os.tmpdir(), 'is-main-module-'))
  realScript = path.join(scratchDir, 'real-script.mjs')
  writeFileSync(realScript, 'export {}\n')
  linkedScript = path.join(scratchDir, 'linked-script.mjs')
  symlinkSync(realScript, linkedScript)
})

afterAll(() => {
  safeDeleteSync(scratchDir)
})

describe('isMainModule', () => {
  it('matches when the entry path IS the module path', () => {
    const url = pathToFileURL(realScript).href
    expect(isMainModule(url, realScript)).toBe(true)
  })

  it('matches through a symlinked entry path (realpath comparison)', () => {
    // argv[1] carries the path as invoked — the symlink — while
    // import.meta.url carries the resolved real path. A naive string
    // comparison fails here; the realpath comparison must not.
    const url = pathToFileURL(realScript).href
    expect(isMainModule(url, linkedScript)).toBe(true)
  })

  it('matches when the module URL points at the symlink and entry at the real file', () => {
    const url = pathToFileURL(linkedScript).href
    expect(isMainModule(url, realScript)).toBe(true)
  })

  it('does not match a different entry path', () => {
    const other = path.join(scratchDir, 'other-script.mjs')
    writeFileSync(other, 'export {}\n')
    const url = pathToFileURL(realScript).href
    expect(isMainModule(url, other)).toBe(false)
  })

  it('returns false when the entry path does not exist (realpath throws)', () => {
    const url = pathToFileURL(realScript).href
    expect(isMainModule(url, path.join(scratchDir, 'missing.mjs'))).toBe(false)
  })

  it('returns false when the module path does not exist', () => {
    const url = pathToFileURL(path.join(scratchDir, 'missing.mjs')).href
    expect(isMainModule(url, realScript)).toBe(false)
  })

  it('returns false on an empty entry path', () => {
    const url = pathToFileURL(realScript).href
    expect(isMainModule(url, '')).toBe(false)
  })

  it('defaults the entry path to process.argv[1] (vitest worker ≠ this module)', () => {
    // Under vitest, argv[1] is the test runner — never this test module — so
    // the default-argument path must report false rather than throw.
    const url = pathToFileURL(realScript).href
    expect(isMainModule(url)).toBe(false)
  })
})
