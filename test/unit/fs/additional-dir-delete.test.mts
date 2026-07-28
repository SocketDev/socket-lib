/**
 * @file Additional coverage for directory, delete, and path-inspection file
 *   system utilities. Companion to additional.test.mts (which covers findUp and
 *   file read/write/json paths); this file focuses on:
 *
 *   - readDirNames / readDirNamesSync option combinations (sort, includeEmpty)
 *   - isDirEmptySync ignore-pattern handling
 *   - safeDelete / safeDeleteSync against temp directories
 *   - uniqueSync edge cases (multiple dots, directory paths)
 *   - Path-like (Buffer) inputs to isDir / safeStat Uses runWithTempDir for
 *     isolated test environments to avoid filesystem pollution. Raw fs APIs
 *     (existsSync, fs.unlink) are used intentionally to verify behavior rather
 *     than the lib wrappers, with per-call-site disables.
 */

import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  isDirEmptySync,
  isDirSync,
  safeStat,
  safeStatSync,
} from '../../../src/fs/inspect'
import { readDirNames, readDirNamesSync } from '../../../src/fs/read-dir'
import { safeDelete, safeDeleteSync } from '../../../src/fs/safe'
import { uniqueSync } from '../../../src/fs/unique'
import { describe, expect, it } from 'vitest'
import { runWithTempDir } from '../util/temp-file-helper'

