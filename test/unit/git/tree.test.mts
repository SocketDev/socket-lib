/**
 * @file Tests for git/tree — getTreeManifest. Runs against a temp repo: the
 *   manifest lists the committed paths, is deterministic per ref (the unmovable
 *   pin can't shift), changes when the tree changes, and rejects for an unknown
 *   ref.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { getTreeManifest } from '../../../src/git/tree'
import { spawnSync } from '../../../src/process/spawn/child'
import { runWithTempDir } from '../util/temp-file-helper'

function initRepo(dir: string): void {
  spawnSync('git', ['init'], { cwd: dir })
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: dir })
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir })
}

describe('getTreeManifest', () => {
  it('lists committed paths and is deterministic per ref', async () => {
    await runWithTempDir(async dir => {
      initRepo(dir)
      await fs.writeFile(path.join(dir, 'a.txt'), 'hello\n')
      await fs.mkdir(path.join(dir, 'sub'))
      await fs.writeFile(path.join(dir, 'sub', 'b.txt'), 'world\n')
      spawnSync('git', ['add', '-A'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
      const m1 = await getTreeManifest('HEAD', { cwd: dir })
      expect(m1).toContain('a.txt')
      expect(m1).toContain('sub/b.txt')
      // Same ref → byte-identical manifest (unmovable).
      expect(await getTreeManifest('HEAD', { cwd: dir })).toBe(m1)
    })
  })

  it('changes when the tree content changes (content-addressed)', async () => {
    await runWithTempDir(async dir => {
      initRepo(dir)
      await fs.writeFile(path.join(dir, 'a.txt'), 'one\n')
      spawnSync('git', ['add', '-A'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'first'], { cwd: dir })
      const first = await getTreeManifest('HEAD', { cwd: dir })
      await fs.writeFile(path.join(dir, 'a.txt'), 'two\n')
      spawnSync('git', ['commit', '-am', 'second'], { cwd: dir })
      expect(await getTreeManifest('HEAD', { cwd: dir })).not.toBe(first)
    })
  })

  it('rejects for an unknown ref (git exits non-zero → spawn rejects)', async () => {
    await runWithTempDir(async dir => {
      initRepo(dir)
      await fs.writeFile(path.join(dir, 'a.txt'), 'x\n')
      spawnSync('git', ['add', '-A'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
      await expect(
        getTreeManifest('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', {
          cwd: dir,
        }),
      ).rejects.toThrow()
    })
  })

  it('throws the empty-tree message for a present ref resolving to an empty tree', async () => {
    await runWithTempDir(async dir => {
      initRepo(dir)
      await fs.writeFile(path.join(dir, 'a.txt'), 'x\n')
      spawnSync('git', ['add', '-A'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
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
      initRepo(dir)
      await fs.writeFile(path.join(dir, 'café.txt'), 'accent\n')
      spawnSync('git', ['add', '-A'], { cwd: dir })
      spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
      const manifest = await getTreeManifest('HEAD', { cwd: dir })
      expect(manifest).toContain('café.txt')
      expect(manifest).not.toContain('\\303\\251')
    })
  })
})
