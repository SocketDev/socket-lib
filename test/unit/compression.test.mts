/**
 * @file Unit tests for compression helpers (brotli + gzip). Covers all three
 *   calling shapes:
 *
 *   1. In-memory (Buffer/string round-trip)
 *   2. File-to-file (stream pipeline)
 *   3. Raw transform stream (composition) Plus detection helpers (magic bytes,
 *      filename extensions) and the replace-in-place wrappers.
 */

/* oxlint-disable socket/prefer-safe-delete, socket/prefer-exists-sync -- tests verify raw fs behavior (unlink semantics, stat output) — not the lib wrappers. */

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
import {
  GZIP_EXTS,
  compressGzip,
  compressGzipFile,
  createGzipCompressor,
  createGzipDecompressor,
  decompressGzip,
  decompressGzipFile,
  hasGzipExt,
  isGzipCompressed,
  resolveGzipOptions,
} from '../../src/compression/gzip'
import { stripExt } from '../../src/compression/_internal'
import { safeDelete } from '../../src/fs/safe'

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
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'compression-test-'))
})

afterEach(async () => {
  await safeDelete(tmpDir)
})

export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// Tests share a module-scoped `tmpDir` set up in `beforeEach`. Vitest's
// `sequence.concurrent` setting (true locally) would otherwise run tests
// in parallel, racing the tmpDir mutation. `describe.sequential` keeps
// the file's tests sequential regardless of the global setting — file
// IO tests want one-at-a-time semantics anyway.
describe.sequential('compression', () => {
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
      expect(isGzipCompressed(undefined as unknown as Buffer)).toBe(false)
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

    it('hasGzipExt matches .gz / .gzip / .tgz (case-insensitive)', () => {
      expect(hasGzipExt('foo.gz')).toBe(true)
      expect(hasGzipExt('foo.gzip')).toBe(true)
      expect(hasGzipExt('foo.tgz')).toBe(true)
      expect(hasGzipExt('FOO.GZ')).toBe(true)
    })

    it('hasGzipExt rejects non-gzip extensions', () => {
      expect(hasGzipExt('foo.br')).toBe(false)
      expect(hasGzipExt('foo.json')).toBe(false)
      expect(hasGzipExt('foo')).toBe(false)
    })
  })

  describe('inPlace option', () => {
    it('compressBrotliFile { inPlace: true } writes .br and removes original', async () => {
      const srcPath = path.join(tmpDir, 'data.json')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')

      const newPath = await compressBrotliFile(srcPath, { inPlace: true })
      expect(newPath).toBe(`${srcPath}.br`)

      // Original should be gone, .br should exist
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

    it('compressGzipFile { inPlace: true } writes .gz and removes original', async () => {
      const srcPath = path.join(tmpDir, 'data.txt')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')

      const newPath = await compressGzipFile(srcPath, { inPlace: true })
      expect(newPath).toBe(`${srcPath}.gz`)

      await expect(fs.access(srcPath)).rejects.toThrow()
      const restored = await decompressGzip(await fs.readFile(newPath))
      expect(restored.toString('utf8')).toBe(LARGE_TEXT)
    })

    it('decompressGzipFile { inPlace: true } strips .gz', async () => {
      const originalPath = path.join(tmpDir, 'data.txt')
      await fs.writeFile(originalPath, LARGE_TEXT, 'utf8')
      const gzPath = await compressGzipFile(originalPath, { inPlace: true })
      const restoredPath = await decompressGzipFile(gzPath, { inPlace: true })
      expect(restoredPath).toBe(originalPath)
      const restored = await fs.readFile(restoredPath, 'utf8')
      expect(restored).toBe(LARGE_TEXT)
    })

    it('decompressGzipFile { inPlace: true } rejects files without .gz/.gzip/.tgz extension', async () => {
      const p = path.join(tmpDir, 'no-extension')
      await fs.writeFile(p, 'data', 'utf8')
      await expect(decompressGzipFile(p, { inPlace: true })).rejects.toThrow(
        /no \.gz\/\.gzip\/\.tgz extension/,
      )
    })

    it('decompressGzipFile { inPlace: true } maps .tgz → .tar', async () => {
      const tarPath = path.join(tmpDir, 'archive.tar')
      const tgzPath = path.join(tmpDir, 'archive.tgz')
      await fs.writeFile(tarPath, LARGE_TEXT, 'utf8')
      await compressGzipFile(tarPath, tgzPath)
      await fs.rm(tarPath)

      const restoredPath = await decompressGzipFile(tgzPath, { inPlace: true })
      expect(restoredPath).toBe(tarPath)
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
      expect((await fs.stat(srcPath)).size).toBeGreaterThan(0)
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

  describe('extension constants', () => {
    it('BROTLI_EXTS contains the canonical brotli suffixes', () => {
      expect(BROTLI_EXTS.has('.br')).toBe(true)
      expect(BROTLI_EXTS.has('.brotli')).toBe(true)
      expect(BROTLI_EXTS.has('.gz')).toBe(false)
    })

    it('GZIP_EXTS contains the canonical gzip suffixes including .tgz', () => {
      expect(GZIP_EXTS.has('.gz')).toBe(true)
      expect(GZIP_EXTS.has('.gzip')).toBe(true)
      expect(GZIP_EXTS.has('.tgz')).toBe(true)
      expect(GZIP_EXTS.has('.br')).toBe(false)
    })

    it('hasBrotliExt agrees with BROTLI_EXTS membership (case-folded)', () => {
      for (const ext of BROTLI_EXTS) {
        expect(hasBrotliExt(`foo${ext}`)).toBe(true)
        expect(hasBrotliExt(`foo${ext.toUpperCase()}`)).toBe(true)
      }
    })

    it('hasGzipExt agrees with GZIP_EXTS membership (case-folded)', () => {
      for (const ext of GZIP_EXTS) {
        expect(hasGzipExt(`foo${ext}`)).toBe(true)
        expect(hasGzipExt(`foo${ext.toUpperCase()}`)).toBe(true)
      }
    })
  })

  describe('stripExt', () => {
    it('strips a recognized brotli extension', () => {
      expect(stripExt('foo.br', BROTLI_EXTS)).toBe('foo')
      expect(stripExt('foo.json.br', BROTLI_EXTS)).toBe('foo.json')
      expect(stripExt('foo.brotli', BROTLI_EXTS)).toBe('foo')
    })

    it('strips a recognized gzip extension', () => {
      expect(stripExt('foo.gz', GZIP_EXTS)).toBe('foo')
      expect(stripExt('foo.json.gz', GZIP_EXTS)).toBe('foo.json')
      expect(stripExt('foo.gzip', GZIP_EXTS)).toBe('foo')
    })

    it('strips .tgz (no .tar recovery — that is a caller convention)', () => {
      expect(stripExt('archive.tgz', GZIP_EXTS)).toBe('archive')
      expect(stripExt('path/to/archive.tgz', GZIP_EXTS)).toBe('path/to/archive')
    })

    it('returns the input unchanged when ext is not recognized', () => {
      expect(stripExt('foo.json', BROTLI_EXTS)).toBe('foo.json')
      expect(stripExt('foo.json', GZIP_EXTS)).toBe('foo.json')
      expect(stripExt('foo', BROTLI_EXTS)).toBe('foo')
      expect(stripExt('', BROTLI_EXTS)).toBe('')
    })

    it('is case-insensitive on the extension but preserves the rest', () => {
      expect(stripExt('Foo.BR', BROTLI_EXTS)).toBe('Foo')
      expect(stripExt('PATH/To/File.BR', BROTLI_EXTS)).toBe('PATH/To/File')
      expect(stripExt('Archive.TGZ', GZIP_EXTS)).toBe('Archive')
    })

    it('only honors the trailing extension, not embedded ones', () => {
      // foo.br.json is a .json file (last extname wins), so brotli set
      // shouldn't strip anything.
      expect(stripExt('foo.br.json', BROTLI_EXTS)).toBe('foo.br.json')
      // archive.tgz.txt similarly.
      expect(stripExt('archive.tgz.txt', GZIP_EXTS)).toBe('archive.tgz.txt')
    })

    it('respects custom extension sets', () => {
      const customSet: ReadonlySet<string> = new Set(['.zst'])
      expect(stripExt('payload.zst', customSet)).toBe('payload')
      expect(stripExt('payload.gz', customSet)).toBe('payload.gz')
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

  describe('resolveGzipOptions', () => {
    it('returns an empty options object when no level given', () => {
      const opts = resolveGzipOptions(undefined)
      expect(opts).toBeDefined()
      expect((opts as { level?: number }).level).toBeUndefined()
    })

    it('forwards an explicit level', () => {
      const opts = resolveGzipOptions({ level: 9 }) as { level?: number }
      expect(opts.level).toBe(9)
    })

    it('uses a null prototype to keep the result clean', () => {
      const opts = resolveGzipOptions({ level: 6 })
      expect(Object.getPrototypeOf(opts)).toBeNull()
    })

    it('round-trips through compressGzip with the resolved level', async () => {
      // The lowest-level call (level 1) compresses faster but worse
      // than the default — verify both work end-to-end.
      const fast = await compressGzip(LARGE_TEXT, { level: 1 })
      const max = await compressGzip(LARGE_TEXT, { level: 9 })
      expect(max.byteLength).toBeLessThanOrEqual(fast.byteLength)
      const restored = await decompressGzip(max)
      expect(restored.toString('utf8')).toBe(LARGE_TEXT)
    })
  })
})
