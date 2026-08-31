/**
 * @file Unit tests for src/fs/shared — the default allowed-directory list.
 *   On macOS `os.tmpdir()` reports `/var/folders/…` while its real path is
 *   `/private/var/folders/…`, because `/var` is a symlink to `/private/var`.
 *   The list carries both spellings so a caller that ran the path through
 *   `fs.realpathSync` still matches.
 */

import { realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  clearDefaultAllowedDirectories,
  getDefaultAllowedDirectories,
} from '../../../src/fs/shared.mjs'

afterEach(() => {
  clearDefaultAllowedDirectories()
})

describe('getDefaultAllowedDirectories', () => {
  it('lists the temp dir in both its resolved and real form', () => {
    const dirs = getDefaultAllowedDirectories()
    const resolved = path.resolve(os.tmpdir())
    const real = realpathSync(resolved)

    expect(dirs).toContain(resolved)
    expect(dirs).toContain(real)
  })

  it('holds no duplicate entry when the two forms are identical', () => {
    // On a platform with no symlink in the temp path both forms collapse, and
    // the list must not carry the same string twice.
    const dirs = getDefaultAllowedDirectories()
    expect(new Set(dirs).size).toBe(dirs.length)
  })

  it('hands back a fresh array, so a caller cannot widen the list', () => {
    // The reason the cache is not returned directly: a caller that appends its
    // own roots would otherwise widen the allow-list for every later delete in
    // the process.
    const first = getDefaultAllowedDirectories()
    first.push('/appended-by-a-caller')
    const second = getDefaultAllowedDirectories()

    expect(second).not.toBe(first)
    expect(second).not.toContain('/appended-by-a-caller')
  })

  it('reads the same set on repeated calls', () => {
    const first = getDefaultAllowedDirectories()
    const second = getDefaultAllowedDirectories()
    expect(second).toEqual(first)
  })

  it('rehydrates after the cache is cleared', () => {
    const first = getDefaultAllowedDirectories()
    clearDefaultAllowedDirectories()
    const second = getDefaultAllowedDirectories()

    expect(second).toEqual(first)
  })
})
