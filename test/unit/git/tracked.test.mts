/**
 * @file Tests for git/tracked — isTracked / getSubmodulePaths /
 *   pathIsUnderSubmodule / isInSubmodule / isUntrackedNonSubmodulePath. Pure-
 *   predicate cases run without a repo; the git-touching helpers run against a
 *   fresh temp repo with a tracked file, an untracked junk file, and a declared
 *   (uninitialized) submodule in .gitmodules.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  getSubmodulePaths,
  isInSubmodule,
  isTracked,
  isUntrackedNonSubmodulePath,
  pathIsUnderSubmodule,
} from '../../../src/git/tracked'
import { spawnSync } from '../../../src/process/spawn/child'
import { runWithTempDir } from '../util/temp-file-helper'

function initRepo(dir: string): void {
  spawnSync('git', ['init'], { cwd: dir })
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: dir })
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
}

describe('pathIsUnderSubmodule (pure)', () => {
  it('matches an exact submodule path', () => {
    expect(pathIsUnderSubmodule('vendor/mbedtls', ['vendor/mbedtls'])).toBe(
      true,
    )
  })

  it('matches a path under a submodule', () => {
    expect(
      pathIsUnderSubmodule('vendor/mbedtls/scripts/__pycache__', [
        'vendor/mbedtls',
      ]),
    ).toBe(true)
  })

  it('does not match a sibling path', () => {
    expect(pathIsUnderSubmodule('vendor/other/x', ['vendor/mbedtls'])).toBe(
      false,
    )
  })

  it('does not match when there are no submodules', () => {
    expect(pathIsUnderSubmodule('src/index.ts', [])).toBe(false)
  })
})

describe('getSubmodulePaths edge cases (real temp repo)', () => {
  it('returns [] with no .gitmodules; isInSubmodule short-circuits', async () => {
    await runWithTempDir(async tmpDir => {
      initRepo(tmpDir)
      // No .gitmodules → git config exits non-zero → the catch yields ''.
      expect(await getSubmodulePaths({ cwd: tmpDir })).toEqual([])
      // Empty submodule list → isInSubmodule returns false without parsing.
      expect(await isInSubmodule('anything/x', { cwd: tmpDir })).toBe(false)
      // A junk file in a no-submodule repo is still safe to delete.
      await fs.writeFile(path.join(tmpDir, 'foo.orig'), 'x')
      expect(
        await isUntrackedNonSubmodulePath('foo.orig', { cwd: tmpDir }),
      ).toBe(true)
    }, 'git-tracked-no-sub')
  })

  it('parses multiple submodule path entries', async () => {
    await runWithTempDir(async tmpDir => {
      initRepo(tmpDir)
      await fs.writeFile(
        path.join(tmpDir, '.gitmodules'),
        [
          '[submodule "a"]',
          '\tpath = vendor/a',
          '\turl = https://example.com/a.git',
          '[submodule "b"]',
          '\tpath = vendor/b',
          '\turl = https://example.com/b.git',
        ].join('\n'),
      )
      const subs = await getSubmodulePaths({ cwd: tmpDir })
      expect(subs).toContain('vendor/a')
      expect(subs).toContain('vendor/b')
    }, 'git-tracked-multi-sub')
  })
})

describe('cwd defaulting (runs against this repo)', () => {
  it('isTracked / getSubmodulePaths default cwd to process.cwd()', async () => {
    // No options → the helpers fall back to process.cwd(), which is socket-lib
    // itself (a git repo). package.json is tracked here.
    expect(await isTracked('package.json')).toBe(true)
    expect(await isTracked('definitely-not-a-real-file.xyz')).toBe(false)
    // getSubmodulePaths reads this repo's .gitmodules (may be empty); it must
    // resolve to an array without throwing.
    expect(Array.isArray(await getSubmodulePaths())).toBe(true)
  })
})

describe('isTracked + isUntrackedNonSubmodulePath (real temp repo)', () => {
  it('tracks committed files, leaves junk untracked, guards submodule paths', async () => {
    await runWithTempDir(async tmpDir => {
      initRepo(tmpDir)
      await fs.writeFile(path.join(tmpDir, 'src.ts'), 'export const a = 1\n')
      spawnSync('git', ['add', 'src.ts'], { cwd: tmpDir })
      spawnSync('git', ['commit', '-m', 'init'], { cwd: tmpDir })
      // An untracked junk file.
      await fs.writeFile(path.join(tmpDir, '.DS_Store'), 'junk')
      // A declared (uninitialized) submodule + a stray file in its dir.
      await fs.writeFile(
        path.join(tmpDir, '.gitmodules'),
        '[submodule "vendor/sub"]\n\tpath = vendor/sub\n\turl = https://example.com/sub.git\n',
      )
      await fs.mkdir(path.join(tmpDir, 'vendor', 'sub'), { recursive: true })
      await fs.writeFile(path.join(tmpDir, 'vendor', 'sub', 'x.pyc'), 'x')

      expect(await isTracked('src.ts', { cwd: tmpDir })).toBe(true)
      expect(await isTracked('.DS_Store', { cwd: tmpDir })).toBe(false)

      const subs = await getSubmodulePaths({ cwd: tmpDir })
      expect(subs).toContain('vendor/sub')
      expect(await isInSubmodule('vendor/sub/x.pyc', { cwd: tmpDir })).toBe(
        true,
      )

      // The tracked file is NOT safe to delete.
      expect(await isUntrackedNonSubmodulePath('src.ts', { cwd: tmpDir })).toBe(
        false,
      )
      // The untracked junk file IS safe.
      expect(
        await isUntrackedNonSubmodulePath('.DS_Store', { cwd: tmpDir }),
      ).toBe(true)
      // The submodule-internal junk is NOT safe (belongs to the submodule).
      expect(
        await isUntrackedNonSubmodulePath('vendor/sub/x.pyc', { cwd: tmpDir }),
      ).toBe(false)
    }, 'git-tracked-test')
  })
})
