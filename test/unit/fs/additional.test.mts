/**
 * @file Additional comprehensive tests for file system utilities to increase
 *   coverage. Extends fs.test.ts with additional edge cases and coverage
 *   scenarios:
 *
 *   - findUp edge cases: onlyFiles/onlyDirectories combinations, deeply nested
 *     paths
 *   - Error handling: non-existent paths, permission errors, invalid JSON
 *   - Binary file operations: non-UTF8 content, Buffer handling
 *   - File read/write/json option handling
 *   - Sync vs async consistency: validates both APIs behave identically Uses
 *     runWithTempDir for isolated test environments to avoid filesystem
 *     pollution. Directory, delete, and path-inspection coverage lives in the
 *     companion file additional-dir-delete.test.mts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findUp, findUpSync } from '../../../src/fs/find'
import {
  readFileBinary,
  readFileBinarySync,
  readFileUtf8,
  readFileUtf8Sync,
  safeReadFile,
  safeReadFileSync,
} from '../../../src/fs/read-file'
import { readJson, readJsonSync } from '../../../src/fs/read-json'
import { writeJson, writeJsonSync } from '../../../src/fs/write-json'
import { describe, expect, it } from 'vitest'
import { minTimerQuantum } from '../../_shared/fleet/lib/timing.mts'
import { runWithTempDir } from '../util/temp-file-helper'

describe('fs - Additional Coverage', () => {
  describe('findUp edge cases', () => {
    it('should find both files and directories when both onlyFiles and onlyDirectories are false', async () => {
      await runWithTempDir(async tmpDir => {
        const testDir = path.join(tmpDir, 'target-dir')
        await fs.mkdir(testDir)

        const result = await findUp('target-dir', {
          cwd: tmpDir,
          onlyFiles: false,
          onlyDirectories: false,
        })
        expect(result).toBeDefined()
        expect(result).toContain('target-dir')
      }, 'findUp-both-types-')
    })

    it('should handle abort signal during loop', async () => {
      const controller = new AbortController()

      // Create a promise that aborts after a short delay
      const result = await new Promise<string | undefined>(resolve => {
        setTimeout(() => {
          controller.abort()
        }, minTimerQuantum(10))

        findUp('nonexistent-file-that-will-trigger-loop', {
          cwd: process.cwd(),
          signal: controller.signal,
        }).then(resolve)
      })

      expect(result).toBeUndefined()
    })

    it('should prioritize onlyDirectories over onlyFiles', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'file.txt')
        await fs.writeFile(testFile, '', 'utf8')

        const result = await findUp('file.txt', {
          cwd: tmpDir,
          onlyDirectories: true,
          onlyFiles: true,
        })
        expect(result).toBeUndefined()
      }, 'findUp-priority-')
    })
  })

  describe('findUpSync edge cases', () => {
    it('should find both files and directories when both onlyFiles and onlyDirectories are false', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'target-file')
        await fs.writeFile(testFile, '', 'utf8')

        const result = findUpSync('target-file', {
          cwd: tmpDir,
          onlyFiles: false,
          onlyDirectories: false,
        })
        expect(result).toBeDefined()
        expect(result).toContain('target-file')
      }, 'findUpSync-both-types-')
    })

    it('should not find files when onlyDirectories is true', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'just-a-file.txt')
        await fs.writeFile(testFile, '', 'utf8')

        const result = findUpSync('just-a-file.txt', {
          cwd: tmpDir,
          onlyDirectories: true,
        })
        expect(result).toBeUndefined()
      }, 'findUpSync-only-dirs-no-file-')
    })

    it('should prioritize onlyDirectories over onlyFiles', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'file.txt')
        await fs.writeFile(testFile, '', 'utf8')

        const result = findUpSync('file.txt', {
          cwd: tmpDir,
          onlyDirectories: true,
          onlyFiles: true,
        })
        expect(result).toBeUndefined()
      }, 'findUpSync-priority-')
    })
  })

  describe('readFileBinary with options', () => {
    it('should handle string options parameter', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'binary.dat')
        const testData = Buffer.from([0xff, 0xfe, 0xfd])
        await fs.writeFile(testFile, testData)

        const result = await readFileBinary(testFile, 'binary')
        expect(Buffer.isBuffer(result)).toBe(true)
        expect(result).toEqual(testData)
      }, 'readFileBinary-string-opts-')
    })

    it('should handle object options with encoding', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'data.bin')
        const testData = Buffer.from([0x01, 0x02, 0x03])
        await fs.writeFile(testFile, testData)

        const result = await readFileBinary(testFile, { encoding: 'utf8' })
        expect(Buffer.isBuffer(result)).toBe(true)
      }, 'readFileBinary-obj-opts-')
    })
  })

  describe('readFileBinarySync with options', () => {
    it('should handle string options parameter', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'binary.dat')
        const testData = Buffer.from([0xff, 0xfe, 0xfd])
        await fs.writeFile(testFile, testData)

        const result = readFileBinarySync(testFile, 'binary')
        expect(Buffer.isBuffer(result)).toBe(true)
        expect(result).toEqual(testData)
      }, 'readFileBinarySync-string-opts-')
    })

    it('should handle object options with encoding', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'data.bin')
        const testData = Buffer.from([0x01, 0x02, 0x03])
        await fs.writeFile(testFile, testData)

        const result = readFileBinarySync(testFile, { encoding: 'utf8' })
        expect(Buffer.isBuffer(result)).toBe(true)
      }, 'readFileBinarySync-obj-opts-')
    })
  })

  describe('readFileUtf8 with options', () => {
    it('should handle string options parameter', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'text.txt')
        await fs.writeFile(testFile, 'content', 'utf8')

        const result = await readFileUtf8(testFile, 'utf8')
        expect(result).toBe('content')
      }, 'readFileUtf8-string-opts-')
    })

    it('should handle object options', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'text.txt')
        await fs.writeFile(testFile, 'content', 'utf8')

        const result = await readFileUtf8(testFile, { encoding: 'utf8' })
        expect(result).toBe('content')
      }, 'readFileUtf8-obj-opts-')
    })
  })

  describe('readFileUtf8Sync with options', () => {
    it('should handle string options parameter', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'text.txt')
        await fs.writeFile(testFile, 'content', 'utf8')

        const result = readFileUtf8Sync(testFile, 'utf8')
        expect(result).toBe('content')
      }, 'readFileUtf8Sync-string-opts-')
    })

    it('should handle object options', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'text.txt')
        await fs.writeFile(testFile, 'content', 'utf8')

        const result = readFileUtf8Sync(testFile, { encoding: 'utf8' })
        expect(result).toBe('content')
      }, 'readFileUtf8Sync-obj-opts-')
    })
  })

  describe('readJson with string options', () => {
    it('should handle string encoding option', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'data.json')
        const testData = { foo: 'bar' }
        await fs.writeFile(testFile, JSON.stringify(testData), 'utf8')

        const result = await readJson(testFile, 'utf8')
        expect(result).toEqual(testData)
      }, 'readJson-string-encoding-')
    })
  })

  describe('readJsonSync with string options', () => {
    it('should handle string encoding option', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'data.json')
        const testData = { foo: 'bar' }
        await fs.writeFile(testFile, JSON.stringify(testData), 'utf8')

        const result = readJsonSync(testFile, 'utf8')
        expect(result).toEqual(testData)
      }, 'readJsonSync-string-encoding-')
    })

    it('should use custom reviver function', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'data.json')
        const testData = { timestamp: '2024-01-01T00:00:00.000Z' }
        await fs.writeFile(testFile, JSON.stringify(testData), 'utf8')

        const result = readJsonSync(testFile, {
          reviver: (key, value) => {
            if (key === 'timestamp' && typeof value === 'string') {
              return new Date(value)
            }
            return value
          },
        }) as unknown as { timestamp: Date }

        expect(result.timestamp).toBeInstanceOf(Date)
      }, 'readJsonSync-reviver-')
    })
  })

  describe('writeJson with additional options', () => {
    it('should handle string encoding option', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'data.json')
        const testData = { test: 'value' }

        await writeJson(testFile, testData, 'utf8')

        const content = await fs.readFile(testFile, 'utf8')
        const parsed = JSON.parse(content)
        expect(parsed).toEqual(testData)
      }, 'writeJson-string-encoding-')
    })

    it('should use tabs for indentation', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'tabs.json')
        const testData = { nested: { value: 'test' } }

        await writeJson(testFile, testData, { spaces: '\t' })

        const content = await fs.readFile(testFile, 'utf8')
        expect(content).toContain('\t')
      }, 'writeJson-tabs-')
    })

    it('should compact JSON with spaces: 0', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'compact.json')
        const testData = { a: 1, b: 2 }

        await writeJson(testFile, testData, { spaces: 0 })

        const content = await fs.readFile(testFile, 'utf8')
        expect(content).toContain('{"a":1,"b":2}')
      }, 'writeJson-compact-')
    })
  })

  describe('writeJsonSync with additional options', () => {
    it('should use string encoding option', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'encoding.json')
        const testData = { test: 'data' }

        writeJsonSync(testFile, testData, 'utf8')

        const content = await fs.readFile(testFile, 'utf8')
        const parsed = JSON.parse(content)
        expect(parsed).toEqual(testData)
      }, 'writeJsonSync-string-encoding-')
    })

    it('should use tabs for indentation', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'tabs.json')
        const testData = { foo: 'bar' }

        writeJsonSync(testFile, testData, { spaces: '\t' })

        const content = await fs.readFile(testFile, 'utf8')
        expect(content).toContain('\t')
      }, 'writeJsonSync-tabs-')
    })

    it('should compact JSON with spaces: 0', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'compact.json')
        const testData = { foo: 'bar', baz: 'qux' }

        writeJsonSync(testFile, testData, { spaces: 0 })

        const content = await fs.readFile(testFile, 'utf8')
        expect(content).not.toContain('  ')
        expect(content).toContain('{"foo":"bar","baz":"qux"}')
      }, 'writeJsonSync-compact-')
    })

    it('should use custom EOL', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'custom-eol.json')
        const testData = { foo: 'bar' }

        writeJsonSync(testFile, testData, { EOL: '\r\n' })

        const content = await fs.readFile(testFile, 'utf8')
        expect(content).toContain('\r\n')
      }, 'writeJsonSync-custom-eol-')
    })

    it('should use replacer function', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'replacer.json')
        const testData = { keep: 'this', remove: 'that' }

        writeJsonSync(testFile, testData, {
          replacer: (key, value) => {
            if (key === 'remove') {
              return undefined
            }
            return value
          },
        })

        const content = await fs.readFile(testFile, 'utf8')
        const parsed = JSON.parse(content)
        expect(parsed.keep).toBe('this')
        expect(parsed.remove).toBeUndefined()
      }, 'writeJsonSync-replacer-')
    })
  })

  describe('safeReadFile with string encoding', () => {
    it('should handle string encoding option', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'test.txt')
        await fs.writeFile(testFile, 'content', 'utf8')

        const result = await safeReadFile(testFile, { encoding: 'utf8' })
        expect(result).toBe('content')
      }, 'safeReadFile-string-encoding-')
    })
  })

  describe('safeReadFileSync with string encoding', () => {
    it('should handle string encoding option', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'test.txt')
        await fs.writeFile(testFile, 'content', 'utf8')

        const result = safeReadFileSync(testFile, { encoding: 'utf8' })
        expect(result).toBe('content')
      }, 'safeReadFileSync-string-encoding-')
    })
  })
})
