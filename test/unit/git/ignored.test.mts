/**
 * @file Tests for git/ignored — getTrackedIgnoredFiles. Runs against a fresh
 *   temp repo: a tracked file that a later-added .gitignore rule ignores is the
 *   bug the probe surfaces; a re-include negation clears it; a clean tree and a
 *   non-repo dir both return [].
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getTrackedIgnoredFiles } from '../../../src/git/ignored.mjs'
import {
  makeFixtureHandle,
  makeGitRepo,
  snapshotRepo,
} from '../fixture/git.mts'
import { runWithTempDir } from '../util/temp-files.mjs'

import type { GitRepoFixture } from '../fixture/git.mts'

let seed: GitRepoFixture

function copyGitSeed(dir: string): GitRepoFixture {
  snapshotRepo({ dir: seed.dir, into: dir })
  return makeFixtureHandle({ dir, env: seed.env, root: dir })
}

describe('getTrackedIgnoredFiles', () => {
  beforeAll(() => {
    seed = makeGitRepo({ prefix: 'git-ignored-seed-' })
  })
  afterAll(() => seed?.cleanup())

  it('returns [] for a clean repo (nothing tracked-ignored)', async () => {
    await runWithTempDir(async dir => {
      const fixture = copyGitSeed(dir)
      await fs.writeFile(path.join(dir, 'alpha.txt'), 'hi\n')
      fixture.git('add', 'alpha.txt')
      fixture.git('commit', '-m', 'seed')
      expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual([])
    })
  })

  it('surfaces a tracked file a later .gitignore rule ignores', async () => {
    await runWithTempDir(async dir => {
      const fixture = copyGitSeed(dir)
      await fs.mkdir(path.join(dir, 'dist'))
      await fs.writeFile(path.join(dir, 'dist', 'bundle.js'), '//x\n')
      await fs.writeFile(path.join(dir, 'keep.ts'), 'export {}\n')
      fixture.git('add', '-A')
      fixture.git('commit', '-m', 'seed')
      // dist/ is now ignored, but dist/bundle.js is already tracked = the bug.
      await fs.writeFile(path.join(dir, '.gitignore'), 'dist/\n')
      expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual([
        'dist/bundle.js',
      ])
    })
  })

  it('honors a `!` re-include (an un-ignored tracked file is not reported)', async () => {
    await runWithTempDir(async dir => {
      const fixture = copyGitSeed(dir)
      await fs.writeFile(path.join(dir, 'important.tmp'), 'keep me\n')
      fixture.git('add', '-A')
      fixture.git('commit', '-m', 'seed')
      await fs.writeFile(
        path.join(dir, '.gitignore'),
        '*.tmp\n!important.tmp\n',
      )
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
      const fixture = copyGitSeed(dir)
      await fs.mkdir(path.join(dir, 'dist'))
      await fs.writeFile(path.join(dir, 'dist', 'café.js'), '//x\n')
      fixture.git('add', '-A')
      fixture.git('commit', '-m', 'seed')
      await fs.writeFile(path.join(dir, '.gitignore'), 'dist/\n')
      // Without `-z`, git would return the escaped `"dist/caf\303\251.js"`.
      expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual([
        'dist/café.js',
      ])
    })
  })
})
