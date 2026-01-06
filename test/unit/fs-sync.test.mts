/**
 * @fileoverview Tests for synchronous fs utilities.
 *
 * Tests sync fs functions:
 * - isSymLinkSync() for checking symlinks synchronously
 * - readJsonSync() for reading JSON files synchronously
 * - writeJsonSync() for writing JSON files synchronously
 * - safeReadFileSync() for safe file reading synchronously
 * - safeStatsSync() for safe stat calls synchronously
 * - readFileBinary() for reading binary files
 */

import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  isSymLinkSync,
  readFileBinary,
  readJsonSync,
  safeReadFileSync,
  safeStatsSync,
  writeJsonSync,
} from '@socketsecurity/lib/fs'
import { beforeEach, describe, expect, it, afterEach } from 'vitest'

describe.sequential('fs - Sync Functions', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `socket-lib-test-${randomUUID()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('isSymLinkSync', () => {
    it('should return true for symlinks', () => {
      const targetFile = join(testDir, 'target.txt')
      const linkFile = join(testDir, 'link.txt')

      writeFileSync(targetFile, 'content')
      symlinkSync(targetFile, linkFile)

      expect(isSymLinkSync(linkFile)).toBe(true)
    })

    it('should return false for regular files', () => {
      const regularFile = join(testDir, 'regular.txt')
      writeFileSync(regularFile, 'content')

      expect(isSymLinkSync(regularFile)).toBe(false)
    })

    it('should return false for non-existent files', () => {
      const nonExistent = join(testDir, 'does-not-exist.txt')
      expect(isSymLinkSync(nonExistent)).toBe(false)
    })

    it('should return false for directories', () => {
      const subDir = join(testDir, 'subdir')
      mkdirSync(subDir)

      expect(isSymLinkSync(subDir)).toBe(false)
    })
  })

  describe('readJsonSync', () => {
    it('should read valid JSON file', () => {
      const jsonFile = join(testDir, 'data.json')
      const data = { name: 'test', value: 42 }

      writeFileSync(jsonFile, JSON.stringify(data))

      const result = readJsonSync(jsonFile)
      expect(result).toEqual(data)
    })

    it('should handle JSON with arrays', () => {
      const jsonFile = join(testDir, 'array.json')
      const data = [1, 2, 3, 4, 5]

      writeFileSync(jsonFile, JSON.stringify(data))

      const result = readJsonSync(jsonFile)
      expect(result).toEqual(data)
    })

    it('should handle nested JSON objects', () => {
      const jsonFile = join(testDir, 'nested.json')
      const data = { outer: { inner: { value: 'nested' } } }

      writeFileSync(jsonFile, JSON.stringify(data))

      const result = readJsonSync(jsonFile)
      expect(result).toEqual(data)
    })

    it('should throw for invalid JSON', () => {
      const jsonFile = join(testDir, 'invalid.json')
      writeFileSync(jsonFile, '{invalid json}')

      expect(() => readJsonSync(jsonFile)).toThrow()
    })

    it('should throw for non-existent files', () => {
      const nonExistent = join(testDir, 'missing.json')
      expect(() => readJsonSync(nonExistent)).toThrow()
    })
  })

  describe('writeJsonSync', () => {
    it('should write JSON file', () => {
      const jsonFile = join(testDir, 'output.json')
      const data = { test: 'value', number: 123 }

      writeJsonSync(jsonFile, data)

      expect(existsSync(jsonFile)).toBe(true)
      const written = readJsonSync(jsonFile)
      expect(written).toEqual(data)
    })

    it('should write array JSON', () => {
      const jsonFile = join(testDir, 'array-output.json')
      const data = ['a', 'b', 'c']

      writeJsonSync(jsonFile, data)

      const written = readJsonSync(jsonFile)
      expect(written).toEqual(data)
    })

    it('should overwrite existing files', () => {
      const jsonFile = join(testDir, 'overwrite.json')

      writeJsonSync(jsonFile, { first: 1 })
      writeJsonSync(jsonFile, { second: 2 })

      const written = readJsonSync(jsonFile)
      expect(written).toEqual({ second: 2 })
    })

    it('should handle nested objects', () => {
      const jsonFile = join(testDir, 'nested-output.json')
      const data = { a: { b: { c: 'deep' } } }

      writeJsonSync(jsonFile, data)

      const written = readJsonSync(jsonFile)
      expect(written).toEqual(data)
    })
  })

  describe('readFileBinary', () => {
    it('should read binary file as Buffer', async () => {
      const binFile = join(testDir, 'binary.bin')
      const data = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff])

      writeFileSync(binFile, data)

      const result = await readFileBinary(binFile)
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result).toEqual(data)
    })

    it('should read empty binary file', async () => {
      const binFile = join(testDir, 'empty.bin')
      writeFileSync(binFile, Buffer.alloc(0))

      const result = await readFileBinary(binFile)
      expect(result.length).toBe(0)
    })

    it('should read large binary file', async () => {
      const binFile = join(testDir, 'large.bin')
      const data = Buffer.alloc(1024 * 10, 0xab)

      writeFileSync(binFile, data)

      const result = await readFileBinary(binFile)
      expect(result.length).toBe(data.length)
    })

    it('should reject for non-existent files', async () => {
      const nonExistent = join(testDir, 'missing.bin')
      await expect(readFileBinary(nonExistent)).rejects.toThrow()
    })
  })

  describe('safeReadFileSync', () => {
    it('should read existing file as utf8 string by default', () => {
      const file = join(testDir, 'safe-read.txt')
      writeFileSync(file, 'safe content')

      const result = safeReadFileSync(file)
      expect(typeof result).toBe('string')
      expect(result).toBe('safe content')
    })

    it('should return undefined for non-existent files', () => {
      const nonExistent = join(testDir, 'does-not-exist.txt')
      const result = safeReadFileSync(nonExistent)
      expect(result).toBeUndefined()
    })

    it('should read empty files', () => {
      const emptyFile = join(testDir, 'empty.txt')
      writeFileSync(emptyFile, '')

      const result = safeReadFileSync(emptyFile)
      expect(typeof result).toBe('string')
      expect(result).toBe('')
    })

    it('should read files with special characters', () => {
      const file = join(testDir, 'special.txt')
      const content = 'Special: \n\t\r漢字'

      writeFileSync(file, content)

      const result = safeReadFileSync(file)
      expect(typeof result).toBe('string')
      expect(result).toBe(content)
    })

    it('should read as buffer when encoding is explicitly null', () => {
      const file = join(testDir, 'buffer-read.txt')
      const content = 'buffer content'
      writeFileSync(file, content)

      const result = safeReadFileSync(file, { encoding: null })
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result?.toString()).toBe(content)
    })
  })

  describe('safeStatsSync', () => {
    it('should return stats for existing file', () => {
      const file = join(testDir, 'stats.txt')
      writeFileSync(file, 'content')

      const stats = safeStatsSync(file)
      expect(stats).toBeDefined()
      expect(stats?.isFile()).toBe(true)
    })

    it('should return stats for directory', () => {
      const dir = join(testDir, 'stats-dir')
      mkdirSync(dir)

      const stats = safeStatsSync(dir)
      expect(stats).toBeDefined()
      expect(stats?.isDirectory()).toBe(true)
    })

    it('should return undefined for non-existent paths', () => {
      const nonExistent = join(testDir, 'no-stats.txt')
      const stats = safeStatsSync(nonExistent)
      expect(stats).toBeUndefined()
    })

    it('should return stats for symlinks', () => {
      const targetFile = join(testDir, 'stats-target.txt')
      const linkFile = join(testDir, 'stats-link.txt')

      writeFileSync(targetFile, 'content')
      symlinkSync(targetFile, linkFile)

      const stats = safeStatsSync(linkFile)
      expect(stats).toBeDefined()
      expect(stats?.isSymbolicLink()).toBe(false) // follows link by default
      expect(stats?.isFile()).toBe(true)
    })
  })

  describe('integration', () => {
    it('should work with writeJsonSync and readJsonSync together', () => {
      const jsonFile = join(testDir, 'roundtrip.json')
      const data = {
        string: 'value',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { nested: 'value' },
      }

      writeJsonSync(jsonFile, data)
      const result = readJsonSync(jsonFile)

      expect(result).toEqual(data)
    })

    it('should handle multiple file operations', () => {
      const file1 = join(testDir, 'multi1.txt')
      const file2 = join(testDir, 'multi2.txt')
      const file3 = join(testDir, 'multi3.txt')

      writeFileSync(file1, 'content1')
      writeFileSync(file2, 'content2')

      expect(safeReadFileSync(file1)).toBe('content1')
      expect(safeReadFileSync(file2)).toBe('content2')
      expect(safeReadFileSync(file3)).toBeUndefined()

      expect(safeStatsSync(file1)?.isFile()).toBe(true)
      expect(safeStatsSync(file2)?.isFile()).toBe(true)
      expect(safeStatsSync(file3)).toBeUndefined()
    })
  })
})
