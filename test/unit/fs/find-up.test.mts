/**
 * @file Unit tests for src/fs/find-up — directory-tree-walking file lookup.
 *   Split out of the historical monolithic test/unit/fs.test.mts to keep each
 *   test file under the fleet's 500-line soft cap and let vitest's parallel
 *   thread pool schedule each source-module's tests independently.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { findUp, findUpSync } from '../../../src/fs/find-up'

import { runWithTempDir } from '../util/temp-file-helper'

describe('findUp', () => {
  it('should find file in current directory', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'package.json')
      await fs.writeFile(testFile, '{}', 'utf8')

      const result = await findUp('package.json', { cwd: tmpDir })
      expect(result).toBeDefined()
      expect(result).toContain('package.json')
    }, 'findUp-current-')
  })

  it('should find file in parent directory', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'config.json')
      await fs.writeFile(testFile, '{}', 'utf8')

      const subDir = path.join(tmpDir, 'sub', 'nested')
      await fs.mkdir(subDir, { recursive: true })

      const result = await findUp('config.json', { cwd: subDir })
      expect(result).toBeDefined()
      expect(result).toContain('config.json')
    }, 'findUp-parent-')
  })

  it('should find directory when onlyDirectories is true', async () => {
    await runWithTempDir(async tmpDir => {
      const testDir = path.join(tmpDir, 'node_modules')
      await fs.mkdir(testDir, { recursive: true })

      const result = await findUp('node_modules', {
        cwd: tmpDir,
        onlyDirectories: true,
      })
      expect(result).toBeDefined()
      expect(result).toContain('node_modules')
    }, 'findUp-dir-')
  })

  it('should return undefined when file not found', async () => {
    await runWithTempDir(async tmpDir => {
      const result = await findUp('nonexistent.txt', { cwd: tmpDir })
      expect(result).toBeUndefined()
    }, 'findUp-notfound-')
  })

  it('should find first match when given array of names', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'config.yaml')
      await fs.writeFile(testFile, '', 'utf8')

      const result = await findUp(
        ['config.json', 'config.yaml', 'config.yml'],
        {
          cwd: tmpDir,
        },
      )
      expect(result).toBeDefined()
      expect(result).toContain('config.yaml')
    }, 'findUp-array-')
  })

  it('should respect abort signal', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await findUp('package.json', {
      cwd: process.cwd(),
      signal: controller.signal,
    })
    expect(result).toBeUndefined()
  })

  it('should not find files when onlyDirectories is true', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'file.txt')
      await fs.writeFile(testFile, '', 'utf8')

      const result = await findUp('file.txt', {
        cwd: tmpDir,
        onlyDirectories: true,
      })
      expect(result).toBeUndefined()
    }, 'findUp-only-dirs-')
  })
})

describe('findUpSync', () => {
  it('should find file in current directory', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'package.json')
      await fs.writeFile(testFile, '{}', 'utf8')

      const result = findUpSync('package.json', { cwd: tmpDir })
      expect(result).toBeDefined()
      expect(result).toContain('package.json')
    }, 'findUpSync-current-')
  })

  it('should find file in parent directory', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'config.json')
      await fs.writeFile(testFile, '{}', 'utf8')

      const subDir = path.join(tmpDir, 'sub', 'nested')
      await fs.mkdir(subDir, { recursive: true })

      const result = findUpSync('config.json', { cwd: subDir })
      expect(result).toBeDefined()
      expect(result).toContain('config.json')
    }, 'findUpSync-parent-')
  })

  it('should find directory when onlyDirectories is true', async () => {
    await runWithTempDir(async tmpDir => {
      const testDir = path.join(tmpDir, 'node_modules')
      await fs.mkdir(testDir, { recursive: true })

      const result = findUpSync('node_modules', {
        cwd: tmpDir,
        onlyDirectories: true,
      })
      expect(result).toBeDefined()
      expect(result).toContain('node_modules')
    }, 'findUpSync-dir-')
  })

  it('should return undefined when file not found', async () => {
    await runWithTempDir(async tmpDir => {
      const result = findUpSync('nonexistent.txt', { cwd: tmpDir })
      expect(result).toBeUndefined()
    }, 'findUpSync-notfound-')
  })

  it('should find first match when given array of names', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'config.yaml')
      await fs.writeFile(testFile, '', 'utf8')

      const result = findUpSync(['config.json', 'config.yaml', 'config.yml'], {
        cwd: tmpDir,
      })
      expect(result).toBeDefined()
      expect(result).toContain('config.yaml')
    }, 'findUpSync-array-')
  })

  it('should stop at stopAt directory', async () => {
    await runWithTempDir(async tmpDir => {
      const configFile = path.join(tmpDir, 'config.json')
      await fs.writeFile(configFile, '{}', 'utf8')

      const subDir = path.join(tmpDir, 'sub', 'nested')
      await fs.mkdir(subDir, { recursive: true })

      const midDir = path.join(tmpDir, 'sub')
      const result = findUpSync('config.json', {
        cwd: subDir,
        stopAt: midDir,
      })
      expect(result).toBeUndefined()
    }, 'findUpSync-stopAt-')
  })

  it('should check stopAt directory itself', async () => {
    await runWithTempDir(async tmpDir => {
      const subDir = path.join(tmpDir, 'sub')
      await fs.mkdir(subDir, { recursive: true })

      const configFile = path.join(subDir, 'config.json')
      await fs.writeFile(configFile, '{}', 'utf8')

      const nestedDir = path.join(subDir, 'nested')
      await fs.mkdir(nestedDir, { recursive: true })

      const result = findUpSync('config.json', {
        cwd: nestedDir,
        stopAt: subDir,
      })
      expect(result).toBeDefined()
      expect(result).toContain('config.json')
    }, 'findUpSync-stopAt-check-')
  })

  it('should not match a file when onlyDirectories is true (sync)', async () => {
    // A same-named FILE exists at the start dir. With onlyDirectories,
    // stats.isDirectory() is false so the entry is skipped and the walk
    // continues to undefined — exercises the `!onlyFiles &&
    // stats.isDirectory()` false branch in findUpSync.
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'target')
      await fs.writeFile(testFile, '', 'utf8')

      const result = findUpSync('target', {
        cwd: tmpDir,
        onlyDirectories: true,
      })
      expect(result).toBeUndefined()
    }, 'findUpSync-only-dirs-file-')
  })
})
