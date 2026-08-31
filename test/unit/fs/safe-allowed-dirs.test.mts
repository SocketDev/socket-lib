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
  areAllPathsInAllowedDirs,
  clearDefaultAllowedDirectories,
  getDefaultAllowedDirectories,
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
  clearDefaultAllowedDirectories()
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
    const dirs = getDefaultAllowedDirectories()

    expect(dirs).not.toContain(os.homedir())
    expect(dirs).not.toContain(path.parse(process.cwd()).root)
    // Every entry is absolute, so a relative string can never match by prefix.
    for (const dir of dirs) {
      expect(path.isAbsolute(dir)).toBe(true)
    }
  })
})

describe('safeDelete with a caller-named allowedDirs root', () => {
  it('deletes inside a named sibling root without force', () => {
    // The cascade case: a tree the caller owns but does not run from. Built
    // under the temp dir so the test never touches a real sibling checkout.
    const sibling = makeDir(realpathSync(os.tmpdir()), 'safe-allowed-sibling')
    const inside = makeDir(sibling, 'staged')

    safeDeleteSync(inside, { allowedDirs: [sibling], recursive: true })

    expect(existsSync(inside)).toBe(false)
    expect(existsSync(sibling)).toBe(true)
  })

  it('grants a named root only to what it contains', () => {
    // Asserted on the containment predicate rather than by deleting: the temp
    // dir is itself an allowed root, so anything staged there for a behavioural
    // test would be authorized by the built-in list regardless of the argument.
    // These paths are therefore outside every default tree and need not exist.
    const sibling = path.join(path.parse(process.cwd()).root, 'named-root')
    const inside = path.join(sibling, 'staged')
    const escaping = path.join(sibling, '..', 'not-staged')

    expect(areAllPathsInAllowedDirs([inside], [sibling])).toBe(true)
    expect(areAllPathsInAllowedDirs([sibling], [sibling])).toBe(true)
    expect(areAllPathsInAllowedDirs([escaping], [sibling])).toBe(false)
    // Without the named root, the same target is refused.
    expect(areAllPathsInAllowedDirs([inside])).toBe(false)
    // Every pattern has to be contained, not just one.
    expect(areAllPathsInAllowedDirs([inside, escaping], [sibling])).toBe(false)
  })

  it('leaves the default roots unchanged after a call names its own', () => {
    const sibling = makeDir(realpathSync(os.tmpdir()), 'safe-allowed-leak')
    const inside = makeDir(sibling, 'staged')

    safeDeleteSync(inside, { allowedDirs: [sibling], recursive: true })

    expect(getDefaultAllowedDirectories()).not.toContain(sibling)
  })
})
