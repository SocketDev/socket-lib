/**
 * @file Unit tests for the brotli compression helpers. Covers all three calling
 *   shapes:
 *
 *   1. In-memory (Buffer/string round-trip)
 *   2. File-to-file (stream pipeline)
 *   3. Raw transform stream (composition) Plus brotli detection (magic bytes,
 *      filename extensions), the replace-in-place wrappers, and
 *      resolveBrotliOptions. The gzip counterparts and the shared cross-format
 *      / stripExt coverage live in compression-gzip.test.mts.
 */

import { Buffer } from 'node:buffer'
import { mkdtempSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { constants as zlibConstants } from 'node:zlib'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  BROTLI_EXTS,
  compressBrotli,
  compressBrotliFile,
  createBrotliCompressor,
  createBrotliDecompressor,
  decompressBrotli,
  decompressBrotliFile,
  hasBrotliExt,
  isBrotliCompressed,
  resolveBrotliOptions,
} from '../../src/compression/brotli'
import { compressGzip } from '../../src/compression/gzip'
import { safeDelete } from '../../src/fs/safe'
import {
  LARGE_TEXT,
  SMALL_TEXT,
  streamToBuffer,
} from './compression-fixtures.mts'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'compression-test-'))
})

afterEach(async () => {
  await safeDelete(tmpDir)
})

