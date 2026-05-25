/**
 * @file Unit tests for src/fs/unique — uniqueSync filename suffix collision
 *   avoidance. Split out of the historical monolithic test/unit/fs.test.mts to
 *   keep each test file under the fleet's 500-line soft cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { uniqueSync } from '../../../src/fs/unique'

import { runWithTempDir } from '../util/temp-file-helper'

describe('uniqueSync', () => {
  it('should return same path if file does not exist', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'unique.txt')

      const result = uniqueSync(testFile)
      expect(result).toContain('unique.txt')
    }, 'uniqueSync-new-')
  })

  it('should add number suffix if file exists', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'exists.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const result = uniqueSync(testFile)
      expect(result).toContain('exists-1.txt')
    }, 'uniqueSync-exists-')
  })

  it('should increment counter for multiple existing files', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const file1 = path.join(tmpDir, 'file-1.txt')
      await fs.writeFile(file1, '', 'utf8')

      const result = uniqueSync(testFile)
      expect(result).toContain('file-2.txt')
    }, 'uniqueSync-increment-')
  })

  it('should preserve file extension', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'data.json')
      await fs.writeFile(testFile, '', 'utf8')

      const result = uniqueSync(testFile)
      expect(result).toContain('data-1.json')
    }, 'uniqueSync-extension-')
  })

  it('should handle files without extension', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'README')
      await fs.writeFile(testFile, '', 'utf8')

      const result = uniqueSync(testFile)
      expect(result).toContain('README-1')
    }, 'uniqueSync-no-ext-')
  })
})
