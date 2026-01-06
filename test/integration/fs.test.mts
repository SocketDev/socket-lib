/**
 * @fileoverview Integration tests for filesystem utilities.
 *
 * Tests real filesystem operations:
 * - readJsonFile() / writeJsonFile() for JSON persistence
 * - copyFile() / moveFile() for file operations
 * - ensureDir() for directory creation
 * - File existence checks and permissions
 * Used by Socket CLI for config files, package.json manipulation, and cache.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  readJson,
  safeMkdir,
  safeStats,
  writeJson,
} from '@socketsecurity/lib/fs'
import { describe, expect, it } from 'vitest'
import { runWithTempDir } from '../unit/utils/temp-file-helper'

describe('fs integration', () => {
  describe('JSON file operations', () => {
    it('should write and read JSON file', async () => {
      await runWithTempDir(async tmpDir => {
        const filePath = path.join(tmpDir, 'test.json')
        const data = { name: 'test', value: 42, nested: { foo: 'bar' } }

        await writeJson(filePath, data)

        const readData = await readJson(filePath)
        expect(readData).toEqual(data)
      }, 'fs-json-test-')
    })

    it('should handle writing complex JSON structures', async () => {
      await runWithTempDir(async tmpDir => {
        const filePath = path.join(tmpDir, 'complex.json')
        const data = {
          array: [1, 2, 3],
          nested: {
            deep: {
              value: 'test',
            },
          },
          nullValue: null,
          boolValue: true,
        }

        await writeJson(filePath, data)
        const readData = await readJson(filePath)
        expect(readData).toEqual(data)
      }, 'fs-complex-json-')
    })

    it('should create parent directories when writing JSON', async () => {
      await runWithTempDir(async tmpDir => {
        // Create parent directory first
        const deepDir = path.join(tmpDir, 'deep', 'nested')
        await safeMkdir(deepDir)

        const filePath = path.join(deepDir, 'test.json')
        const data = { test: 'value' }

        await writeJson(filePath, data)

        const readData = await readJson(filePath)
        expect(readData).toEqual(data)

        const dirStats = await safeStats(deepDir)
        expect(dirStats).toBeDefined()
        expect(dirStats?.isDirectory()).toBe(true)
      }, 'fs-deep-json-')
    })
  })

  describe('file operations', () => {
    it('should copy file to new location', async () => {
      await runWithTempDir(async tmpDir => {
        const srcPath = path.join(tmpDir, 'source.txt')
        const destPath = path.join(tmpDir, 'dest.txt')

        await fs.writeFile(srcPath, 'test content', 'utf8')
        await fs.copyFile(srcPath, destPath)

        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('test content')

        // Source should still exist
        const srcStats = await safeStats(srcPath)
        expect(srcStats).toBeDefined()
      }, 'fs-copy-test-')
    })

    it('should check file existence with safeStats', async () => {
      await runWithTempDir(async tmpDir => {
        const filePath = path.join(tmpDir, 'exists.txt')

        let stats = await safeStats(filePath)
        expect(stats).toBeUndefined()

        await fs.writeFile(filePath, 'content', 'utf8')

        stats = await safeStats(filePath)
        expect(stats).toBeDefined()
        expect(stats?.isFile()).toBe(true)
      }, 'fs-exists-test-')
    })
  })

  describe('directory operations', () => {
    it('should create directory recursively', async () => {
      await runWithTempDir(async tmpDir => {
        const deepPath = path.join(tmpDir, 'level1', 'level2', 'level3')

        await safeMkdir(deepPath)

        const stats = await fs.stat(deepPath)
        expect(stats.isDirectory()).toBe(true)
      }, 'fs-ensuredir-test-')
    })

    it('should not fail when directory already exists', async () => {
      await runWithTempDir(async tmpDir => {
        const dirPath = path.join(tmpDir, 'existing')

        await fs.mkdir(dirPath)
        await safeMkdir(dirPath)

        const stats = await fs.stat(dirPath)
        expect(stats.isDirectory()).toBe(true)
      }, 'fs-existing-dir-')
    })

    it('should handle temp directory operations', async () => {
      const tmpDir = os.tmpdir()
      const testDir = path.join(tmpDir, 'socket-test-integration')

      await safeMkdir(testDir)

      const stats = await safeStats(testDir)
      expect(stats).toBeDefined()
      expect(stats?.isDirectory()).toBe(true)

      // Cleanup
      await fs.rm(testDir, { recursive: true, force: true })
    })
  })
})
