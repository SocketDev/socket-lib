/**
 * @file Tests for git/ignored — getTrackedIgnoredFiles. Runs against a fresh
 *   temp repo: a tracked file that a later-added .gitignore rule ignores is the
 *   bug the probe surfaces; a re-include negation clears it; a clean tree and a
 *   non-repo dir both return [].
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { getTrackedIgnoredFiles } from '../../../src/git/ignored'
import { spawnSync } from '../../../src/process/spawn/child'
import { runWithTempDir } from '../util/temp-file-helper'

function initRepo(dir: string): void {
  spawnSync('git', ['init'], { cwd: dir })
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: dir })
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir })
}

describe('getTrackedIgnoredFiles', () => {
  it('returns [] for a clean repo (nothing tracked-ignored)', async () => {
    await runWithTempDir(async dir => {
      initRepo(dir)
      await fs.writeFile(path.join(dir, 'a.txt'), 'hi\n')
      spawnSync('git', ['add', 'a.txt'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
      expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual([])
    })
  })

  it('surfaces a tracked file a later .gitignore rule ignores', async () => {
    await runWithTempDir(async dir => {
      initRepo(dir)
      await fs.mkdir(path.join(dir, 'dist'))
      await fs.writeFile(path.join(dir, 'dist', 'bundle.js'), '//x\n')
      await fs.writeFile(path.join(dir, 'keep.ts'), 'export {}\n')
      spawnSync('git', ['add', '-A'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
      // dist/ is now ignored, but dist/bundle.js is already tracked = the bug.
      await fs.writeFile(path.join(dir, '.gitignore'), 'dist/\n')
      spawnSync('git', ['add', '.gitignore'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'ignore dist'], { cwd: dir })
      expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual([
        'dist/bundle.js',
      ])
    })
  })

  it('honors a `!` re-include (an un-ignored tracked file is not reported)', async () => {
    await runWithTempDir(async dir => {
      initRepo(dir)
      await fs.writeFile(path.join(dir, 'important.tmp'), 'keep me\n')
      spawnSync('git', ['add', '-A'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
      await fs.writeFile(
        path.join(dir, '.gitignore'),
        '*.tmp\n!important.tmp\n',
      )
      spawnSync('git', ['add', '.gitignore'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'ignore tmp but keep important'], {
        cwd: dir,
      })
      expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual([])
    })
  })

  it('returns [] when git is unavailable (non-repo dir)', async () => {
    await runWithTempDir(async dir => {
      expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual([])
    })
  })

  it('returns a non-ASCII tracked-ignored path verbatim (not \\NNN-escaped)', async () => {
    await runWithTempDir(async dir => {
      initRepo(dir)
      await fs.mkdir(path.join(dir, 'dist'))
      await fs.writeFile(path.join(dir, 'dist', 'café.js'), '//x\n')
      spawnSync('git', ['add', '-A'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
      await fs.writeFile(path.join(dir, '.gitignore'), 'dist/\n')
      spawnSync('git', ['add', '.gitignore'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'ignore dist'], { cwd: dir })
      // Without `-z`, git would return the escaped `"dist/caf\303\251.js"`.
      expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual([
        'dist/café.js',
      ])
    })
  })
})
