/**
 * @file Unit tests for src/fs/read-dir — readDirNames and readDirNamesSync.
 *   Split out of the historical monolithic test/unit/fs.test.mts to keep each
 *   test file under the fleet's 500-line soft cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { readDirNames, readDirNamesSync } from '../../../src/fs/read-dir'

import { runWithTempDir } from '../util/temp-file-helper'

describe('readDirNames', () => {
  it('should read directory names', async () => {
    await runWithTempDir(async tmpDir => {
      const dir1 = path.join(tmpDir, 'dir1')
      const dir2 = path.join(tmpDir, 'dir2')
      await fs.mkdir(dir1)
      await fs.mkdir(dir2)

      const result = await readDirNames(tmpDir)
      expect(result).toEqual(['dir1', 'dir2'])
    }, 'readDirNames-basic-')
  })

  it('should sort directory names by default', async () => {
    await runWithTempDir(async tmpDir => {
      const dirZ = path.join(tmpDir, 'z-dir')
      const dirA = path.join(tmpDir, 'a-dir')
      const dirM = path.join(tmpDir, 'm-dir')
      await fs.mkdir(dirZ)
      await fs.mkdir(dirA)
      await fs.mkdir(dirM)

      const result = await readDirNames(tmpDir)
      expect(result).toEqual(['a-dir', 'm-dir', 'z-dir'])
    }, 'readDirNames-sorted-')
  })

  it('should not sort when sort option is false', async () => {
    await runWithTempDir(async tmpDir => {
      const dirZ = path.join(tmpDir, 'z-dir')
      const dirA = path.join(tmpDir, 'a-dir')
      await fs.mkdir(dirZ)
      await fs.mkdir(dirA)

      const result = await readDirNames(tmpDir, { sort: false })
      expect(result.length).toBe(2)
      expect(result).toContain('z-dir')
      expect(result).toContain('a-dir')
    }, 'readDirNames-unsorted-')
  })

  it('should exclude files, only return directories', async () => {
    await runWithTempDir(async tmpDir => {
      const dir1 = path.join(tmpDir, 'dir1')
      await fs.mkdir(dir1)

      const file1 = path.join(tmpDir, 'file1.txt')
      await fs.writeFile(file1, '', 'utf8')

      const result = await readDirNames(tmpDir)
      expect(result).toEqual(['dir1'])
    }, 'readDirNames-dirs-only-')
  })

  it('should exclude empty directories when includeEmpty is false', async () => {
    await runWithTempDir(async tmpDir => {
      const emptyDir = path.join(tmpDir, 'empty')
      await fs.mkdir(emptyDir)

      const nonEmptyDir = path.join(tmpDir, 'non-empty')
      await fs.mkdir(nonEmptyDir)
      await fs.writeFile(path.join(nonEmptyDir, 'file.txt'), '', 'utf8')

      const result = await readDirNames(tmpDir, { includeEmpty: false })
      expect(result).toEqual(['non-empty'])
    }, 'readDirNames-no-empty-')
  })

  it('should return empty array for non-existent directory', async () => {
    const result = await readDirNames('/nonexistent/path')
    expect(result).toEqual([])
  })

  it('should use ignore patterns with includeEmpty false', async () => {
    await runWithTempDir(async tmpDir => {
      const emptyDir = path.join(tmpDir, 'empty-dir')
      await fs.mkdir(emptyDir)

      const gitDir = path.join(emptyDir, '.git')
      await fs.mkdir(gitDir)

      const nonEmptyDir = path.join(tmpDir, 'non-empty-dir')
      await fs.mkdir(nonEmptyDir)
      await fs.writeFile(path.join(nonEmptyDir, 'file.txt'), '', 'utf8')

      // With ignore patterns and includeEmpty: false, directories containing only ignored files are excluded
      const result = await readDirNames(tmpDir, {
        ignore: ['.git'],
        includeEmpty: false,
      })
      expect(result).toContain('non-empty-dir')
      expect(result).not.toContain('empty-dir')
    }, 'readDirNames-ignore-')
  })
})

describe('readDirNamesSync', () => {
  it('should read directory names', async () => {
    await runWithTempDir(async tmpDir => {
      const dir1 = path.join(tmpDir, 'dir1')
      const dir2 = path.join(tmpDir, 'dir2')
      await fs.mkdir(dir1)
      await fs.mkdir(dir2)

      const result = readDirNamesSync(tmpDir)
      expect(result).toEqual(['dir1', 'dir2'])
    }, 'readDirNamesSync-basic-')
  })

  it('should sort directory names by default', async () => {
    await runWithTempDir(async tmpDir => {
      const dirZ = path.join(tmpDir, 'z-dir')
      const dirA = path.join(tmpDir, 'a-dir')
      const dirM = path.join(tmpDir, 'm-dir')
      await fs.mkdir(dirZ)
      await fs.mkdir(dirA)
      await fs.mkdir(dirM)

      const result = readDirNamesSync(tmpDir)
      expect(result).toEqual(['a-dir', 'm-dir', 'z-dir'])
    }, 'readDirNamesSync-sorted-')
  })

  it('should exclude files, only return directories', async () => {
    await runWithTempDir(async tmpDir => {
      const dir1 = path.join(tmpDir, 'dir1')
      await fs.mkdir(dir1)

      const file1 = path.join(tmpDir, 'file1.txt')
      await fs.writeFile(file1, '', 'utf8')

      const result = readDirNamesSync(tmpDir)
      expect(result).toEqual(['dir1'])
    }, 'readDirNamesSync-dirs-only-')
  })

  it('should return empty array for non-existent directory', () => {
    const result = readDirNamesSync('/nonexistent/path')
    expect(result).toEqual([])
  })
})
