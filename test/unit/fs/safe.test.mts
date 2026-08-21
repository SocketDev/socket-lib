/**
 * @file Unit tests for src/fs/safe — safeDelete/Sync and safeMkdir/Sync. Split
 *   out of the historical monolithic test/unit/fs.test.mts to keep each test
 *   file under the fleet's 500-line soft cap.
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  safeDelete,
  safeDeleteSync,
  safeMkdir,
  safeMkdirSync,
} from '../../../src/fs/safe.mjs'

import { runWithTempDir } from '../util/temp-file-helper.mjs'

// Helper that owns the `prefer-exists-sync` exemption once instead of
// repeating it at every fs.stat() call — these tests verify the stat
// output (isDirectory), not just existence.
async function inspectDirStats(p: string) {
  // Verifies stats.isDirectory(), not existence.
  // oxlint-disable-next-line socket/prefer-exists-sync -- verifies stat output
  return fs.stat(p)
}

describe('safeDelete', () => {
  it('should delete files in temp directory', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'delete-me.txt')
      await fs.writeFile(testFile, '', 'utf8')

      await safeDelete(testFile)

      const exists = existsSync(testFile)
      expect(exists).toBe(false)
    }, 'safeDelete-file-')
  })

  it('should delete directories recursively in temp directory', async () => {
    await runWithTempDir(async tmpDir => {
      const testDir = path.join(tmpDir, 'delete-dir')
      await fs.mkdir(testDir, { recursive: true })
      await fs.writeFile(path.join(testDir, 'file.txt'), '', 'utf8')

      await safeDelete(testDir)

      const exists = existsSync(testDir)
      expect(exists).toBe(false)
    }, 'safeDelete-dir-')
  })

  it('should delete multiple files', async () => {
    await runWithTempDir(async tmpDir => {
      const file1 = path.join(tmpDir, 'file1.txt')
      const file2 = path.join(tmpDir, 'file2.txt')
      await fs.writeFile(file1, '', 'utf8')
      await fs.writeFile(file2, '', 'utf8')

      await safeDelete([file1, file2])

      const exists1 = existsSync(file1)
      const exists2 = existsSync(file2)
      expect(exists1).toBe(false)
      expect(exists2).toBe(false)
    }, 'safeDelete-multiple-')
  })

  it('should not throw for non-existent files', async () => {
    await expect(safeDelete('/nonexistent/file.txt')).resolves.toBeUndefined()
  })

  it('should respect force option', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      // The flag is this test's subject.
      // oxlint-disable-next-line socket/no-force-delete -- the subject
      await safeDelete(testFile, { force: true })

      const exists = existsSync(testFile)
      expect(exists).toBe(false)
    }, 'safeDelete-force-')
  })

  it('should respect maxRetries and retryDelay options', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      // Delete with explicit retry options; it should succeed on first attempt
      await safeDelete(testFile, { maxRetries: 2, retryDelay: 50 })

      const exists = existsSync(testFile)
      expect(exists).toBe(false)
    }, 'safeDelete-retry-')
  })
})

describe('safeDeleteSync', () => {
  it('should delete files in temp directory', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'delete-me.txt')
      await fs.writeFile(testFile, '', 'utf8')

      safeDeleteSync(testFile)

      const exists = existsSync(testFile)
      expect(exists).toBe(false)
    }, 'safeDeleteSync-file-')
  })

  it('should delete directories recursively in temp directory', async () => {
    await runWithTempDir(async tmpDir => {
      const testDir = path.join(tmpDir, 'delete-dir')
      await fs.mkdir(testDir, { recursive: true })
      await fs.writeFile(path.join(testDir, 'file.txt'), '', 'utf8')

      safeDeleteSync(testDir)

      const exists = existsSync(testDir)
      expect(exists).toBe(false)
    }, 'safeDeleteSync-dir-')
  })

  it('should delete multiple files', async () => {
    await runWithTempDir(async tmpDir => {
      const file1 = path.join(tmpDir, 'file1.txt')
      const file2 = path.join(tmpDir, 'file2.txt')
      await fs.writeFile(file1, '', 'utf8')
      await fs.writeFile(file2, '', 'utf8')

      safeDeleteSync([file1, file2])

      const exists1 = existsSync(file1)
      const exists2 = existsSync(file2)
      expect(exists1).toBe(false)
      expect(exists2).toBe(false)
    }, 'safeDeleteSync-multiple-')
  })

  it('should not throw for non-existent files', () => {
    expect(() => safeDeleteSync('/nonexistent/file.txt')).not.toThrow()
  })

  it('should respect maxRetries and retryDelay options', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      // Delete with explicit retry options; it should succeed on first attempt
      safeDeleteSync(testFile, { maxRetries: 2, retryDelay: 50 })

      const exists = existsSync(testFile)
      expect(exists).toBe(false)
    }, 'safeDeleteSync-retry-')
  })
})

describe('safeMkdir', () => {
  it('should create a single directory', async () => {
    await runWithTempDir(async tmpDir => {
      const newDir = path.join(tmpDir, 'test-dir')
      await safeMkdir(newDir)

      const stats = await inspectDirStats(newDir)
      expect(stats.isDirectory()).toBe(true)
    }, 'safeMkdir-single-')
  })

  it('should create nested directories by default (recursive: true)', async () => {
    await runWithTempDir(async tmpDir => {
      const nestedDir = path.join(tmpDir, 'level1', 'level2', 'level3')
      await safeMkdir(nestedDir)

      const stats = await inspectDirStats(nestedDir)
      expect(stats.isDirectory()).toBe(true)
    }, 'safeMkdir-nested-')
  })

  it('should not throw when directory already exists', async () => {
    await runWithTempDir(async tmpDir => {
      const newDir = path.join(tmpDir, 'existing')
      await fs.mkdir(newDir)

      await expect(safeMkdir(newDir)).resolves.toBeUndefined()

      const stats = await inspectDirStats(newDir)
      expect(stats.isDirectory()).toBe(true)
    }, 'safeMkdir-exists-')
  })

  it('should respect recursive: false option', async () => {
    await runWithTempDir(async tmpDir => {
      const nestedDir = path.join(tmpDir, 'level1', 'level2')

      await expect(safeMkdir(nestedDir, { recursive: false })).rejects.toThrow()
    }, 'safeMkdir-no-recursive-')
  })

  it('should create directory with custom mode', async () => {
    await runWithTempDir(async tmpDir => {
      const newDir = path.join(tmpDir, 'custom-mode')
      await safeMkdir(newDir, { mode: 0o755 })

      const stats = await inspectDirStats(newDir)
      expect(stats.isDirectory()).toBe(true)
    }, 'safeMkdir-mode-')
  })

  it('should throw on permission denied', async () => {
    // Test skipped on Windows as permission handling differs
    if (process.platform === 'win32') {
      return
    }

    await runWithTempDir(async tmpDir => {
      const readonlyDir = path.join(tmpDir, 'readonly')
      await fs.mkdir(readonlyDir, { mode: 0o444 })

      const newDir = path.join(readonlyDir, 'should-fail')
      await expect(safeMkdir(newDir)).rejects.toThrow()
    }, 'safeMkdir-permission-')
  })
})

describe('safeMkdirSync', () => {
  it('should create a single directory', async () => {
    await runWithTempDir(async tmpDir => {
      const newDir = path.join(tmpDir, 'test-dir')
      safeMkdirSync(newDir)

      const stats = await inspectDirStats(newDir)
      expect(stats.isDirectory()).toBe(true)
    }, 'safeMkdirSync-single-')
  })

  it('should create nested directories by default (recursive: true)', async () => {
    await runWithTempDir(async tmpDir => {
      const nestedDir = path.join(tmpDir, 'level1', 'level2', 'level3')
      safeMkdirSync(nestedDir)

      const stats = await inspectDirStats(nestedDir)
      expect(stats.isDirectory()).toBe(true)
    }, 'safeMkdirSync-nested-')
  })

  it('should not throw when directory already exists', async () => {
    await runWithTempDir(async tmpDir => {
      const newDir = path.join(tmpDir, 'existing')
      await fs.mkdir(newDir)

      expect(() => safeMkdirSync(newDir)).not.toThrow()

      const stats = await inspectDirStats(newDir)
      expect(stats.isDirectory()).toBe(true)
    }, 'safeMkdirSync-exists-')
  })

  it('should respect recursive: false option', async () => {
    await runWithTempDir(async tmpDir => {
      const nestedDir = path.join(tmpDir, 'level1', 'level2')

      expect(() => safeMkdirSync(nestedDir, { recursive: false })).toThrow()
    }, 'safeMkdirSync-no-recursive-')
  })

  it('should create directory with custom mode', async () => {
    await runWithTempDir(async tmpDir => {
      const newDir = path.join(tmpDir, 'custom-mode')
      safeMkdirSync(newDir, { mode: 0o755 })

      const stats = await inspectDirStats(newDir)
      expect(stats.isDirectory()).toBe(true)
    }, 'safeMkdirSync-mode-')
  })

  it('should throw on permission denied', async () => {
    // Test skipped on Windows as permission handling differs
    if (process.platform === 'win32') {
      return
    }

    await runWithTempDir(async tmpDir => {
      const readonlyDir = path.join(tmpDir, 'readonly')
      await fs.mkdir(readonlyDir, { mode: 0o444 })

      const newDir = path.join(readonlyDir, 'should-fail')
      expect(() => safeMkdirSync(newDir)).toThrow()
    }, 'safeMkdirSync-permission-')
  })
})

describe('safeDelete force is opt-in', () => {
  // Regression: `force` defaulted to true, which disabled del's cwd guard for
  // every caller that passed no options, so `safeDelete(pathOutsideCwd)` deleted
  // it without a word. Measured against a real checkout, which it removed.
  //
  // The target is a NON-EXISTENT sibling of cwd on purpose. The guard decides on
  // path shape before touching the filesystem, so the assertion needs no real
  // tree - and a regression here cannot destroy one. `process.chdir` is
  // unavailable in a vitest worker, so cwd stays put and the path moves instead.
  // A REAL directory outside cwd, created here and cleaned up here. del does
  // not throw for a path that does not exist, so the guard can only be observed
  // against a tree that is actually there. `process.chdir` is unavailable in a
  // vitest worker, so cwd stays put and the target sits beside it. If the guard
  // ever regresses, the only casualty is this directory.
  const outsideCwd = path.join(
    process.cwd(),
    '..',
    `safe-delete-guard-probe-${process.pid}`,
  )

  beforeEach(async () => {
    await fs.mkdir(path.join(outsideCwd, 'child'), { recursive: true })
    await fs.writeFile(path.join(outsideCwd, 'precious.txt'), 'keep')
  })

  afterEach(async () => {
    // The probe sits outside cwd on purpose, so removing it needs the flag.
    // oxlint-disable-next-line socket/no-force-delete -- probe is outside cwd
    await safeDelete(outsideCwd, { force: true })
  })

  it('rejects a path outside cwd when no options are passed', async () => {
    await expect(safeDelete(outsideCwd)).rejects.toThrow()
    expect(existsSync(path.join(outsideCwd, 'precious.txt'))).toBe(true)
  })

  it('rejects the same path synchronously', () => {
    expect(() => safeDeleteSync(outsideCwd)).toThrow()
    expect(existsSync(path.join(outsideCwd, 'precious.txt'))).toBe(true)
  })

  it('deletes it when force is explicitly requested', async () => {
    // The opt-in path is the assertion.
    // oxlint-disable-next-line socket/no-force-delete -- the subject
    await safeDelete(outsideCwd, { force: true })
    expect(existsSync(outsideCwd)).toBe(false)
  })

  it('still deletes a descendant of cwd without a flag', async () => {
    await runWithTempDir(async tmpDir => {
      const child = path.join(tmpDir, 'build')
      await fs.mkdir(child, { recursive: true })
      await safeDelete(child)
      expect(existsSync(child)).toBe(false)
    }, 'safeDelete-descendant-')
  })

  it('still auto-forces inside the OS temp dir, so scratch cleanup needs no flag', async () => {
    await runWithTempDir(async tmpDir => {
      const scratch = path.join(tmpDir, 'scratch')
      await fs.mkdir(scratch, { recursive: true })
      await safeDelete(scratch)
      expect(existsSync(scratch)).toBe(false)
    }, 'safeDelete-autoforce-')
  })
})
