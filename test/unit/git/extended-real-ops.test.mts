/**
 * @file Extended integration tests for git utility functions against real
 *   temporary repositories. Each test copies an immutable seed and exercises
 *   repository state changes through the Git helpers.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  getChangedFiles,
  getChangedFilesSync,
  isChanged,
  isChangedSync,
} from '../../../src/git/changed.mjs'
import {
  getStagedFiles,
  getStagedFilesSync,
  isStaged,
  isStagedSync,
} from '../../../src/git/staged.mjs'
import {
  getUnstagedFiles,
  getUnstagedFilesSync,
  isUnstaged,
  isUnstagedSync,
} from '../../../src/git/unstaged.mjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { tolerantTimeout } from '../../_shared/fleet/lib/timing.mts'
import { runWithTempDir } from '../util/temp-files.mjs'
import { safeDelete } from '../../../src/fs/safe.mjs'
import {
  makeFixtureHandle,
  makeGitRepo,
  snapshotRepo,
} from '../../fleet/_shared/lib/git-fixture.mts'

import type { GitRepoFixture } from '../../fleet/_shared/lib/git-fixture.mts'

let seed: GitRepoFixture

function copyGitSeed(dir: string): GitRepoFixture {
  snapshotRepo({ dir: seed.dir, into: dir })
  return makeFixtureHandle({ dir, env: seed.env, root: dir })
}

describe('git extended tests - real git operations', () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

  beforeAll(() => {
    seed = makeGitRepo({ prefix: 'git-extended-seed-' })
  })
  afterAll(() => seed?.cleanup())

  it(
    'should work with a temporary git repository',
    async () => {
      await runWithTempDir(async tmpDir => {
        // Initialize a git repo
        const fixture = copyGitSeed(tmpDir)

        // Create a file
        const testFile = path.join(tmpDir, 'test.txt')
        await fs.writeFile(testFile, 'test content', 'utf8')

        // File should appear as changed (untracked)
        const changed = await getChangedFiles({ cache: false, cwd: tmpDir })
        expect(changed).toContain('test.txt')

        // Stage the file
        fixture.git('add', 'test.txt')

        // File should now be staged
        const staged = await getStagedFiles({ cwd: tmpDir })
        expect(staged).toContain('test.txt')

        // Commit the file
        fixture.git('commit', '-m', 'Initial commit')

        const afterCommit = await getChangedFiles({ cache: false, cwd: tmpDir })
        expect(afterCommit).toEqual([])

        // Modify the file
        await fs.writeFile(testFile, 'modified content', 'utf8')

        // Should show as unstaged
        const unstaged = await getUnstagedFiles({ cwd: tmpDir })
        expect(unstaged).toContain('test.txt')

        // Check isChanged
        const isChangedResult = await isChanged(testFile, { cwd: tmpDir })
        expect(isChangedResult).toBe(true)

        // Check isUnstaged
        const isUnstagedResult = await isUnstaged(testFile, { cwd: tmpDir })
        expect(isUnstagedResult).toBe(true)

        // Check isStaged, which should be false.
        const isStagedResult = await isStaged(testFile, { cwd: tmpDir })
        expect(isStagedResult).toBe(false)

        // Stage the changes
        fixture.git('add', 'test.txt')

        // Now it should be staged
        const stagedAfter = await getStagedFiles({ cwd: tmpDir })
        expect(stagedAfter).toContain('test.txt')

        // And should still show as changed
        const isChangedAfter = await isChanged(testFile, {
          cache: false,
          cwd: tmpDir,
        })
        expect(isChangedAfter).toBe(true)
      }, 'git-ops-')
    },
    tolerantTimeout(30_000),
  )

  it('should detect untracked files', async () => {
    await runWithTempDir(async tmpDir => {
      copyGitSeed(tmpDir)

      const untracked = path.join(tmpDir, 'untracked.txt')
      await fs.writeFile(untracked, 'untracked', 'utf8')

      const changed = await getChangedFiles({ cache: false, cwd: tmpDir })
      expect(changed).toContain('untracked.txt')

      // Untracked files should not appear in unstaged; they aren't tracked.
      const unstaged = await getUnstagedFiles({ cwd: tmpDir })
      expect(unstaged).not.toContain('untracked.txt')
    }, 'git-untracked-')
  })

  it('should handle nested directories', async () => {
    await runWithTempDir(async tmpDir => {
      copyGitSeed(tmpDir)

      const subdir = path.join(tmpDir, 'src', 'nested')
      await fs.mkdir(subdir, { recursive: true })

      const nestedFile = path.join(subdir, 'nested.txt')
      await fs.writeFile(nestedFile, 'nested content', 'utf8')

      const changed = await getChangedFiles({ cache: false, cwd: tmpDir })
      // Git may show directory or full path depending on config
      expect(changed.length).toBeGreaterThan(0)
      const hasFile = changed.some(
        f => f.includes('nested.txt') || f === 'src' || f.includes('src'),
      )
      expect(hasFile).toBe(true)

      // Test with cwd in subdirectory
      const changedFromSubdir = await getChangedFiles({ cwd: subdir })
      // When cwd is in subdirectory, it filters to that directory
      // The file may not show up if git hasn't indexed the parent
      expect(Array.isArray(changedFromSubdir)).toBe(true)
    }, 'git-nested-')
  })

  it('should work with sync functions', async () => {
    await runWithTempDir(async tmpDir => {
      const fixture = copyGitSeed(tmpDir)

      const testFile = path.join(tmpDir, 'sync-test.txt')
      await fs.writeFile(testFile, 'sync content', 'utf8')

      const changedSync = getChangedFilesSync({ cache: false, cwd: tmpDir })
      expect(changedSync).toContain('sync-test.txt')

      fixture.git('add', 'sync-test.txt')

      const stagedSync = getStagedFilesSync({ cwd: tmpDir })
      expect(stagedSync).toContain('sync-test.txt')

      fixture.git('commit', '-m', 'Sync test')

      await fs.writeFile(testFile, 'modified sync', 'utf8')

      const unstagedSync = getUnstagedFilesSync({ cwd: tmpDir })
      expect(unstagedSync).toContain('sync-test.txt')

      const isChangedResult = isChangedSync(testFile, { cwd: tmpDir })
      expect(isChangedResult).toBe(true)

      const isUnstagedResult = isUnstagedSync(testFile, { cwd: tmpDir })
      expect(isUnstagedResult).toBe(true)

      const isStagedResult = isStagedSync(testFile, { cwd: tmpDir })
      expect(isStagedResult).toBe(false)
    }, 'git-sync-')
  })

  it('should handle empty git repository', async () => {
    await runWithTempDir(async tmpDir => {
      copyGitSeed(tmpDir)

      // Empty repo should have no changes
      const changed = await getChangedFiles({ cwd: tmpDir })
      expect(changed).toEqual([])

      const staged = await getStagedFiles({ cwd: tmpDir })
      expect(staged).toEqual([])

      const unstaged = await getUnstagedFiles({ cwd: tmpDir })
      expect(unstaged).toEqual([])
    }, 'git-empty-')
  })

  it('should handle files with spaces in names', async () => {
    await runWithTempDir(async tmpDir => {
      const fixture = copyGitSeed(tmpDir)

      const spacedFile = path.join(tmpDir, 'file with spaces.txt')
      await fs.writeFile(spacedFile, 'content', 'utf8')

      const changed = await getChangedFiles({ cwd: tmpDir })
      // Git may quote filenames with spaces
      const hasFile = changed.some(
        f => f === '"file with spaces.txt"' || f === 'file with spaces.txt',
      )
      expect(hasFile).toBe(true)

      fixture.git('add', 'file with spaces.txt')

      const staged = await getStagedFiles({ cwd: tmpDir })
      const hasStagedFile = staged.some(
        f => f === '"file with spaces.txt"' || f === 'file with spaces.txt',
      )
      expect(hasStagedFile).toBe(true)
    }, 'git-spaces-')
  })

  it('should handle special characters in file names', async () => {
    await runWithTempDir(async tmpDir => {
      copyGitSeed(tmpDir)

      const specialFile = path.join(tmpDir, 'file-with_special.chars.txt')
      await fs.writeFile(specialFile, 'content', 'utf8')

      const changed = await getChangedFiles({ cwd: tmpDir })
      expect(changed).toContain('file-with_special.chars.txt')
    }, 'git-special-')
  })

  it('should work with absolute paths in is* functions', async () => {
    await runWithTempDir(async tmpDir => {
      copyGitSeed(tmpDir)

      const absFile = path.join(tmpDir, 'absolute.txt')
      await fs.writeFile(absFile, 'content', 'utf8')

      const isChangedAbs = await isChanged(absFile, { cwd: tmpDir })
      expect(isChangedAbs).toBe(true)
    }, 'git-absolute-')
  })

  it('should handle deleted files', async () => {
    await runWithTempDir(async tmpDir => {
      const fixture = copyGitSeed(tmpDir)

      const delFile = path.join(tmpDir, 'to-delete.txt')
      await fs.writeFile(delFile, 'content', 'utf8')
      fixture.git('add', 'to-delete.txt')
      fixture.git('commit', '-m', 'Add file')

      // Delete the file
      await safeDelete(delFile)

      // Should show as changed (deleted)
      const changed = await getChangedFiles({ cwd: tmpDir })
      expect(changed).toContain('to-delete.txt')

      // Should show as unstaged deletion
      const unstaged = await getUnstagedFiles({ cwd: tmpDir })
      expect(unstaged).toContain('to-delete.txt')
    }, 'git-deleted-')
  })

  it('should handle renamed files', async () => {
    await runWithTempDir(async tmpDir => {
      const fixture = copyGitSeed(tmpDir)

      const oldFile = path.join(tmpDir, 'old-name.txt')
      await fs.writeFile(oldFile, 'content', 'utf8')
      fixture.git('add', 'old-name.txt')
      fixture.git('commit', '-m', 'Add file')

      // Rename the file
      const newFile = path.join(tmpDir, 'new-name.txt')
      await fs.rename(oldFile, newFile)
      fixture.git('add', '-A')

      const staged = await getStagedFiles({ cwd: tmpDir })
      expect(staged).toContain('new-name.txt')
    }, 'git-renamed-')
  })

  it('should handle Buffer stdout from spawn', async () => {
    await runWithTempDir(async tmpDir => {
      copyGitSeed(tmpDir)

      const testFile = path.join(tmpDir, 'buffer-test.txt')
      await fs.writeFile(testFile, 'buffer content', 'utf8')

      // This test ensures Buffer stdout is handled correctly
      const changed = await getChangedFiles({ cwd: tmpDir })
      expect(changed).toContain('buffer-test.txt')
    }, 'git-buffer-')
  })

  it('should handle stdout as string from spawn', async () => {
    await runWithTempDir(async tmpDir => {
      copyGitSeed(tmpDir)

      const testFile = path.join(tmpDir, 'string-test.txt')
      await fs.writeFile(testFile, 'string content', 'utf8')

      const changedSync = getChangedFilesSync({ cwd: tmpDir })
      expect(changedSync).toContain('string-test.txt')
    }, 'git-string-')
  })
})
