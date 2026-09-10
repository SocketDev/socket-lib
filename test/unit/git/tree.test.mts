/**
 * @file Tests for git/tree — getTreeManifest. Runs against a temp repo: the
 *   manifest lists the committed paths, is deterministic per ref (the unmovable
 *   pin can't shift), changes when the tree changes, and rejects for an unknown
 *   ref.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getTreeManifest } from '../../../src/git/tree.mjs'
import {
  makeFixtureHandle,
  makeGitRepo,
  snapshotRepo,
} from '../../fleet/_shared/lib/git-fixture.mts'
import { runWithTempDir } from '../util/temp-files.mjs'

import type { GitRepoFixture } from '../../fleet/_shared/lib/git-fixture.mts'

let seed: GitRepoFixture

function copyGitSeed(dir: string): GitRepoFixture {
  snapshotRepo({ dir: seed.dir, into: dir })
  return makeFixtureHandle({ dir, env: seed.env, root: dir })
}

describe('getTreeManifest', () => {
  beforeAll(() => {
    seed = makeGitRepo({ prefix: 'git-tree-seed-' })
    seed.writeFile('alpha.txt', 'one\n')
    seed.writeFile('sub/beta.txt', 'world\n')
    seed.writeFile('café.txt', 'accent\n')
    seed.git('add', '-A')
    seed.git('commit', '-m', 'seed')
  })
  afterAll(() => seed?.cleanup())

  it('lists committed paths and is deterministic per ref', async () => {
    await runWithTempDir(async dir => {
      copyGitSeed(dir)
      const m1 = await getTreeManifest('HEAD', { cwd: dir })
      expect(m1).toContain('alpha.txt')
      expect(m1).toContain('sub/beta.txt')
      // Same ref → byte-identical manifest (unmovable).
      expect(await getTreeManifest('HEAD', { cwd: dir })).toBe(m1)
    })
  })

  it('changes when the tree content changes (content-addressed)', async () => {
    await runWithTempDir(async dir => {
      const fixture = copyGitSeed(dir)
      const first = await getTreeManifest('HEAD', { cwd: dir })
      await fs.writeFile(path.join(dir, 'alpha.txt'), 'two\n')
      fixture.git('commit', '-am', 'second')
      expect(await getTreeManifest('HEAD', { cwd: dir })).not.toBe(first)
    })
  })

  it('rejects for an unknown ref (git exits non-zero → spawn rejects)', async () => {
    await runWithTempDir(async dir => {
      copyGitSeed(dir)
      await expect(
        getTreeManifest('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', {
          cwd: dir,
        }),
      ).rejects.toThrow()
    })
  })

  it('throws the empty-tree message for a present ref resolving to an empty tree', async () => {
    await runWithTempDir(async dir => {
      copyGitSeed(dir)
      // The well-known empty-tree object is present in every repo and exits 0
      // with zero output — the ONLY input that reaches the custom throw (an
      // unknown ref exits non-zero and rejects in spawn before it).
      await expect(
        getTreeManifest('4b825dc642cb6eb9a060e54bf8d69288fbee4904', {
          cwd: dir,
        }),
      ).rejects.toThrow(/empty tree/)
    })
  })

  it('emits a non-ASCII path verbatim (config-independent, not \\NNN-escaped)', async () => {
    await runWithTempDir(async dir => {
      copyGitSeed(dir)
      const manifest = await getTreeManifest('HEAD', { cwd: dir })
      expect(manifest).toContain('café.txt')
      expect(manifest).not.toContain('\\303\\251')
    })
  })
})
