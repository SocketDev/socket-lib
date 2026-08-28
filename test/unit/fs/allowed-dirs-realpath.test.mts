/**
 * @file Unit tests for the allowed-directory list behind safeDelete — the
 *   symlink case specifically. On macOS `os.tmpdir()` reports `/var/folders/…`
 *   while its real path is `/private/var/folders/…`, because `/var` is a
 *   symlink to `/private/var`. A caller that ran the path through
 *   `fs.realpathSync` holds the second form, and listing only the first made
 *   that caller look like it sat outside every allowed tree.
 */

import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

import { safeDelete, safeDeleteSync } from '../../../src/fs/safe.mjs'
import {
  clearAllowedDirectories,
  getAllowedDirectories,
} from '../../../src/fs/shared.mjs'

const madeDirs: string[] = []

function makeDir(base: string, name: string): string {
  const dir = path.join(base, name)
  mkdirSync(dir, { recursive: true })
  madeDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of madeDirs.splice(0)) {
    if (existsSync(dir)) {
      // No `force`: these live in the temp dir, which the allowed-directory
      // list exempts — the behaviour this file exists to pin.
      safeDeleteSync(dir, { recursive: true })
    }
  }
  clearAllowedDirectories()
})

describe('getAllowedDirectories', () => {
  it('lists the temp dir in both its resolved and real form', () => {
    const dirs = getAllowedDirectories()
    const resolved = path.resolve(os.tmpdir())
    const real = realpathSync(resolved)

    expect(dirs).toContain(resolved)
    expect(dirs).toContain(real)
  })

  it('holds no duplicate entry when the two forms are identical', () => {
    // On a platform with no symlink in the temp path both forms collapse, and
    // the list must not carry the same string twice.
    const dirs = getAllowedDirectories()
    expect(new Set(dirs).size).toBe(dirs.length)
  })

  it('caches, so repeated reads do not re-resolve', () => {
    // Same array identity proves the realpath calls happen once per process
    // rather than once per delete.
    const first = getAllowedDirectories()
    const second = getAllowedDirectories()
    expect(second).toBe(first)
  })

  it('rehydrates after the cache is cleared', () => {
    const first = getAllowedDirectories()
    clearAllowedDirectories()
    const second = getAllowedDirectories()

    expect(second).not.toBe(first)
    expect(second).toEqual(first)
  })
})

describe('safeDelete inside the temp dir', () => {
  it('removes a path given in the resolved form', async () => {
    const dir = makeDir(path.resolve(os.tmpdir()), 'safe-allowed-resolved')
    await safeDelete(dir, { recursive: true })
    expect(existsSync(dir)).toBe(false)
  })

  it('removes a path given in the real form', async () => {
    // The regression: a path sitting inside the temp dir was rejected as
    // out-of-tree purely because it arrived in its `/private` spelling.
    const dir = makeDir(realpathSync(os.tmpdir()), 'safe-allowed-real')
    await safeDelete(dir, { recursive: true })
    expect(existsSync(dir)).toBe(false)
  })

  it('removes a real-form path synchronously too', () => {
    const dir = makeDir(realpathSync(os.tmpdir()), 'safe-allowed-real-sync')
    safeDeleteSync(dir, { recursive: true })
    expect(existsSync(dir)).toBe(false)
  })

  it('does not widen the list to somewhere it should never reach', () => {
    // Asserted against the list itself, not by attempting an operation: a
    // behavioural version of this check would have to target a real directory
    // to prove the point. The home dir and the filesystem root are the two
    // that must stay off the list.
    const dirs = getAllowedDirectories()

    expect(dirs).not.toContain(os.homedir())
    expect(dirs).not.toContain(path.parse(process.cwd()).root)
    // Every entry is absolute, so a relative string can never match by prefix.
    for (const dir of dirs) {
      expect(path.isAbsolute(dir)).toBe(true)
    }
  })
})