// Tests share a module-scoped `tmpDir` set up in `beforeEach`. Vitest's
// `sequence.concurrent` setting (true locally) would otherwise run tests
// in parallel, racing the tmpDir mutation. `describe.sequential` keeps
// the file's tests sequential regardless of the global setting — file
// IO tests want one-at-a-time semantics anyway.
describe.sequential('compression — brotli', () => {
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

    // Brotli level-11 on a 1 MB fixture is CPU-bound and can exceed the
    // default 5s vitest timeout on slower runners — bump to 30s. The
    // streaming-path / smaller-input tests stay on the default budget.
    it('produces a smaller output for highly compressible input', async () => {
      const compressed = await compressBrotli(LARGE_TEXT)
      // Repeating JSON should compress to a small fraction of original
      expect(compressed.byteLength).toBeLessThan(LARGE_TEXT.length / 5)
    }, 30_000)

    it('honors the level option (lower level → larger output)', async () => {
      const fast = await compressBrotli(LARGE_TEXT, { level: 1 })
      const max = await compressBrotli(LARGE_TEXT, { level: 11 })
      // Level 11 should be at least as small as level 1
      expect(max.byteLength).toBeLessThanOrEqual(fast.byteLength)
    }, 30_000)

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

    it('honors an explicit size hint without overwriting it', async () => {
      // Caller-supplied { size } shouldn't be replaced by buf.byteLength.
      // Round-trips correctly regardless of the hint value.
      const compressed = await compressBrotli(SMALL_TEXT, { size: 4096 })
      const decompressed = await decompressBrotli(compressed)
      expect(decompressed.toString('utf8')).toBe(SMALL_TEXT)
    })
  })

  describe('brotli — file-to-file', () => {
    it('round-trips a file through compressBrotliFile + decompressBrotliFile', async () => {
      const srcPath = path.join(tmpDir, 'input.txt')
      const compressedPath = path.join(tmpDir, 'input.txt.br')
      const restoredPath = path.join(tmpDir, 'restored.txt')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')

      await compressBrotliFile(srcPath, compressedPath)
      // oxlint-disable-next-line socket/prefer-exists-sync -- needs the byte size, not just existence.
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
        write(chunk: Buffer, enc, cb) {
          void enc
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

  describe('brotli — detection', () => {
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

    it('hasBrotliExt matches .br and .brotli (case-insensitive)', () => {
      expect(hasBrotliExt('foo.br')).toBe(true)
      expect(hasBrotliExt('foo.brotli')).toBe(true)
      expect(hasBrotliExt('foo.BR')).toBe(true)
      expect(hasBrotliExt('foo.Brotli')).toBe(true)
      expect(hasBrotliExt('path/to/foo.json.br')).toBe(true)
    })

    it('hasBrotliExt rejects non-brotli extensions', () => {
      expect(hasBrotliExt('foo.gz')).toBe(false)
      expect(hasBrotliExt('foo.json')).toBe(false)
      expect(hasBrotliExt('foo')).toBe(false)
      expect(hasBrotliExt('foo.brz')).toBe(false)
    })

    it('BROTLI_EXTS contains the canonical brotli suffixes', () => {
      expect(BROTLI_EXTS.has('.br')).toBe(true)
      expect(BROTLI_EXTS.has('.brotli')).toBe(true)
      expect(BROTLI_EXTS.has('.gz')).toBe(false)
    })

    it('hasBrotliExt agrees with BROTLI_EXTS membership (case-folded)', () => {
      for (const ext of BROTLI_EXTS) {
        expect(hasBrotliExt(`foo${ext}`)).toBe(true)
        expect(hasBrotliExt(`foo${ext.toUpperCase()}`)).toBe(true)
      }
    })
  })

  describe('brotli — inPlace option', () => {
    it('compressBrotliFile { inPlace: true } writes .br and removes original', async () => {
      const srcPath = path.join(tmpDir, 'data.json')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')

      const newPath = await compressBrotliFile(srcPath, { inPlace: true })
      expect(newPath).toBe(`${srcPath}.br`)

      // Original should be gone, .br should exist
      // oxlint-disable-next-line socket/prefer-exists-sync -- asserts the original was unlinked via the raw fs.access rejection, not a lib wrapper.
      await expect(fs.access(srcPath)).rejects.toThrow()
      const compressed = await fs.readFile(newPath)
      const restored = await decompressBrotli(compressed)
      expect(restored.toString('utf8')).toBe(LARGE_TEXT)
    })

    it('decompressBrotliFile { inPlace: true } strips .br and removes the .br file', async () => {
      const originalPath = path.join(tmpDir, 'data.json')
      const brPath = `${originalPath}.br`
      await fs.writeFile(originalPath, LARGE_TEXT, 'utf8')
      await compressBrotliFile(originalPath, { inPlace: true })

      const restoredPath = await decompressBrotliFile(brPath, { inPlace: true })
      expect(restoredPath).toBe(originalPath)

      // oxlint-disable-next-line socket/prefer-exists-sync -- asserts the .br file was unlinked via the raw fs.access rejection, not a lib wrapper.
      await expect(fs.access(brPath)).rejects.toThrow()
      const restored = await fs.readFile(restoredPath, 'utf8')
      expect(restored).toBe(LARGE_TEXT)
    })

    it('decompressBrotliFile { inPlace: true } rejects files without .br/.brotli extension', async () => {
      const p = path.join(tmpDir, 'no-extension')
      await fs.writeFile(p, 'data', 'utf8')
      await expect(decompressBrotliFile(p, { inPlace: true })).rejects.toThrow(
        /no \.br\/\.brotli extension/,
      )
    })

    it('decompressBrotliFile { inPlace: true } handles .brotli suffix too', async () => {
      const originalPath = path.join(tmpDir, 'data.txt')
      const brotliPath = `${originalPath}.brotli`
      await fs.writeFile(originalPath, SMALL_TEXT, 'utf8')
      await compressBrotliFile(originalPath, brotliPath)
      await safeDelete(originalPath)

      const restoredPath = await decompressBrotliFile(brotliPath, {
        inPlace: true,
      })
      expect(restoredPath).toBe(originalPath)
      const restored = await fs.readFile(restoredPath, 'utf8')
      expect(restored).toBe(SMALL_TEXT)
    })

    it('compressBrotliFile { inPlace: true } honors level option', async () => {
      const srcPath = path.join(tmpDir, 'level.txt')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')
      const destPath = await compressBrotliFile(srcPath, {
        inPlace: true,
        level: 1,
      })
      expect(destPath).toBe(`${srcPath}.br`)
      const restored = await decompressBrotli(await fs.readFile(destPath))
      expect(restored.toString('utf8')).toBe(LARGE_TEXT)
    })

    it('compressBrotliFile without dest or inPlace throws', async () => {
      const srcPath = path.join(tmpDir, 'lonely.txt')
      await fs.writeFile(srcPath, 'data', 'utf8')
      // @ts-expect-error testing the bad-args case
      await expect(compressBrotliFile(srcPath)).rejects.toThrow(
        /missing destPath/,
      )
    })

    it('returns the destination path from explicit (src, dest)', async () => {
      const srcPath = path.join(tmpDir, 'src.txt')
      const destPath = path.join(tmpDir, 'dest.br')
      await fs.writeFile(srcPath, SMALL_TEXT, 'utf8')
      const result = await compressBrotliFile(srcPath, destPath)
      expect(result).toBe(destPath)
      // Source should still be there (not inPlace)
      // oxlint-disable-next-line socket/prefer-exists-sync -- needs the byte size, not just existence.
      expect((await fs.stat(srcPath)).size).toBeGreaterThan(0)
    })
  })

  describe('decompressBrotli — negative cases', () => {
    it('decompressBrotli rejects gzip-compressed input', async () => {
      const gz = await compressGzip(SMALL_TEXT)
      await expect(decompressBrotli(gz)).rejects.toThrow()
    })

    it('decompressBrotli rejects garbage input', async () => {
      await expect(
        decompressBrotli(Buffer.from('not actually compressed')),
      ).rejects.toThrow()
    })
  })

  describe('resolveBrotliOptions', () => {
    it('defaults level to 11 when no options given', () => {
      const opts = resolveBrotliOptions(undefined)
      const params = opts.params as Record<number, number>
      expect(params[zlibConstants.BROTLI_PARAM_QUALITY]).toBe(11)
    })

    it('honors an explicit level', () => {
      const opts = resolveBrotliOptions({ level: 4 })
      const params = opts.params as Record<number, number>
      expect(params[zlibConstants.BROTLI_PARAM_QUALITY]).toBe(4)
    })

    it('forwards a positive size hint as BROTLI_PARAM_SIZE_HINT', () => {
      const opts = resolveBrotliOptions({ size: 1234 })
      const params = opts.params as Record<number, number>
      expect(params[zlibConstants.BROTLI_PARAM_SIZE_HINT]).toBe(1234)
    })

    it('omits the size hint when size is zero or negative', () => {
      const zero = resolveBrotliOptions({ size: 0 })
      const neg = resolveBrotliOptions({ size: -5 })
      const zeroParams = zero.params as Record<number, number | undefined>
      const negParams = neg.params as Record<number, number | undefined>
      expect(zeroParams[zlibConstants.BROTLI_PARAM_SIZE_HINT]).toBeUndefined()
      expect(negParams[zlibConstants.BROTLI_PARAM_SIZE_HINT]).toBeUndefined()
    })

    it('combines level + size in one call', () => {
      const opts = resolveBrotliOptions({ level: 3, size: 999 })
      const params = opts.params as Record<number, number>
      expect(params[zlibConstants.BROTLI_PARAM_QUALITY]).toBe(3)
      expect(params[zlibConstants.BROTLI_PARAM_SIZE_HINT]).toBe(999)
    })
  })
})
