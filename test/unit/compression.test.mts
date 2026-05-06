/**
 * @fileoverview Unit tests for compression helpers (brotli + gzip).
 *
 * Covers all three calling shapes:
 *   1. In-memory (Buffer/string round-trip)
 *   2. File-to-file (stream pipeline)
 *   3. Raw transform stream (composition)
 *
 * Plus detection helpers (magic bytes, filename extensions) and the
 * replace-in-place wrappers.
 */

import { Buffer } from 'node:buffer'
import { mkdtempSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  compressBrotli,
  compressBrotliFile,
  compressBrotliInPlace,
  compressGzip,
  compressGzipFile,
  createBrotliCompressor,
  createBrotliDecompressor,
  createGzipCompressor,
  createGzipDecompressor,
  decompressBrotli,
  decompressBrotliFile,
  decompressBrotliInPlace,
  decompressGzip,
  decompressGzipFile,
  hasBrotliExtension,
  hasGzipExtension,
  isBrotliCompressed,
  isGzipCompressed,
} from '../../src/compression'

// Two fixture sizes:
//   - small: a few hundred bytes — exercises the in-memory path
//   - large: ~1 MB of repeating JSON — exercises the streaming path
//     and lets us verify the compressed size is meaningfully smaller
const SMALL_TEXT = 'The quick brown fox jumps over the lazy dog. '.repeat(20)
const LARGE_TEXT = JSON.stringify({
  items: Array.from({ length: 5000 }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    description: `A description of item ${i} with some repeated text to compress well`,
    tags: ['alpha', 'beta', 'gamma', 'delta'],
  })),
})

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'compression-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

