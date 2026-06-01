/**
 * @file Unit tests for the gzip compression helpers plus the shared
 *   cross-format coverage (stripExt, cross-format negative cases). The brotli
 *   counterparts live in compression.test.mts; shared fixtures live in
 *   compression-fixtures.mts.
 */

import { Buffer } from 'node:buffer'
import { mkdtempSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
import { BROTLI_EXTS, compressBrotli } from '../../src/compression/brotli'
import { stripExt } from '../../src/compression/_internal'
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

// See compression.test.mts for why this suite runs sequentially: the
// tmpDir is module-scoped and mutated in beforeEach.
describe.sequential('compression — gzip', () => {
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
      // oxlint-disable-next-line socket/prefer-exists-sync -- needs the byte size, not just existence.
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

  describe('gzip — detection', () => {
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

    it('GZIP_EXTS contains the canonical gzip suffixes including .tgz', () => {
      expect(GZIP_EXTS.has('.gz')).toBe(true)
      expect(GZIP_EXTS.has('.gzip')).toBe(true)
      expect(GZIP_EXTS.has('.tgz')).toBe(true)
      expect(GZIP_EXTS.has('.br')).toBe(false)
    })

    it('hasGzipExt agrees with GZIP_EXTS membership (case-folded)', () => {
      for (const ext of GZIP_EXTS) {
        expect(hasGzipExt(`foo${ext}`)).toBe(true)
        expect(hasGzipExt(`foo${ext.toUpperCase()}`)).toBe(true)
      }
    })
  })

  describe('gzip — inPlace option', () => {
    it('compressGzipFile { inPlace: true } writes .gz and removes original', async () => {
      const srcPath = path.join(tmpDir, 'data.txt')
      await fs.writeFile(srcPath, LARGE_TEXT, 'utf8')

      const newPath = await compressGzipFile(srcPath, { inPlace: true })
      expect(newPath).toBe(`${srcPath}.gz`)

      // oxlint-disable-next-line socket/prefer-exists-sync -- asserts the original was unlinked via the raw fs.access rejection, not a lib wrapper.
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
      // oxlint-disable-next-line socket/prefer-safe-delete -- removes the source tar so the .tgz is the only candidate for the inPlace rename target; tests raw fs semantics, not the lib wrapper.
      await fs.rm(tarPath)

      const restoredPath = await decompressGzipFile(tgzPath, { inPlace: true })
      expect(restoredPath).toBe(tarPath)
    })
  })

  describe('cross-format negative cases', () => {
    it('decompressGzip rejects brotli-compressed input', async () => {
      const br = await compressBrotli(SMALL_TEXT)
      await expect(decompressGzip(br)).rejects.toThrow()
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

  describe('resolveGzipOptions', () => {
    it('returns an empty options object when no level given', () => {
      const opts = resolveGzipOptions(undefined)
      expect(opts).toBeDefined()
      expect((opts as { level?: number | undefined }).level).toBeUndefined()
    })

    it('forwards an explicit level', () => {
      const opts = resolveGzipOptions({ level: 9 }) as {
        level?: number | undefined
      }
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
