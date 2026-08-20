/**
 * @file Unit tests for src/git/isolated-index — withIsolatedIndex. Fixtures
 *   are real temp git repositories under os.tmpdir(): the defect this covers
 *   (a temp index that starts empty instead of a copy of HEAD) only
 *   reproduces against a real git process building a real commit tree, not a
 *   mock.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it, vi } from 'vitest'

import { withIsolatedIndex } from '../../../src/git/isolated-index.mjs'
import { spawnSync } from '../../../src/process/spawn/child.mjs'
import { runWithTempDir } from '../util/temp-file-helper.mjs'

// Real git spawns under CPU contention; match the sibling
// extended-real-ops.test.mts describe-scope timeout bump.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

function git(args: string[], cwd: string): string {
  const result = spawnSync('git', args, { cwd })
  return String(result.stdout)
}

async function initRepo(cwd: string): Promise<void> {
  git(['init'], cwd)
  git(['config', 'user.name', 'Test User'], cwd)
  git(['config', 'user.email', 'test@example.com'], cwd)
}

describe('withIsolatedIndex', () => {
  it('seeds the temp index from HEAD, so add + commit keeps every other tracked file', async () => {
    await runWithTempDir(async tmpDir => {
      await initRepo(tmpDir)

      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a', 'utf8')
      git(['add', '-A'], tmpDir)
      git(['commit', '-m', 'add a'], tmpDir)

      await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b', 'utf8')

      withIsolatedIndex(
        () => {
          git(['add', '--', 'b.txt'], tmpDir)
          git(['commit', '-m', 'add b'], tmpDir)
        },
        { cwd: tmpDir },
      )

      const tree = git(['ls-tree', '-r', '--name-only', 'HEAD'], tmpDir)
      const files = tree.split(/\r?\n/).filter(Boolean)
      // The defect: an empty temp index means the new commit's tree contains
      // ONLY b.txt — a.txt reads as deleted even though nothing removed it.
      expect(files).toContain('a.txt')
      expect(files).toContain('b.txt')
    }, 'git-isolated-index-seed-')
  })

  it('leaves the temp index empty on an unborn branch (no HEAD to copy)', async () => {
    await runWithTempDir(async tmpDir => {
      await initRepo(tmpDir)

      await fs.writeFile(path.join(tmpDir, 'first.txt'), 'first', 'utf8')

      expect(() => {
        withIsolatedIndex(
          () => {
            git(['add', '--', 'first.txt'], tmpDir)
            git(['commit', '-m', 'first commit'], tmpDir)
          },
          { cwd: tmpDir },
        )
      }).not.toThrow()

      const tree = git(['ls-tree', '-r', '--name-only', 'HEAD'], tmpDir)
      expect(tree.split(/\r?\n/).filter(Boolean)).toEqual(['first.txt'])
    }, 'git-isolated-index-unborn-')
  })

  it('restores the previous GIT_INDEX_FILE env var after running', async () => {
    await runWithTempDir(async tmpDir => {
      const prev = process.env['GIT_INDEX_FILE']
      try {
        process.env['GIT_INDEX_FILE'] = '/tmp/pre-existing-index'
        withIsolatedIndex(() => undefined, { cwd: tmpDir })
        expect(process.env['GIT_INDEX_FILE']).toBe('/tmp/pre-existing-index')
      } finally {
        if (prev === undefined) {
          delete process.env['GIT_INDEX_FILE']
        } else {
          process.env['GIT_INDEX_FILE'] = prev
        }
      }
    }, 'git-isolated-index-restore-')
  })
})
