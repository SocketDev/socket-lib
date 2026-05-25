/**
 * @file Unit tests for src/fs/validate — validateFiles. Split out of the
 *   historical monolithic test/unit/fs.test.mts to keep each test file under
 *   the fleet's 500-line soft cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateFiles } from '../../../src/fs/validate'

import { runWithTempDir } from '../util/temp-file-helper'

describe('validateFiles', () => {
  it('should return all files as valid when all exist and are readable', async () => {
    await runWithTempDir(async tmpDir => {
      const file1 = path.join(tmpDir, 'package.json')
      const file2 = path.join(tmpDir, 'tsconfig.json')
      await fs.writeFile(file1, '{}', 'utf8')
      await fs.writeFile(file2, '{}', 'utf8')

      const { invalidPaths, validPaths } = validateFiles([file1, file2])

      expect(validPaths).toHaveLength(2)
      expect(validPaths).toContain(file1)
      expect(validPaths).toContain(file2)
      expect(invalidPaths).toHaveLength(0)
    }, 'validateFiles-all-valid-')
  })

  it('should return non-existent files as invalid', async () => {
    await runWithTempDir(async tmpDir => {
      const existingFile = path.join(tmpDir, 'exists.json')
      const nonExistentFile = path.join(tmpDir, 'does-not-exist.json')
      await fs.writeFile(existingFile, '{}', 'utf8')

      const { invalidPaths, validPaths } = validateFiles([
        existingFile,
        nonExistentFile,
      ])

      expect(validPaths).toHaveLength(1)
      expect(validPaths).toContain(existingFile)
      expect(invalidPaths).toHaveLength(1)
      expect(invalidPaths).toContain(nonExistentFile)
    }, 'validateFiles-non-existent-')
  })

  it('should return all files as invalid when none exist', async () => {
    await runWithTempDir(async tmpDir => {
      const file1 = path.join(tmpDir, 'missing1.json')
      const file2 = path.join(tmpDir, 'missing2.json')

      const { invalidPaths, validPaths } = validateFiles([file1, file2])

      expect(validPaths).toHaveLength(0)
      expect(invalidPaths).toHaveLength(2)
      expect(invalidPaths).toContain(file1)
      expect(invalidPaths).toContain(file2)
    }, 'validateFiles-all-invalid-')
  })

  it('should handle empty file array', () => {
    const { invalidPaths, validPaths } = validateFiles([])

    expect(validPaths).toHaveLength(0)
    expect(invalidPaths).toHaveLength(0)
  })

  it('should work with readonly arrays', async () => {
    await runWithTempDir(async tmpDir => {
      const file1 = path.join(tmpDir, 'test.json')
      await fs.writeFile(file1, '{}', 'utf8')

      const readonlyArray: readonly string[] = [file1] as const
      const { invalidPaths, validPaths } = validateFiles(readonlyArray)

      expect(validPaths).toHaveLength(1)
      expect(validPaths).toContain(file1)
      expect(invalidPaths).toHaveLength(0)
    }, 'validateFiles-readonly-')
  })

  it('should handle mixed valid and invalid files', async () => {
    await runWithTempDir(async tmpDir => {
      const valid1 = path.join(tmpDir, 'valid1.json')
      const valid2 = path.join(tmpDir, 'valid2.json')
      const invalid1 = path.join(tmpDir, 'invalid1.json')
      const invalid2 = path.join(tmpDir, 'invalid2.json')

      await fs.writeFile(valid1, '{}', 'utf8')
      await fs.writeFile(valid2, '{}', 'utf8')

      const { invalidPaths, validPaths } = validateFiles([
        valid1,
        invalid1,
        valid2,
        invalid2,
      ])

      expect(validPaths).toHaveLength(2)
      expect(validPaths).toContain(valid1)
      expect(validPaths).toContain(valid2)
      expect(invalidPaths).toHaveLength(2)
      expect(invalidPaths).toContain(invalid1)
      expect(invalidPaths).toContain(invalid2)
    }, 'validateFiles-mixed-')
  })

  it('should preserve file order in results', async () => {
    await runWithTempDir(async tmpDir => {
      const file1 = path.join(tmpDir, 'a.json')
      const file2 = path.join(tmpDir, 'b.json')
      const file3 = path.join(tmpDir, 'c.json')
      await fs.writeFile(file1, '{}', 'utf8')
      await fs.writeFile(file2, '{}', 'utf8')
      await fs.writeFile(file3, '{}', 'utf8')

      const { validPaths } = validateFiles([file3, file1, file2])

      expect(validPaths[0]).toBe(file3)
      expect(validPaths[1]).toBe(file1)
      expect(validPaths[2]).toBe(file2)
    }, 'validateFiles-order-')
  })
})
