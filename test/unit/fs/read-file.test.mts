/**
 * @file Unit tests for src/fs/read-file — readFileBinary/Sync, readFileUtf8/Sync,
 *   safeReadFile/Sync, and their defaultValue variants. Split out of the
 *   historical monolithic test/unit/fs.test.mts to keep each test file under
 *   the fleet's 500-line soft cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  readFileBinary,
  readFileBinarySync,
  readFileUtf8,
  readFileUtf8Sync,
  safeReadFile,
  safeReadFileSync,
} from '../../../src/fs/read-file'

import { runWithTempDir } from '../util/temp-file-helper'

import type { SafeReadOptions } from '../../../src/fs/types'

describe('readFileBinary', () => {
  it('should read file as binary buffer', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'binary.dat')
      const testData = Buffer.from([0x00, 0x01, 0x02, 0x03])
      await fs.writeFile(testFile, testData)

      const result = await readFileBinary(testFile)
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result).toEqual(testData)
    }, 'readFileBinary-basic-')
  })

  it('should throw for non-existent files', async () => {
    await expect(readFileBinary('/nonexistent/file.dat')).rejects.toThrow()
  })
})

describe('readFileBinarySync', () => {
  it('should read file as binary buffer', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'binary.dat')
      const testData = Buffer.from([0x00, 0x01, 0x02, 0x03])
      await fs.writeFile(testFile, testData)

      const result = readFileBinarySync(testFile)
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result).toEqual(testData)
    }, 'readFileBinarySync-basic-')
  })

  it('should throw for non-existent files', () => {
    expect(() => readFileBinarySync('/nonexistent/file.dat')).toThrow()
  })
})

describe('readFileUtf8', () => {
  it('should read file as UTF-8 string', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'text.txt')
      const testContent = 'Hello, World!'
      await fs.writeFile(testFile, testContent, 'utf8')

      const result = await readFileUtf8(testFile)
      expect(result).toBe(testContent)
    }, 'readFileUtf8-basic-')
  })

  it('should handle unicode content', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'unicode.txt')
      const testContent = 'Hello, 世界! 🌍'
      await fs.writeFile(testFile, testContent, 'utf8')

      const result = await readFileUtf8(testFile)
      expect(result).toBe(testContent)
    }, 'readFileUtf8-unicode-')
  })

  it('should throw for non-existent files', async () => {
    await expect(readFileUtf8('/nonexistent/file.txt')).rejects.toThrow()
  })
})

describe('readFileUtf8Sync', () => {
  it('should read file as UTF-8 string', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'text.txt')
      const testContent = 'Hello, World!'
      await fs.writeFile(testFile, testContent, 'utf8')

      const result = readFileUtf8Sync(testFile)
      expect(result).toBe(testContent)
    }, 'readFileUtf8Sync-basic-')
  })

  it('should handle unicode content', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'unicode.txt')
      const testContent = 'Hello, 世界! 🌍'
      await fs.writeFile(testFile, testContent, 'utf8')

      const result = readFileUtf8Sync(testFile)
      expect(result).toBe(testContent)
    }, 'readFileUtf8Sync-unicode-')
  })

  it('should throw for non-existent files', () => {
    expect(() => readFileUtf8Sync('/nonexistent/file.txt')).toThrow()
  })
})

describe('safeReadFile', () => {
  it('should read existing file with explicit encoding', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'test.txt')
      const testContent = 'test content'
      await fs.writeFile(testFile, testContent, 'utf8')

      const result = await safeReadFile(testFile, { encoding: 'utf8' })
      expect(result).toBe(testContent)
    }, 'safeReadFile-exists-')
  })

  it('should return undefined for non-existent files', async () => {
    const result = await safeReadFile('/nonexistent/file.txt')
    expect(result).toBeUndefined()
  })

  it('should read as utf8 string by default when no encoding specified', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'text.txt')
      const testContent = 'default encoding test'
      await fs.writeFile(testFile, testContent, 'utf8')

      const result = await safeReadFile(testFile)
      expect(typeof result).toBe('string')
      expect(result).toBe(testContent)
    }, 'safeReadFile-default-')
  })

  it('should read as buffer when encoding is explicitly null', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'binary.dat')
      const testData = Buffer.from([0x01, 0x02, 0x03])
      await fs.writeFile(testFile, testData)

      const result = await safeReadFile(testFile, {
        // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node fs API: `null` encoding returns Buffer; `undefined` defaults to utf-8.
        encoding: null,
      } as unknown as SafeReadOptions & { encoding: null })
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result).toEqual(testData)
    }, 'safeReadFile-buffer-')
  })
})

describe('safeReadFileSync', () => {
  it('should read existing file with explicit encoding', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'test.txt')
      const testContent = 'test content'
      await fs.writeFile(testFile, testContent, 'utf8')

      const result = safeReadFileSync(testFile, { encoding: 'utf8' })
      expect(result).toBe(testContent)
    }, 'safeReadFileSync-exists-')
  })

  it('should return undefined for non-existent files', () => {
    const result = safeReadFileSync('/nonexistent/file.txt')
    expect(result).toBeUndefined()
  })

  it('should read as utf8 string by default when no encoding specified', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'text.txt')
      const testContent = 'default encoding test'
      await fs.writeFile(testFile, testContent, 'utf8')

      const result = safeReadFileSync(testFile)
      expect(typeof result).toBe('string')
      expect(result).toBe(testContent)
    }, 'safeReadFileSync-default-')
  })

  it('should read as buffer when encoding is explicitly null', async () => {
    await runWithTempDir(async tmpDir => {
      const testFile = path.join(tmpDir, 'binary.dat')
      const testData = Buffer.from([0x01, 0x02, 0x03])
      await fs.writeFile(testFile, testData)

      const result = safeReadFileSync(testFile, {
        // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node fs API: `null` encoding returns Buffer; `undefined` defaults to utf-8.
        encoding: null,
      } as unknown as SafeReadOptions & { encoding: null })
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result).toEqual(testData)
    }, 'safeReadFileSync-buffer-')
  })
})

describe('safeReadFileSync with defaultValue', () => {
  it('should return defaultValue for non-existent files with string default', () => {
    const result = safeReadFileSync('/nonexistent/file.txt', {
      defaultValue: 'default content',
    })
    expect(result).toBe('default content')
  })

  it('should return defaultValue as Buffer when encoding is null and defaultValue is Buffer', async () => {
    const defaultBuffer = Buffer.from('default')
    const result = safeReadFileSync('/nonexistent/file.bin', {
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node fs API: `null` encoding returns Buffer; `undefined` defaults to utf-8.
      encoding: null,
      defaultValue: defaultBuffer,
    } as unknown as SafeReadOptions & { encoding: null })
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result).toBe(defaultBuffer)
  })

  it('should return undefined when encoding is null and defaultValue is not a Buffer', () => {
    const result = safeReadFileSync('/nonexistent/file.bin', {
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node fs API: `null` encoding returns Buffer; `undefined` defaults to utf-8.
      encoding: null,
      defaultValue: 'not a buffer',
    } as unknown as SafeReadOptions & { encoding: null })
    expect(result).toBeUndefined()
  })

  it('should convert non-string defaultValue to string when encoding is set', () => {
    const result = safeReadFileSync('/nonexistent/file.txt', {
      encoding: 'utf8',
      defaultValue: 123,
    })
    expect(result).toBe('123')
  })
})

describe('safeReadFile with defaultValue', () => {
  it('should return defaultValue for non-existent files with string default', async () => {
    const result = await safeReadFile('/nonexistent/file.txt', {
      defaultValue: 'default content',
    })
    expect(result).toBe('default content')
  })

  it('should return defaultValue as Buffer when encoding is null and defaultValue is Buffer', async () => {
    const defaultBuffer = Buffer.from('default')
    const result = await safeReadFile('/nonexistent/file.bin', {
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node fs API: `null` encoding returns Buffer; `undefined` defaults to utf-8.
      encoding: null,
      defaultValue: defaultBuffer,
    } as unknown as SafeReadOptions & { encoding: null })
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result).toBe(defaultBuffer)
  })

  it('should return undefined when encoding is null and defaultValue is not a Buffer', async () => {
    const result = await safeReadFile('/nonexistent/file.bin', {
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node fs API: `null` encoding returns Buffer; `undefined` defaults to utf-8.
      encoding: null,
      defaultValue: 'not a buffer',
    } as unknown as SafeReadOptions & { encoding: null })
    expect(result).toBeUndefined()
  })

  it('should convert non-string defaultValue to string when encoding is set', async () => {
    const result = await safeReadFile('/nonexistent/file.txt', {
      encoding: 'utf8',
      defaultValue: 456,
    })
    expect(result).toBe('456')
  })
})