describe('fs - Additional Coverage (dir/delete/inspect)', () => {
  describe('readDirNames with more options', () => {
    it('should handle sort: false', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.mkdir(path.join(tmpDir, 'b-dir'))
        await fs.mkdir(path.join(tmpDir, 'a-dir'))

        const result = await readDirNames(tmpDir, { sort: false })
        expect(result.length).toBe(2)
        expect(result).toContain('a-dir')
        expect(result).toContain('b-dir')
      }, 'readDirNames-no-sort-')
    })

    it('should handle includeEmpty: true explicitly', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.mkdir(path.join(tmpDir, 'empty-dir'))
        await fs.mkdir(path.join(tmpDir, 'non-empty-dir'))
        await fs.writeFile(
          path.join(tmpDir, 'non-empty-dir', 'file.txt'),
          '',
          'utf8',
        )

        const result = await readDirNames(tmpDir, { includeEmpty: true })
        expect(result).toEqual(['empty-dir', 'non-empty-dir'])
      }, 'readDirNames-include-empty-')
    })
  })

  describe('readDirNamesSync with more options', () => {
    it('should handle sort: false', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.mkdir(path.join(tmpDir, 'z-dir'))
        await fs.mkdir(path.join(tmpDir, 'a-dir'))

        const result = readDirNamesSync(tmpDir, { sort: false })
        expect(result.length).toBe(2)
        expect(result).toContain('a-dir')
        expect(result).toContain('z-dir')
      }, 'readDirNamesSync-no-sort-')
    })

    it('should handle includeEmpty: false', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.mkdir(path.join(tmpDir, 'empty'))
        await fs.mkdir(path.join(tmpDir, 'non-empty'))
        await fs.writeFile(path.join(tmpDir, 'non-empty', 'f.txt'), '', 'utf8')

        const result = readDirNamesSync(tmpDir, { includeEmpty: false })
        expect(result).toEqual(['non-empty'])
      }, 'readDirNamesSync-no-empty-')
    })

    it('should handle includeEmpty: true explicitly', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.mkdir(path.join(tmpDir, 'empty'))

        const result = readDirNamesSync(tmpDir, { includeEmpty: true })
        expect(result).toEqual(['empty'])
      }, 'readDirNamesSync-include-empty-')
    })
  })

  describe('isDirEmptySync with more ignore patterns', () => {
    it('should return true when all files are ignored', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.writeFile(path.join(tmpDir, '.DS_Store'), '', 'utf8')
        await fs.writeFile(path.join(tmpDir, 'Thumbs.db'), '', 'utf8')

        const result = isDirEmptySync(tmpDir, {
          ignore: ['**/.DS_Store', '**/Thumbs.db'],
        })
        expect(result).toBe(true)
      }, 'isDirEmpty-all-ignored-')
    })

    it('should return true for empty directory with custom ignore', async () => {
      await runWithTempDir(async tmpDir => {
        const emptyDir = path.join(tmpDir, 'empty')
        await fs.mkdir(emptyDir)

        const result = isDirEmptySync(emptyDir, { ignore: ['*.log'] })
        expect(result).toBe(true)
      }, 'isDirEmpty-custom-ignore-')
    })

    it('should handle partially ignored files', async () => {
      await runWithTempDir(async tmpDir => {
        await fs.writeFile(path.join(tmpDir, 'keep.txt'), '', 'utf8')
        await fs.writeFile(path.join(tmpDir, 'ignore.log'), '', 'utf8')

        const result = isDirEmptySync(tmpDir, { ignore: ['*.log'] })
        expect(result).toBe(false)
      }, 'isDirEmpty-partial-ignore-')
    })
  })

  describe('safeDelete in allowed directories', () => {
    it('should delete files in temp directory without force', async () => {
      const tmpDir = os.tmpdir()
      const testFile = path.join(tmpDir, `test-safe-delete-${Date.now()}.txt`)

      try {
        await fs.writeFile(testFile, 'test', 'utf8')
        await safeDelete(testFile, { force: false })

        // oxlint-disable-next-line socket/prefer-exists-sync -- verify deletion via raw fs, not the lib wrapper.
        const exists = existsSync(testFile)
        expect(exists).toBe(false)
      } catch (e) {
        // Clean up if test fails
        try {
          await safeDelete(testFile)
        } catch {}
        throw e
      }
    })

    it('should handle array of paths in temp directory', async () => {
      const tmpDir = os.tmpdir()
      const file1 = path.join(tmpDir, `test-1-${Date.now()}.txt`)
      const file2 = path.join(tmpDir, `test-2-${Date.now()}.txt`)

      try {
        await fs.writeFile(file1, 'test1', 'utf8')
        await fs.writeFile(file2, 'test2', 'utf8')

        await safeDelete([file1, file2], { force: false })

        // oxlint-disable-next-line socket/prefer-exists-sync -- verify deletion via raw fs, not the lib wrapper.
        const exists1 = existsSync(file1)
        // oxlint-disable-next-line socket/prefer-exists-sync -- verify deletion via raw fs, not the lib wrapper.
        const exists2 = existsSync(file2)

        expect(exists1).toBe(false)
        expect(exists2).toBe(false)
      } catch (e) {
        // Clean up if test fails
        try {
          // oxlint-disable-next-line socket/prefer-safe-delete -- raw unlink cleanup in failure path.
          await fs.unlink(file1)
        } catch {}
        try {
          // oxlint-disable-next-line socket/prefer-safe-delete -- raw unlink cleanup in failure path.
          await fs.unlink(file2)
        } catch {}
        throw e
      }
    })

    it('should use force: true by default for temp directory', async () => {
      const tmpDir = os.tmpdir()
      const testFile = path.join(tmpDir, `test-default-${Date.now()}.txt`)

      try {
        await fs.writeFile(testFile, 'test', 'utf8')
        await safeDelete(testFile)

        // oxlint-disable-next-line socket/prefer-exists-sync -- verify deletion via raw fs, not the lib wrapper.
        const exists = existsSync(testFile)
        expect(exists).toBe(false)
      } catch (e) {
        try {
          // oxlint-disable-next-line socket/prefer-safe-delete -- raw unlink cleanup in failure path.
          await fs.unlink(testFile)
        } catch {}
        throw e
      }
    })
  })

  describe('safeDeleteSync in allowed directories', () => {
    it('should delete files in temp directory without force', async () => {
      const tmpDir = os.tmpdir()
      const testFile = path.join(tmpDir, `test-sync-${Date.now()}.txt`)

      try {
        await fs.writeFile(testFile, 'test', 'utf8')
        safeDeleteSync(testFile, { force: false })

        // oxlint-disable-next-line socket/prefer-exists-sync -- verify deletion via raw fs, not the lib wrapper.
        const exists = existsSync(testFile)
        expect(exists).toBe(false)
      } catch (e) {
        try {
          // oxlint-disable-next-line socket/prefer-safe-delete -- raw unlink cleanup in failure path.
          await fs.unlink(testFile)
        } catch {}
        throw e
      }
    })

    it('should handle array of paths', async () => {
      const tmpDir = os.tmpdir()
      const file1 = path.join(tmpDir, `sync-1-${Date.now()}.txt`)
      const file2 = path.join(tmpDir, `sync-2-${Date.now()}.txt`)

      try {
        await fs.writeFile(file1, 'test1', 'utf8')
        await fs.writeFile(file2, 'test2', 'utf8')

        safeDeleteSync([file1, file2])

        // oxlint-disable-next-line socket/prefer-exists-sync -- verify deletion via raw fs, not the lib wrapper.
        const exists1 = existsSync(file1)
        // oxlint-disable-next-line socket/prefer-exists-sync -- verify deletion via raw fs, not the lib wrapper.
        const exists2 = existsSync(file2)

        expect(exists1).toBe(false)
        expect(exists2).toBe(false)
      } catch (e) {
        try {
          // oxlint-disable-next-line socket/prefer-safe-delete -- raw unlink cleanup in failure path.
          await fs.unlink(file1)
        } catch {}
        try {
          // oxlint-disable-next-line socket/prefer-safe-delete -- raw unlink cleanup in failure path.
          await fs.unlink(file2)
        } catch {}
        throw e
      }
    })
  })

  describe('uniqueSync edge cases', () => {
    it('should handle paths with multiple dots', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'file.test.json')
        await fs.writeFile(testFile, '', 'utf8')

        const result = uniqueSync(testFile)
        expect(result).toContain('file.test-1.json')
      }, 'uniqueSync-multiple-dots-')
    })

    it('should handle directory paths', async () => {
      await runWithTempDir(async tmpDir => {
        const testDir = path.join(tmpDir, 'existing-dir')
        await fs.mkdir(testDir)

        const result = uniqueSync(testDir)
        expect(result).toContain('existing-dir-1')
      }, 'uniqueSync-directory-')
    })
  })

  describe('Path-like inputs', () => {
    it('isDirSync should handle Buffer paths', async () => {
      await runWithTempDir(async tmpDir => {
        const bufferPath = Buffer.from(tmpDir)
        const result = isDirSync(bufferPath)
        expect(result).toBe(true)
      }, 'isDirSync-buffer-')
    })

    it('isDir should handle Buffer paths', async () => {
      await runWithTempDir(async tmpDir => {
        const bufferPath = Buffer.from(tmpDir)
        // oxlint-disable-next-line socket/prefer-exists-sync -- verify Buffer-path acceptance via raw fs.
        const result = existsSync(bufferPath)
        expect(result).toBe(true)
      }, 'isDir-buffer-')
    })

    it('safeStat should handle Buffer paths', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'test.txt')
        await fs.writeFile(testFile, '', 'utf8')
        const bufferPath = Buffer.from(testFile)

        const result = await safeStat(bufferPath)
        expect(result).toBeDefined()
        expect(result?.isFile()).toBe(true)
      }, 'safeStat-buffer-')
    })

    it('safeStatSync should handle Buffer paths', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'test.txt')
        await fs.writeFile(testFile, '', 'utf8')
        const bufferPath = Buffer.from(testFile)

        const result = safeStatSync(bufferPath)
        expect(result).toBeDefined()
        expect(result?.isFile()).toBe(true)
      }, 'safeStatSync-buffer-')
    })
  })
})
