/**
 * @file Unit tests for src/fs/inspect — isDir/isDirSync, isDirEmptySync,
 *   isSymlinkSync, safeStat/safeStatSync. Split out of the historical
 *   monolithic test/unit/fs.test.mts to keep each test file under the fleet's
 *   500-line soft cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  isDirEmptySync,
  isDirSync,
  isSymlinkSync,
  safeStat,
  safeStatSync,
} from '../../../src/fs/inspect'

import { runWithTempDir } from '../util/temp-file-helper'

describe('isDir', () => {
  it('should return true for directories', async () => {
    await runWithTempDir(async tmpDir => {
      const result = isDirSync(tmpDir)
      expect(result).toBe(true)
    }, 'isDir-true-')
  })

  it('should return false for files', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const result = isDirSync(testFile)
      expect(result).toBe(false)
    }, 'isDir-false-file-')
  })

  it('should return false for non-existent paths', async () => {
    const result = isDirSync('/nonexistent/path')
    expect(result).toBe(false)
  })
})

describe('isDirSync', () => {
  it('should return true for directories', async () => {
    await runWithTempDir(async tmpDir => {
      const result = isDirSync(tmpDir)
      expect(result).toBe(true)
    }, 'isDirSync-true-')
  })

  it('should return false for files', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const result = isDirSync(testFile)
      expect(result).toBe(false)
    }, 'isDirSync-false-file-')
  })

  it('should return false for non-existent paths', () => {
    const result = isDirSync('/nonexistent/path')
    expect(result).toBe(false)
  })
})

describe('isDirEmptySync', () => {
  it('should return true for empty directories', async () => {
    await runWithTempDir(async tmpDir => {
      const emptyDir = path.join(tmpDir, 'empty')
      await fs.mkdir(emptyDir)

      const result = isDirEmptySync(emptyDir)
      expect(result).toBe(true)
    }, 'isDirEmpty-true-')
  })

  it('should return false for directories with files', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const result = isDirEmptySync(tmpDir)
      expect(result).toBe(false)
    }, 'isDirEmpty-false-')
  })

  it('should return false for non-existent directories', () => {
    const result = isDirEmptySync('/nonexistent/path')
    expect(result).toBe(false)
  })

  it('should ignore files matching ignore patterns', async () => {
    await runWithTempDir(async tmpDir => {
      const gitDir = path.join(tmpDir, '.git')
      await fs.mkdir(gitDir)
      const gitSubDir = path.join(gitDir, 'objects')
      await fs.mkdir(gitSubDir)

      const result = isDirEmptySync(tmpDir, {
        ignore: ['.git'],
      })
      expect(result).toBe(true)
    }, 'isDirEmpty-ignore-')
  })

  it('should return false when non-ignored files exist', async () => {
    await runWithTempDir(async tmpDir => {
      const gitDir = path.join(tmpDir, '.git')
      await fs.mkdir(gitDir)
      const gitSubDir = path.join(gitDir, 'objects')
      await fs.mkdir(gitSubDir)

      const readmeFile = path.join(tmpDir, 'README.md')
      await fs.writeFile(readmeFile, '', 'utf8')

      const result = isDirEmptySync(tmpDir, {
        ignore: ['.git'],
      })
      expect(result).toBe(false)
    }, 'isDirEmpty-ignore-mixed-')
  })
})

describe('isSymlinkSync', () => {
  it('should return true for symlinks', async () => {
    await runWithTempDir(async tmpDir => {
      const targetFile = path.join(tmpDir, 'target.txt')
      await fs.writeFile(targetFile, '', 'utf8')

      const linkPath = path.join(tmpDir, 'link.txt')
      await fs.symlink(targetFile, linkPath)

      const result = isSymlinkSync(linkPath)
      expect(result).toBe(true)
    }, 'isSymLink-true-')
  })

  it('should return false for regular files', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const result = isSymlinkSync(testFile)
      expect(result).toBe(false)
    }, 'isSymLink-false-')
  })

  it('should return false for non-existent paths', () => {
    const result = isSymlinkSync('/nonexistent/path')
    expect(result).toBe(false)
  })
})

describe('safeStat', () => {
  it('should return stats for existing files', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'test.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const result = await safeStat(testFile)
      expect(result).toBeDefined()
      expect(result?.isFile()).toBe(true)
    }, 'safeStat-file-')
  })

  it('should return stats for directories', async () => {
    await runWithTempDir(async tmpDir => {
      const result = await safeStat(tmpDir)
      expect(result).toBeDefined()
      expect(result?.isDirectory()).toBe(true)
    }, 'safeStat-dir-')
  })

  it('should return undefined for non-existent paths', async () => {
    const result = await safeStat('/nonexistent/path')
    expect(result).toBeUndefined()
  })
})

describe('safeStatSync', () => {
  it('should return stats for existing files', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'test.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const result = safeStatSync(testFile)
      expect(result).toBeDefined()
      expect(result?.isFile()).toBe(true)
    }, 'safeStatSync-file-')
  })

  it('should return stats for directories', async () => {
    await runWithTempDir(async tmpDir => {
      const result = safeStatSync(tmpDir)
      expect(result).toBeDefined()
      expect(result?.isDirectory()).toBe(true)
    }, 'safeStatSync-dir-')
  })

  it('should return undefined for non-existent paths', () => {
    const result = safeStatSync('/nonexistent/path')
    expect(result).toBeUndefined()
  })
})
