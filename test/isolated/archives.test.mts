/**
 * @file Unit tests for archive extraction across zip, tar, and tar.gz:
 *
 *   - detectArchiveFormat() - identifies format from file extension
 *   - extractZip()/extractTar()/extractTarGz() - extract with optional strip
 *   - extractArchive() - auto-detects format and extracts Security hardening
 *     (path traversal, zip bombs, symlinks) lives in the sibling
 *     archives-security.test.mts.
 */

import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createGzip } from 'node:zlib'

import AdmZip from 'adm-zip'
// @ts-expect-error - no type declarations
import tarStream from 'tar-stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { detectArchiveFormat } from '../../src/archives/detect'
import { extractArchive } from '../../src/archives/extract'
import { extractTar, extractTarGz } from '../../src/archives/tar'
import { extractZip } from '../../src/archives/zip'
import { safeDelete } from '../../src/fs/safe'

import { tolerantTimeout } from '../_shared/fleet/lib/timing.mts'
import { runWithTempDir } from '../unit/util/temp-file-helper'

let testZipPath: string
let testTarPath: string
let testTarGzPath: string
let testZipWithStripPath: string
let testTarWithStripPath: string
let cleanupTestFiles: () => Promise<void>

beforeAll(async () => {
  const tempDir = path.join(process.cwd(), 'test', 'temp')
  await fs.mkdir(tempDir, { recursive: true })

  testZipPath = path.join(tempDir, 'test-archive.zip')
  const zip = new AdmZip()
  zip.addFile('file1.txt', Buffer.from('content1'))
  zip.addFile('dir/file2.txt', Buffer.from('content2'))
  zip.addFile('dir/nested/file3.txt', Buffer.from('content3'))
  zip.writeZip(testZipPath)

  testZipWithStripPath = path.join(tempDir, 'test-strip.zip')
  const zipStrip = new AdmZip()
  zipStrip.addFile('prefix/file1.txt', Buffer.from('strip-content1'))
  zipStrip.addFile('prefix/dir/file2.txt', Buffer.from('strip-content2'))
  zipStrip.addFile('prefix/dir/nested/file3.txt', Buffer.from('strip-content3'))
  zipStrip.writeZip(testZipWithStripPath)

  testTarPath = path.join(tempDir, 'test-archive.tar')
  const pack = tarStream.pack()
  pack.entry({ name: 'file1.txt' }, 'tar-content1')
  pack.entry({ name: 'dir/file2.txt' }, 'tar-content2')
  pack.entry({ name: 'dir/nested/file3.txt' }, 'tar-content3')
  pack.finalize()

  const tarWriteStream = createWriteStream(testTarPath)
  await new Promise<void>((resolve, reject) => {
    pack.pipe(tarWriteStream)
    tarWriteStream.on('finish', () => resolve())
    tarWriteStream.on('error', reject)
  })

  testTarWithStripPath = path.join(tempDir, 'test-strip.tar')
  const packStrip = tarStream.pack()
  packStrip.entry({ name: 'prefix/file1.txt' }, 'tar-strip-content1')
  packStrip.entry({ name: 'prefix/dir/file2.txt' }, 'tar-strip-content2')
  packStrip.entry({ name: 'prefix/dir/nested/file3.txt' }, 'tar-strip-content3')
  packStrip.finalize()

  const tarStripWriteStream = createWriteStream(testTarWithStripPath)
  await new Promise<void>((resolve, reject) => {
    packStrip.pipe(tarStripWriteStream)
    tarStripWriteStream.on('finish', () => resolve())
    tarStripWriteStream.on('error', reject)
  })

  testTarGzPath = path.join(tempDir, 'test-archive.tar.gz')
  const packGz = tarStream.pack()
  packGz.entry({ name: 'file1.txt' }, 'targz-content1')
  packGz.entry({ name: 'dir/file2.txt' }, 'targz-content2')
  packGz.entry({ name: 'dir/nested/file3.txt' }, 'targz-content3')
  packGz.finalize()

  const gzipStream = createGzip()
  const tarGzWriteStream = createWriteStream(testTarGzPath)
  await new Promise<void>((resolve, reject) => {
    packGz.pipe(gzipStream).pipe(tarGzWriteStream)
    tarGzWriteStream.on('finish', () => resolve())
    tarGzWriteStream.on('error', reject)
  })

  cleanupTestFiles = async () => {
    try {
      await safeDelete(tempDir, { force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
})

afterAll(async () => {
  await cleanupTestFiles()
})

describe('archives', () => {
  describe('detectArchiveFormat', () => {
    it('should detect zip format', () => {
      expect(detectArchiveFormat('archive.zip')).toBe('zip')
      expect(detectArchiveFormat('path/to/archive.ZIP')).toBe('zip')
      expect(detectArchiveFormat('/absolute/path/archive.zip')).toBe('zip')
    })

    it('should detect tar format', () => {
      expect(detectArchiveFormat('archive.tar')).toBe('tar')
      expect(detectArchiveFormat('path/to/archive.TAR')).toBe('tar')
      expect(detectArchiveFormat('/absolute/path/archive.tar')).toBe('tar')
    })

    it('should detect tar.gz format', () => {
      expect(detectArchiveFormat('archive.tar.gz')).toBe('tar.gz')
      expect(detectArchiveFormat('path/to/archive.TAR.GZ')).toBe('tar.gz')
      expect(detectArchiveFormat('/absolute/path/archive.tar.gz')).toBe(
        'tar.gz',
      )
    })

    it('should detect tgz format', () => {
      expect(detectArchiveFormat('archive.tgz')).toBe('tgz')
      expect(detectArchiveFormat('path/to/archive.TGZ')).toBe('tgz')
      expect(detectArchiveFormat('/absolute/path/archive.tgz')).toBe('tgz')
    })

    it('should return undefined for unknown formats', () => {
      expect(detectArchiveFormat('file.txt')).toBeUndefined()
      expect(detectArchiveFormat('archive.rar')).toBeUndefined()
      expect(detectArchiveFormat('archive.7z')).toBeUndefined()
      expect(detectArchiveFormat('noextension')).toBeUndefined()
      expect(detectArchiveFormat('')).toBeUndefined()
    })
  })

  describe('extractZip', () => {
    it('should extract zip archive', async () => {
      await runWithTempDir(async tempDir => {
        await extractZip(testZipPath, tempDir)

        // Verify extracted files
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('content1')

        const file2 = await fs.readFile(
          path.join(tempDir, 'dir', 'file2.txt'),
          'utf8',
        )
        expect(file2).toBe('content2')

        const file3 = await fs.readFile(
          path.join(tempDir, 'dir', 'nested', 'file3.txt'),
          'utf8',
        )
        expect(file3).toBe('content3')
      }, 'extractZip-basic-')
    })

    it('should extract zip with strip=1', async () => {
      await runWithTempDir(async tempDir => {
        await extractZip(testZipWithStripPath, tempDir, { strip: 1 })

        // Verify files extracted without prefix
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('strip-content1')

        const file2 = await fs.readFile(
          path.join(tempDir, 'dir', 'file2.txt'),
          'utf8',
        )
        expect(file2).toBe('strip-content2')

        const file3 = await fs.readFile(
          path.join(tempDir, 'dir', 'nested', 'file3.txt'),
          'utf8',
        )
        expect(file3).toBe('strip-content3')
      }, 'extractZip-strip-')
    })

    it('should handle strip greater than path depth', async () => {
      await runWithTempDir(async tempDir => {
        await extractZip(testZipWithStripPath, tempDir, { strip: 10 })

        // No files should be extracted (all paths shorter than strip value)
        const files = await fs.readdir(tempDir)
        expect(files).toHaveLength(0)
      }, 'extractZip-strip-deep-')
    })

    it('should create output directory if it does not exist', async () => {
      await runWithTempDir(async tempDir => {
        const outputDir = path.join(tempDir, 'nonexistent', 'nested', 'output')
        await extractZip(testZipPath, outputDir)

        const file1 = await fs.readFile(
          path.join(outputDir, 'file1.txt'),
          'utf8',
        )
        expect(file1).toBe('content1')
      }, 'extractZip-create-dir-')
    })

    it('should handle Windows-style paths in output directory', async () => {
      await runWithTempDir(async tempDir => {
        // Simulate Windows-style path with backslashes
        const windowsStylePath = tempDir.replace(/\//g, '\\')
        await extractZip(testZipPath, windowsStylePath)

        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('content1')
      }, 'extractZip-windows-path-')
    })

    it('should throw ENOENT on nonexistent zip file', async () => {
      await runWithTempDir(async tempDir => {
        const nonexistentPath = path.join(tempDir, 'nonexistent.zip')
        // All three extractors normalize "missing archive" to ENOENT
        // via the shared `assertArchiveExists` preflight — previously
        // extractZip surfaced adm-zip's generic "Invalid filename"
        // while tar/tar.gz surfaced the raw Node ENOENT. Assert on
        // `.code === 'ENOENT'` so the test catches a semantic
        // regression rather than merely any rejection.
        await expect(
          extractZip(nonexistentPath, tempDir),
        ).rejects.toMatchObject({
          code: 'ENOENT',
          message: expect.stringContaining(nonexistentPath),
        })
      }, 'extractZip-error-')
    })
  })

  describe('extractTar', () => {
    it('should extract tar archive', async () => {
      await runWithTempDir(async tempDir => {
        await extractTar(testTarPath, tempDir)

        // Verify extracted files
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('tar-content1')

        const file2 = await fs.readFile(
          path.join(tempDir, 'dir', 'file2.txt'),
          'utf8',
        )
        expect(file2).toBe('tar-content2')

        const file3 = await fs.readFile(
          path.join(tempDir, 'dir', 'nested', 'file3.txt'),
          'utf8',
        )
        expect(file3).toBe('tar-content3')
      }, 'extractTar-basic-')
    })

    it('should extract tar with strip=1', async () => {
      await runWithTempDir(async tempDir => {
        await extractTar(testTarWithStripPath, tempDir, { strip: 1 })

        // Verify files extracted without prefix
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('tar-strip-content1')

        const file2 = await fs.readFile(
          path.join(tempDir, 'dir', 'file2.txt'),
          'utf8',
        )
        expect(file2).toBe('tar-strip-content2')

        const file3 = await fs.readFile(
          path.join(tempDir, 'dir', 'nested', 'file3.txt'),
          'utf8',
        )
        expect(file3).toBe('tar-strip-content3')
      }, 'extractTar-strip-')
    })

    it('should create output directory if it does not exist', async () => {
      await runWithTempDir(async tempDir => {
        const outputDir = path.join(tempDir, 'nonexistent', 'nested', 'output')
        await extractTar(testTarPath, outputDir)

        const file1 = await fs.readFile(
          path.join(outputDir, 'file1.txt'),
          'utf8',
        )
        expect(file1).toBe('tar-content1')
      }, 'extractTar-create-dir-')
    })

    it('should handle Windows-style paths in output directory', async () => {
      await runWithTempDir(async tempDir => {
        // Simulate Windows-style path with backslashes
        const windowsStylePath = tempDir.replace(/\//g, '\\')
        await extractTar(testTarPath, windowsStylePath)

        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('tar-content1')
      }, 'extractTar-windows-path-')
    })

    it('should throw ENOENT on nonexistent tar file', async () => {
      await runWithTempDir(async tempDir => {
        const nonexistentPath = path.join(tempDir, 'nonexistent.tar')
        await expect(
          extractTar(nonexistentPath, tempDir),
        ).rejects.toMatchObject({
          code: 'ENOENT',
          message: expect.stringContaining(nonexistentPath),
        })
      }, 'extractTar-error-')
    })
  })

  describe('extractTarGz', () => {
    it('should extract tar.gz archive', async () => {
      await runWithTempDir(async tempDir => {
        await extractTarGz(testTarGzPath, tempDir)

        // Verify extracted files
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('targz-content1')

        const file2 = await fs.readFile(
          path.join(tempDir, 'dir', 'file2.txt'),
          'utf8',
        )
        expect(file2).toBe('targz-content2')

        const file3 = await fs.readFile(
          path.join(tempDir, 'dir', 'nested', 'file3.txt'),
          'utf8',
        )
        expect(file3).toBe('targz-content3')
      }, 'extractTarGz-basic-')
    })

    it('should extract tar.gz with strip=1', async () => {
      await runWithTempDir(async tempDir => {
        // Create a tar.gz with prefix
        const tarGzWithStripPath = path.join(
          path.dirname(testTarGzPath),
          'test-strip.tar.gz',
        )
        const packStrip = tarStream.pack()
        packStrip.entry({ name: 'prefix/file1.txt' }, 'targz-strip-content1')
        packStrip.entry(
          { name: 'prefix/dir/file2.txt' },
          'targz-strip-content2',
        )
        packStrip.entry(
          { name: 'prefix/dir/nested/file3.txt' },
          'targz-strip-content3',
        )
        packStrip.finalize()

        const gzipStream = createGzip()
        const tarGzWriteStream = createWriteStream(tarGzWithStripPath)
        await new Promise<void>((resolve, reject) => {
          packStrip.pipe(gzipStream).pipe(tarGzWriteStream)
          tarGzWriteStream.on('finish', () => resolve())
          tarGzWriteStream.on('error', reject)
        })

        await extractTarGz(tarGzWithStripPath, tempDir, { strip: 1 })

        // Verify files extracted without prefix
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('targz-strip-content1')

        const file2 = await fs.readFile(
          path.join(tempDir, 'dir', 'file2.txt'),
          'utf8',
        )
        expect(file2).toBe('targz-strip-content2')

        // Cleanup
        await safeDelete(tarGzWithStripPath).catch(() => {})
      }, 'extractTarGz-strip-')
    })

    it('should create output directory if it does not exist', async () => {
      await runWithTempDir(async tempDir => {
        const outputDir = path.join(tempDir, 'nonexistent', 'nested', 'output')
        await extractTarGz(testTarGzPath, outputDir)

        const file1 = await fs.readFile(
          path.join(outputDir, 'file1.txt'),
          'utf8',
        )
        expect(file1).toBe('targz-content1')
      }, 'extractTarGz-create-dir-')
    })

    it('should handle Windows-style paths in output directory', async () => {
      await runWithTempDir(async tempDir => {
        // Simulate Windows-style path with backslashes
        const windowsStylePath = tempDir.replace(/\//g, '\\')
        await extractTarGz(testTarGzPath, windowsStylePath)

        // Verify extraction worked
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('targz-content1')
      }, 'extractTarGz-windows-path-')
    })

    it('should throw ENOENT on nonexistent tar.gz file', async () => {
      await runWithTempDir(async tempDir => {
        const nonexistentPath = path.join(tempDir, 'nonexistent.tar.gz')
        await expect(
          extractTarGz(nonexistentPath, tempDir),
        ).rejects.toMatchObject({
          code: 'ENOENT',
          message: expect.stringContaining(nonexistentPath),
        })
      }, 'extractTarGz-error-')
    })
  })

  describe('extractArchive', () => {
    it('should auto-detect and extract zip archive', async () => {
      await runWithTempDir(async tempDir => {
        await extractArchive(testZipPath, tempDir)

        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('content1')
      }, 'extractArchive-zip-')
    })

    it('should auto-detect and extract tar archive', async () => {
      await runWithTempDir(async tempDir => {
        await extractArchive(testTarPath, tempDir)

        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('tar-content1')
      }, 'extractArchive-tar-')
    })

    it(
      'should auto-detect and extract tar.gz archive',
      async () => {
        await runWithTempDir(async tempDir => {
          await extractArchive(testTarGzPath, tempDir)

          const file1 = await fs.readFile(
            path.join(tempDir, 'file1.txt'),
            'utf8',
          )
          expect(file1).toBe('targz-content1')
        }, 'extractArchive-targz-')
      },
      tolerantTimeout(60_000),
    )

    it('should support strip option with auto-detection', async () => {
      await runWithTempDir(async tempDir => {
        await extractArchive(testZipWithStripPath, tempDir, { strip: 1 })

        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('strip-content1')
      }, 'extractArchive-strip-')
    })

    it('should throw on unsupported format', async () => {
      await runWithTempDir(async tempDir => {
        const unsupportedPath = path.join(tempDir, 'archive.rar')
        await fs.writeFile(unsupportedPath, 'fake content')

        await expect(extractArchive(unsupportedPath, tempDir)).rejects.toThrow(
          /Unsupported archive format/,
        )
      }, 'extractArchive-unsupported-')
    })

    it('should throw on file without extension', async () => {
      await runWithTempDir(async tempDir => {
        const noExtPath = path.join(tempDir, 'noextension')
        await fs.writeFile(noExtPath, 'fake content')

        await expect(extractArchive(noExtPath, tempDir)).rejects.toThrow(
          /Unsupported archive format/,
        )
      }, 'extractArchive-no-ext-')
    })
  })
})
