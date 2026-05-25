/**
 * @file Unit tests for src/fs/read-json — readJson and readJsonSync, including
 *   POSIX EACCES permission-error coverage. Split out of the historical
 *   monolithic test/unit/fs.test.mts to keep each test file under the fleet's
 *   500-line soft cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { readJson, readJsonSync } from '../../../src/fs/read-json'

import { runWithTempDir } from '../util/temp-file-helper'

describe('readJson', () => {
  it('should read and parse JSON file', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'data.json')
      const testData = { foo: 'bar', count: 42 }
      await fs.writeFile(testFile, JSON.stringify(testData), 'utf8')

      const result = await readJson(testFile)
      expect(result).toEqual(testData)
    }, 'readJson-basic-')
  })

  it('should handle nested JSON objects', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'nested.json')
      const testData = {
        level1: {
          level2: {
            level3: 'deep',
          },
        },
      }
      await fs.writeFile(testFile, JSON.stringify(testData), 'utf8')

      const result = await readJson(testFile)
      expect(result).toEqual(testData)
    }, 'readJson-nested-')
  })

  it('should throw by default for non-existent files', async () => {
    await expect(readJson('/nonexistent/file.json')).rejects.toThrow()
  })

  it('should return undefined when throws is false and file does not exist', async () => {
    const result = await readJson('/nonexistent/file.json', { throws: false })
    expect(result).toBeUndefined()
  })

  it('should throw by default for invalid JSON', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'invalid.json')
      await fs.writeFile(testFile, 'not valid json', 'utf8')

      await expect(readJson(testFile)).rejects.toThrow()
    }, 'readJson-invalid-')
  })

  it('should return undefined when throws is false and JSON is invalid', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'invalid.json')
      await fs.writeFile(testFile, 'not valid json', 'utf8')

      const result = await readJson(testFile, { throws: false })
      expect(result).toBeUndefined()
    }, 'readJson-invalid-no-throw-')
  })

  it('should use custom reviver function', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'data.json')
      const testData = { date: '2024-01-01T00:00:00.000Z' }
      await fs.writeFile(testFile, JSON.stringify(testData), 'utf8')

      const result = (await readJson(testFile, {
        reviver: (key, value) => {
          if (key === 'date' && typeof value === 'string') {
            return new Date(value)
          }
          return value
        },
      })) as unknown as { date: Date }

      expect(result.date).toBeInstanceOf(Date)
    }, 'readJson-reviver-')
  })
})

describe('readJsonSync', () => {
  it('should read and parse JSON file', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'data.json')
      const testData = { foo: 'bar', count: 42 }
      await fs.writeFile(testFile, JSON.stringify(testData), 'utf8')

      const result = readJsonSync(testFile)
      expect(result).toEqual(testData)
    }, 'readJsonSync-basic-')
  })

  it('should handle nested JSON objects', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'nested.json')
      const testData = {
        level1: {
          level2: {
            level3: 'deep',
          },
        },
      }
      await fs.writeFile(testFile, JSON.stringify(testData), 'utf8')

      const result = readJsonSync(testFile)
      expect(result).toEqual(testData)
    }, 'readJsonSync-nested-')
  })

  it('should throw by default for non-existent files', () => {
    expect(() => readJsonSync('/nonexistent/file.json')).toThrow()
  })

  it('should return undefined when throws is false and file does not exist', () => {
    const result = readJsonSync('/nonexistent/file.json', { throws: false })
    expect(result).toBeUndefined()
  })

  it('should throw by default for invalid JSON', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'invalid.json')
      await fs.writeFile(testFile, 'not valid json', 'utf8')

      expect(() => readJsonSync(testFile)).toThrow()
    }, 'readJsonSync-invalid-')
  })

  it('should return undefined when throws is false and JSON is invalid', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'invalid.json')
      await fs.writeFile(testFile, 'not valid json', 'utf8')

      const result = readJsonSync(testFile, { throws: false })
      expect(result).toBeUndefined()
    }, 'readJsonSync-invalid-no-throw-')
  })

  if (process.platform !== 'win32') {
    it('should throw "Permission denied" on EACCES', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'no-read.json')
        await fs.writeFile(testFile, '{"x":1}', 'utf8')
        await fs.chmod(testFile, 0o000)
        try {
          expect(() => readJsonSync(testFile)).toThrow(/Permission denied/)
        } finally {
          // Restore so cleanup can proceed.
          await fs.chmod(testFile, 0o644)
        }
      }, 'readJsonSync-eacces-')
    })
  }
})

if (process.platform !== 'win32') {
  describe('readJson — permission errors', () => {
    it('should throw "Permission denied" on EACCES (async)', async () => {
      await runWithTempDir(async tmpDir => {
        const testFile = path.join(tmpDir, 'no-read.json')
        await fs.writeFile(testFile, '{"x":1}', 'utf8')
        await fs.chmod(testFile, 0o000)
        try {
          await expect(readJson(testFile)).rejects.toThrow(
            /Permission denied/,
          )
        } finally {
          await fs.chmod(testFile, 0o644)
        }
      }, 'readJson-eacces-')
    })
  })
}
