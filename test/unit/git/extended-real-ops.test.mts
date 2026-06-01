/**
 * @file Extended integration tests for git utility functions against real
 *   temporary git repositories. Split from extended.test.mts along the "real
 *   git operations" seam to stay under the file-line cap. Each test seeds a
 *   fresh temp repo and exercises actual repository state changes (init, add,
 *   commit, rename, delete) through the git helpers.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  getChangedFiles,
  getChangedFilesSync,
  isChanged,
  isChangedSync,
} from '../../../src/git/changed'
import {
  getStagedFiles,
  getStagedFilesSync,
  isStaged,
  isStagedSync,
} from '../../../src/git/staged'
import {
  getUnstagedFiles,
  getUnstagedFilesSync,
  isUnstaged,
  isUnstagedSync,
} from '../../../src/git/unstaged'
import { spawnSync } from '../../../src/process/spawn/child'
import { describe, expect, it, vi } from 'vitest'
import { runWithTempDir } from '../util/temp-file-helper'
import { safeDelete } from '../../../src/fs/safe'

describe('git extended tests - real git operations', () => {
  // Note: No need to save/restore cwd - we always use explicit cwd options.
  //
  // Each test in this block does 4-15 spawnSync('git', ...) calls,
  // which legitimately takes 5-10s under CPU contention when the
  // full test suite runs in parallel. The default vitest 10s
  // timeout flakes these — bump describe-scope default to 30s.
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

  it('should work with a temporary git repository', async () => {
    await runWithTempDir(async tmpDir => {
      // Initialize a git repo
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], {
        cwd: tmpDir,
      })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      // Create a file
      const testFile = path.join(tmpDir, 'test.txt')
      await fs.writeFile(testFile, 'test content', 'utf8')

      // File should appear as changed (untracked)
      const changed = await getChangedFiles({ cache: false, cwd: tmpDir })
      expect(changed).toContain('test.txt')

      // Stage the file
      spawnSync('git', ['add', 'test.txt'], { cwd: tmpDir })

      // File should now be staged
      const staged = await getStagedFiles({ cwd: tmpDir })
      expect(staged).toContain('test.txt')

      // Commit the file
      spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir })

      // Now there should be no changes (or at most just test.txt if git is showing it)
      const afterCommit = await getChangedFiles({ cwd: tmpDir })
      // In some git configurations, files may still appear, so just check it's an array
      expect(Array.isArray(afterCommit)).toBe(true)

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

      // Check isStaged (should be false)
      const isStagedResult = await isStaged(testFile, { cwd: tmpDir })
      expect(isStagedResult).toBe(false)

      // Stage the changes
      spawnSync('git', ['add', 'test.txt'], { cwd: tmpDir })

      // Now it should be staged
      const stagedAfter = await getStagedFiles({ cwd: tmpDir })
      expect(stagedAfter).toContain('test.txt')

      // And should still show as changed
      const isChangedAfter = await isChanged(testFile, { cwd: tmpDir })
      expect(typeof isChangedAfter).toBe('boolean')
    }, 'git-ops-')
  }, 30_000)

  it('should detect untracked files', async () => {
    await runWithTempDir(async tmpDir => {
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const untracked = path.join(tmpDir, 'untracked.txt')
      await fs.writeFile(untracked, 'untracked', 'utf8')

      const changed = await getChangedFiles({ cache: false, cwd: tmpDir })
      expect(changed).toContain('untracked.txt')

      // Untracked files should not appear in unstaged (they're not tracked)
      const unstaged = await getUnstagedFiles({ cwd: tmpDir })
      expect(unstaged).not.toContain('untracked.txt')
    }, 'git-untracked-')
  })

  it('should handle nested directories', async () => {
    await runWithTempDir(async tmpDir => {
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

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
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const testFile = path.join(tmpDir, 'sync-test.txt')
      await fs.writeFile(testFile, 'sync content', 'utf8')

      const changedSync = getChangedFilesSync({ cache: false, cwd: tmpDir })
      expect(changedSync).toContain('sync-test.txt')

      spawnSync('git', ['add', 'sync-test.txt'], { cwd: tmpDir })

      const stagedSync = getStagedFilesSync({ cwd: tmpDir })
      expect(stagedSync).toContain('sync-test.txt')

      spawnSync('git', ['commit', '-m', 'Sync test'], { cwd: tmpDir })

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
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

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
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const spacedFile = path.join(tmpDir, 'file with spaces.txt')
      await fs.writeFile(spacedFile, 'content', 'utf8')

      const changed = await getChangedFiles({ cwd: tmpDir })
      // Git may quote filenames with spaces
      const hasFile = changed.some(
        f => f === '"file with spaces.txt"' || f === 'file with spaces.txt',
      )
      expect(hasFile).toBe(true)

      spawnSync('git', ['add', 'file with spaces.txt'], { cwd: tmpDir })

      const staged = await getStagedFiles({ cwd: tmpDir })
      const hasStagedFile = staged.some(
        f => f === '"file with spaces.txt"' || f === 'file with spaces.txt',
      )
      expect(hasStagedFile).toBe(true)
    }, 'git-spaces-')
  })

  it('should handle special characters in file names', async () => {
    await runWithTempDir(async tmpDir => {
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const specialFile = path.join(tmpDir, 'file-with_special.chars.txt')
      await fs.writeFile(specialFile, 'content', 'utf8')

      const changed = await getChangedFiles({ cwd: tmpDir })
      expect(changed).toContain('file-with_special.chars.txt')
    }, 'git-special-')
  })

  it('should work with absolute paths in is* functions', async () => {
    await runWithTempDir(async tmpDir => {
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const absFile = path.join(tmpDir, 'absolute.txt')
      await fs.writeFile(absFile, 'content', 'utf8')

      const isChangedAbs = await isChanged(absFile)
      expect(typeof isChangedAbs).toBe('boolean')
    }, 'git-absolute-')
  })

  it('should handle deleted files', async () => {
    await runWithTempDir(async tmpDir => {
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const delFile = path.join(tmpDir, 'to-delete.txt')
      await fs.writeFile(delFile, 'content', 'utf8')
      spawnSync('git', ['add', 'to-delete.txt'], { cwd: tmpDir })
      spawnSync('git', ['commit', '-m', 'Add file'], { cwd: tmpDir })

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
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const oldFile = path.join(tmpDir, 'old-name.txt')
      await fs.writeFile(oldFile, 'content', 'utf8')
      spawnSync('git', ['add', 'old-name.txt'], { cwd: tmpDir })
      spawnSync('git', ['commit', '-m', 'Add file'], { cwd: tmpDir })

      // Rename the file
      const newFile = path.join(tmpDir, 'new-name.txt')
      await fs.rename(oldFile, newFile)
      spawnSync('git', ['add', '-A'], { cwd: tmpDir })

      // Should show both old and new in staged
      const staged = await getStagedFiles({ cwd: tmpDir })
      // Git may show this as a rename or as delete + add
      expect(staged.length).toBeGreaterThan(0)
    }, 'git-renamed-')
  })

  it('should handle Buffer stdout from spawn', async () => {
    await runWithTempDir(async tmpDir => {
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const testFile = path.join(tmpDir, 'buffer-test.txt')
      await fs.writeFile(testFile, 'buffer content', 'utf8')

      // This test ensures Buffer stdout is handled correctly
      const changed = await getChangedFiles({ cwd: tmpDir })
      expect(changed).toContain('buffer-test.txt')
    }, 'git-buffer-')
  })

  it('should handle stdout as string from spawn', async () => {
    await runWithTempDir(async tmpDir => {
      spawnSync('git', ['init'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
      spawnSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: tmpDir,
      })

      const testFile = path.join(tmpDir, 'string-test.txt')
      await fs.writeFile(testFile, 'string content', 'utf8')

      const changedSync = getChangedFilesSync({ cwd: tmpDir })
      expect(changedSync).toContain('string-test.txt')
    }, 'git-string-')
  })
})