describe('compression', () => {
  describe('brotli — in-memory', () => {
    it('round-trips a string through compressBrotli + decompressBrotli', async () => {
      const compressed = await compressBrotli(SMALL_TEXT)
      expect(Buffer.isBuffer(compressed)).toBe(true)
      const decompressed = await decompressBrotli(compressed)
      expect(decompressed.toString('utf8')).toBe(SMALL_TEXT)
    })

    it('round-trips a Buffer through compressBrotli + decompressBrotli', async () => {
      const input = Buffer.from(SMALL_TEXT, 'utf8')
      const compressed = await compressBrotli(input)
      const decompressed = await decompressBrotli(compressed)
      expect(decompressed.equals(input)).toBe(true)
    })

    it('produces a smaller output for highly compressible input', async () => {
      const compressed = await compressBrotli(LARGE_TEXT)
      // Repeating JSON should compress to a small fraction of original
      expect(compressed.byteLength).toBeLessThan(LARGE_TEXT.length / 5)
    })

    it('honors the level option (lower level → larger output)', async () => {
      const fast = await compressBrotli(LARGE_TEXT, { level: 1 })
      const max = await compressBrotli(LARGE_TEXT, { level: 11 })
      // Level 11 should be at least as small as level 1
      expect(max.byteLength).toBeLessThanOrEqual(fast.byteLength)
    })

    it('handles empty input', async () => {
      const compressed = await compressBrotli('')
      const decompressed = await decompressBrotli(compressed)
      expect(decompressed.toString('utf8')).toBe('')
    })

    it('preserves non-ASCII content', async () => {
      const utf8 = '日本語 — émojis 🎉 — ščř'
      const compressed = await compressBrotli(utf8)
      const decompressed = await decompressBrotli(compressed)
      expect(decompressed.toString('utf8')).toBe(utf8)
    })
  })

  describe('brotli — file-to-file', () => {
    it('round-trips a file through compressBrotliFile + decompressBrotliFile', async () => {
      const srcPath = path.join(tmpDir, 'input.txt')
      const compressedPath = path.join(tmpDir, 'input.txt.br')
      const restoredPath = path.join(tmpDir, 'restored.txt')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')

      await compressBrotliFile(srcPath, compressedPath)
      const compressedSize = (await fs.stat(compressedPath)).size
      expect(compressedSize).toBeLessThan(LARGE_TEXT.length)

      await decompressBrotliFile(compressedPath, restoredPath)
      const restored = await fs.readFile(restoredPath, 'utf8')
      expect(restored).toBe(LARGE_TEXT)
    })

    it('rejects when src and dest are the same path', async () => {
      const p = path.join(tmpDir, 'same.txt')
      await fs.writeFile(p, 'data', 'utf8')
      await expect(compressBrotliFile(p, p)).rejects.toThrow(
        /srcPath and destPath must differ/,
      )
      await expect(decompressBrotliFile(p, p)).rejects.toThrow(
        /srcPath and destPath must differ/,
      )
    })

    it('propagates errors when src is missing', async () => {
      const missing = path.join(tmpDir, 'does-not-exist.txt')
      const dest = path.join(tmpDir, 'dest.br')
      await expect(compressBrotliFile(missing, dest)).rejects.toThrow()
    })
  })

  describe('brotli — raw transform stream', () => {
    it('createBrotliCompressor + createBrotliDecompressor compose in a pipeline', async () => {
      const input = Buffer.from(LARGE_TEXT, 'utf8')
      const compressed = await streamToBuffer(
        Readable.from([input]).pipe(createBrotliCompressor()),
      )
      const restored = await streamToBuffer(
        Readable.from([compressed]).pipe(createBrotliDecompressor()),
      )
      expect(restored.toString('utf8')).toBe(LARGE_TEXT)
    })

    it('honors the level option on the transform', async () => {
      const input = Buffer.from(LARGE_TEXT, 'utf8')
      const compressed = await streamToBuffer(
        Readable.from([input]).pipe(createBrotliCompressor({ level: 1 })),
      )
      // Confirm we got *something*; level 1 should still compress
      // repeating JSON to noticeably less than the original.
      expect(compressed.byteLength).toBeLessThan(input.byteLength)
    })

    it('writes are routable through writable destinations', async () => {
      const chunks: Buffer[] = []
      const sink = new Writable({
        write(chunk: Buffer, _enc, cb) {
          chunks.push(chunk)
          cb()
        },
      })
      await pipeline(
        Readable.from([Buffer.from(SMALL_TEXT, 'utf8')]),
        createBrotliCompressor(),
        sink,
      )
      const compressed = Buffer.concat(chunks)
      const restored = await decompressBrotli(compressed)
      expect(restored.toString('utf8')).toBe(SMALL_TEXT)
    })
  })

  describe('gzip — in-memory', () => {
    it('round-trips a string through compressGzip + decompressGzip', async () => {
      const compressed = await compressGzip(SMALL_TEXT)
      const decompressed = await decompressGzip(compressed)
      expect(decompressed.toString('utf8')).toBe(SMALL_TEXT)
    })

    it('round-trips a Buffer through compressGzip + decompressGzip', async () => {
      const input = Buffer.from(SMALL_TEXT, 'utf8')
      const compressed = await compressGzip(input)
      const decompressed = await decompressGzip(compressed)
      expect(decompressed.equals(input)).toBe(true)
    })

    it('honors the level option', async () => {
      const fast = await compressGzip(LARGE_TEXT, { level: 1 })
      const max = await compressGzip(LARGE_TEXT, { level: 9 })
      expect(max.byteLength).toBeLessThanOrEqual(fast.byteLength)
    })

    it('handles empty input', async () => {
      const compressed = await compressGzip('')
      const decompressed = await decompressGzip(compressed)
      expect(decompressed.toString('utf8')).toBe('')
    })
  })

  describe('gzip — file-to-file', () => {
    it('round-trips a file through compressGzipFile + decompressGzipFile', async () => {
      const srcPath = path.join(tmpDir, 'input.txt')
      const compressedPath = path.join(tmpDir, 'input.txt.gz')
      const restoredPath = path.join(tmpDir, 'restored.txt')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')

      await compressGzipFile(srcPath, compressedPath)
      const compressedSize = (await fs.stat(compressedPath)).size
      expect(compressedSize).toBeLessThan(LARGE_TEXT.length)

      await decompressGzipFile(compressedPath, restoredPath)
      const restored = await fs.readFile(restoredPath, 'utf8')
      expect(restored).toBe(LARGE_TEXT)
    })

    it('rejects when src and dest are the same path', async () => {
      const p = path.join(tmpDir, 'same.txt')
      await fs.writeFile(p, 'data', 'utf8')
      await expect(compressGzipFile(p, p)).rejects.toThrow(
        /srcPath and destPath must differ/,
      )
      await expect(decompressGzipFile(p, p)).rejects.toThrow(
        /srcPath and destPath must differ/,
      )
    })
  })

  describe('gzip — raw transform stream', () => {
    it('createGzipCompressor + createGzipDecompressor compose', async () => {
      const input = Buffer.from(LARGE_TEXT, 'utf8')
      const compressed = await streamToBuffer(
        Readable.from([input]).pipe(createGzipCompressor()),
      )
      const restored = await streamToBuffer(
        Readable.from([compressed]).pipe(createGzipDecompressor()),
      )
      expect(restored.toString('utf8')).toBe(LARGE_TEXT)
    })
  })

  describe('detection — magic bytes', () => {
    it('isGzipCompressed detects real gzip bytes', async () => {
      const compressed = await compressGzip(SMALL_TEXT)
      expect(isGzipCompressed(compressed)).toBe(true)
    })

    it('isGzipCompressed rejects non-gzip data', () => {
      expect(isGzipCompressed(Buffer.from('plain text'))).toBe(false)
      expect(isGzipCompressed(Buffer.from([0x00, 0x00]))).toBe(false)
      expect(isGzipCompressed(Buffer.alloc(0))).toBe(false)
      expect(isGzipCompressed(Buffer.from([0x1f]))).toBe(false)
    })

    it('isGzipCompressed rejects non-Buffer inputs', () => {
      expect(isGzipCompressed('plain' as unknown as Buffer)).toBe(false)
      expect(isGzipCompressed(null as unknown as Buffer)).toBe(false)
    })

    it('isBrotliCompressed accepts buffers >= 4 bytes', async () => {
      const compressed = await compressBrotli(SMALL_TEXT)
      expect(isBrotliCompressed(compressed)).toBe(true)
      expect(isBrotliCompressed(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toBe(
        true,
      )
    })

    it('isBrotliCompressed rejects too-short buffers', () => {
      expect(isBrotliCompressed(Buffer.alloc(0))).toBe(false)
      expect(isBrotliCompressed(Buffer.from([0x00]))).toBe(false)
      expect(isBrotliCompressed(Buffer.from([0x00, 0x00, 0x00]))).toBe(false)
    })

    it('isBrotliCompressed rejects non-Buffer inputs', () => {
      expect(isBrotliCompressed('plain' as unknown as Buffer)).toBe(false)
    })
  })

  describe('detection — extensions', () => {
    it('hasBrotliExtension matches .br and .brotli (case-insensitive)', () => {
      expect(hasBrotliExtension('foo.br')).toBe(true)
      expect(hasBrotliExtension('foo.brotli')).toBe(true)
      expect(hasBrotliExtension('foo.BR')).toBe(true)
      expect(hasBrotliExtension('foo.Brotli')).toBe(true)
      expect(hasBrotliExtension('path/to/foo.json.br')).toBe(true)
    })

    it('hasBrotliExtension rejects non-brotli extensions', () => {
      expect(hasBrotliExtension('foo.gz')).toBe(false)
      expect(hasBrotliExtension('foo.json')).toBe(false)
      expect(hasBrotliExtension('foo')).toBe(false)
      expect(hasBrotliExtension('foo.brz')).toBe(false)
    })

    it('hasGzipExtension matches .gz / .gzip / .tgz (case-insensitive)', () => {
      expect(hasGzipExtension('foo.gz')).toBe(true)
      expect(hasGzipExtension('foo.gzip')).toBe(true)
      expect(hasGzipExtension('foo.tgz')).toBe(true)
      expect(hasGzipExtension('FOO.GZ')).toBe(true)
    })

    it('hasGzipExtension rejects non-gzip extensions', () => {
      expect(hasGzipExtension('foo.br')).toBe(false)
      expect(hasGzipExtension('foo.json')).toBe(false)
      expect(hasGzipExtension('foo')).toBe(false)
    })
  })

  describe('replace-in-place', () => {
    it('compressBrotliInPlace writes .br and removes original', async () => {
      const srcPath = path.join(tmpDir, 'data.json')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')

      const newPath = await compressBrotliInPlace(srcPath)
      expect(newPath).toBe(`${srcPath}.br`)

      // Original should be gone, .br should exist
      await expect(fs.access(srcPath)).rejects.toThrow()
      const compressed = await fs.readFile(newPath)
      const restored = await decompressBrotli(compressed)
      expect(restored.toString('utf8')).toBe(LARGE_TEXT)
    })

    it('decompressBrotliInPlace strips .br and removes the .br file', async () => {
      const originalPath = path.join(tmpDir, 'data.json')
      const brPath = `${originalPath}.br`
      await fs.writeFile(originalPath, LARGE_TEXT, 'utf8')
      await compressBrotliInPlace(originalPath)
      // originalPath is now gone, brPath exists

      const restoredPath = await decompressBrotliInPlace(brPath)
      expect(restoredPath).toBe(originalPath)

      // .br should be gone, restored should exist with original content
      await expect(fs.access(brPath)).rejects.toThrow()
      const restored = await fs.readFile(restoredPath, 'utf8')
      expect(restored).toBe(LARGE_TEXT)
    })

    it('decompressBrotliInPlace rejects files without .br/.brotli extension', async () => {
      const p = path.join(tmpDir, 'no-extension')
      await fs.writeFile(p, 'data', 'utf8')
      await expect(decompressBrotliInPlace(p)).rejects.toThrow(
        /no \.br\/\.brotli extension/,
      )
    })

    it('decompressBrotliInPlace handles .brotli suffix too', async () => {
      const originalPath = path.join(tmpDir, 'data.txt')
      const brotliPath = `${originalPath}.brotli`
      await fs.writeFile(originalPath, SMALL_TEXT, 'utf8')
      await compressBrotliFile(originalPath, brotliPath)
      await fs.rm(originalPath)

      const restoredPath = await decompressBrotliInPlace(brotliPath)
      expect(restoredPath).toBe(originalPath)
      const restored = await fs.readFile(restoredPath, 'utf8')
      expect(restored).toBe(SMALL_TEXT)
    })
  })

  describe('cross-format negative cases', () => {
    it('decompressBrotli rejects gzip-compressed input', async () => {
      const gz = await compressGzip(SMALL_TEXT)
      await expect(decompressBrotli(gz)).rejects.toThrow()
    })

    it('decompressGzip rejects brotli-compressed input', async () => {
      const br = await compressBrotli(SMALL_TEXT)
      await expect(decompressGzip(br)).rejects.toThrow()
    })

    it('decompressBrotli rejects garbage input', async () => {
      await expect(
        decompressBrotli(Buffer.from('not actually compressed')),
      ).rejects.toThrow()
    })
  })
})
