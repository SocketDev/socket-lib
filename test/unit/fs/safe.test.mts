/**
 * @file Unit tests for src/fs/safe — safeDelete/Sync and safeMkdir/Sync. Split
 *   out of the historical monolithic test/unit/fs.test.mts to keep each test
 *   file under the fleet's 500-line soft cap.
 */

import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { safeDelete as deleteFixtureRoot } from '@socketsecurity/lib-stable/fs/safe'

import { forceDelete } from '../../../src/fs/force.mjs'
import { resetPaths, setPath } from '../../../src/paths/rewire.mjs'
import {
  safeDelete,
  safeDeleteSync,
  safeMkdir,
  safeMkdirSync,
} from '../../../src/fs/safe.mjs'

import { runWithTempDir } from '../util/temp-files.mjs'

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

async function createGuardedSandbox() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-delete-guard-'))
  const working = path.join(root, 'working')
  const allowedTemp = path.join(root, 'allowed-temp')
  await fs.mkdir(working)
  setPath('tmpdir', allowedTemp)
  setPath('socket-cacache-dir', path.join(root, 'allowed-cache'))
  setPath('socket-user-dir', path.join(root, 'allowed-user'))
  vi.spyOn(process, 'cwd').mockReturnValue(working)
  return { root, working, allowedTemp }
}

async function cleanupGuardedSandbox(root: string | undefined) {
  vi.restoreAllMocks()
  resetPaths()
  if (root) {
    await deleteFixtureRoot(root)
  }
}

describe('safeDelete cwd relocates the guard', () => {
  let sandbox: Awaited<ReturnType<typeof createGuardedSandbox>> | undefined
  let ownedRoot: string
  let child: string

  beforeEach(async () => {
    sandbox = await createGuardedSandbox()
    ownedRoot = path.join(sandbox.root, 'guarded-parent', 'owned')
    child = path.join(ownedRoot, 'child')
    await fs.mkdir(child, { recursive: true })
    await fs.writeFile(path.join(child, 'file.txt'), 'keep')
  })

  afterEach(async () => {
    await cleanupGuardedSandbox(sandbox?.root)
    sandbox = undefined
  })

  it('deletes a descendant of the named root without force', async () => {
    await safeDelete(child, { cwd: ownedRoot })
    expect(existsSync(child)).toBe(false)
    expect(existsSync(ownedRoot)).toBe(true)
  })

  it('deletes a descendant synchronously too', () => {
    safeDeleteSync(child, { cwd: ownedRoot })
    expect(existsSync(child)).toBe(false)
  })

  it('still refuses the named root itself', async () => {
    await expect(
      safeDelete(ownedRoot, { cwd: ownedRoot, maxRetries: 0 }),
    ).rejects.toThrow()
    expect(existsSync(child)).toBe(true)
  })

  it('still refuses a path above the named root', async () => {
    const parent = path.join(sandbox!.root, 'guarded-parent')
    await expect(
      safeDelete(parent, { cwd: ownedRoot, maxRetries: 0 }),
    ).rejects.toThrow()
    expect(existsSync(child)).toBe(true)
  })
})

describe('safeDelete force is opt-in', () => {
  let sandbox: Awaited<ReturnType<typeof createGuardedSandbox>> | undefined
  let outsideCwd: string

  beforeEach(async () => {
    sandbox = await createGuardedSandbox()
    outsideCwd = path.join(sandbox.root, 'outside')
    await fs.mkdir(path.join(outsideCwd, 'child'), { recursive: true })
    await fs.writeFile(path.join(outsideCwd, 'precious.txt'), 'keep')
  })

  afterEach(async () => {
    await cleanupGuardedSandbox(sandbox?.root)
    sandbox = undefined
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
    // oxlint-disable-next-line socket/no-force-delete -- private fixture.
    await forceDelete(outsideCwd)
    expect(existsSync(outsideCwd)).toBe(false)
  })

  it('still deletes a descendant of cwd without a flag', async () => {
    const child = path.join(sandbox!.working, 'build')
    await fs.mkdir(child)
    await safeDelete(child)
    expect(existsSync(child)).toBe(false)
  })

  it('still auto-forces inside the OS temp dir, so scratch cleanup needs no flag', async () => {
    const scratch = path.join(sandbox!.allowedTemp, 'scratch')
    await fs.mkdir(scratch, { recursive: true })
    await safeDelete(scratch)
    expect(existsSync(scratch)).toBe(false)
  })
})
