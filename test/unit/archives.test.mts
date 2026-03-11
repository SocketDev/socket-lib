/**
 * @fileoverview Unit tests for archive extraction utilities.
 *
 * Tests archive extraction with zip, tar, and tar.gz formats:
 * - extractZip() - extracts zip archives with optional path stripping
 * - extractTar() - extracts tar archives with optional path stripping
 * - extractTarGz() - extracts gzipped tar archives with optional path stripping
 * - extractArchive() - auto-detects format and extracts
 * - detectArchiveFormat() - identifies archive format from file extension
 */

import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { createGzip } from 'node:zlib'

import AdmZip from 'adm-zip'
import tarStream from 'tar-stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Suppress unhandled error warnings from tar-fs stream destruction
// The errors are properly caught by the pipeline, but Vitest tracks Error object creation
process.on('uncaughtException', err => {
  if (err.message?.includes('File size exceeds limit')) {
    // Expected error from tar extraction security checks - ignore
    return
  }
  throw err
})

import {
  detectArchiveFormat,
  extractArchive,
  extractTar,
  extractTarGz,
  extractZip,
} from '@socketsecurity/lib/archives'

import { runWithTempDir } from './utils/temp-file-helper'

// Test archive fixtures
let testZipPath: string
let testTarPath: string
let testTarGzPath: string
let testZipWithStripPath: string
let testTarWithStripPath: string
let cleanupTestFiles: () => Promise<void>

beforeAll(async () => {
  const tempDir = path.join(process.cwd(), 'test', 'temp')
  await fs.mkdir(tempDir, { recursive: true })

  // Create test zip archive
  testZipPath = path.join(tempDir, 'test-archive.zip')
  const zip = new AdmZip()
  zip.addFile('file1.txt', Buffer.from('content1'))
  zip.addFile('dir/file2.txt', Buffer.from('content2'))
  zip.addFile('dir/nested/file3.txt', Buffer.from('content3'))
  zip.writeZip(testZipPath)

  // Create test zip archive with strip prefix
  testZipWithStripPath = path.join(tempDir, 'test-strip.zip')
  const zipStrip = new AdmZip()
  zipStrip.addFile('prefix/file1.txt', Buffer.from('strip-content1'))
  zipStrip.addFile('prefix/dir/file2.txt', Buffer.from('strip-content2'))
  zipStrip.addFile('prefix/dir/nested/file3.txt', Buffer.from('strip-content3'))
  zipStrip.writeZip(testZipWithStripPath)

  // Create test tar archive
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

  // Create test tar archive with strip prefix
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

  // Create test tar.gz archive
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
      await fs.rm(tempDir, { force: true, recursive: true })
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

    it('should return null for unknown formats', () => {
      expect(detectArchiveFormat('file.txt')).toBeNull()
      expect(detectArchiveFormat('archive.rar')).toBeNull()
      expect(detectArchiveFormat('archive.7z')).toBeNull()
      expect(detectArchiveFormat('noextension')).toBeNull()
      expect(detectArchiveFormat('')).toBeNull()
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

        // Verify extraction worked
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('content1')
      }, 'extractZip-windows-path-')
    })

    it('should throw on nonexistent zip file', async () => {
      await runWithTempDir(async tempDir => {
        const nonexistentPath = path.join(tempDir, 'nonexistent.zip')
        await expect(extractZip(nonexistentPath, tempDir)).rejects.toThrow()
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

        // Verify extraction worked
        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('tar-content1')
      }, 'extractTar-windows-path-')
    })

    it('should throw on nonexistent tar file', async () => {
      await runWithTempDir(async tempDir => {
        const nonexistentPath = path.join(tempDir, 'nonexistent.tar')
        await expect(extractTar(nonexistentPath, tempDir)).rejects.toThrow()
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
        await fs.unlink(tarGzWithStripPath).catch(() => {})
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

    it('should throw on nonexistent tar.gz file', async () => {
      await runWithTempDir(async tempDir => {
        const nonexistentPath = path.join(tempDir, 'nonexistent.tar.gz')
        await expect(extractTarGz(nonexistentPath, tempDir)).rejects.toThrow()
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

    it('should auto-detect and extract tar.gz archive', async () => {
      await runWithTempDir(async tempDir => {
        await extractArchive(testTarGzPath, tempDir)

        const file1 = await fs.readFile(path.join(tempDir, 'file1.txt'), 'utf8')
        expect(file1).toBe('targz-content1')
      }, 'extractArchive-targz-')
    })

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

  describe('security features', () => {
    describe('path traversal protection', () => {
      it('should safely handle relative paths in zip files (adm-zip normalizes)', async () => {
        await runWithTempDir(async tempDir => {
          const zipPath = path.join(tempDir, 'relative.zip')
          const zip = new AdmZip()

          // adm-zip normalizes ../../ to safe paths automatically
          zip.addFile('../../etc/passwd', Buffer.from('safe content'))

          zip.writeZip(zipPath)

          const extractDir = path.join(tempDir, 'extract')
          // Should extract safely (adm-zip normalizes to etc/passwd)
          await extractZip(zipPath, extractDir)

          // Verify it extracted to safe location
          const files = await fs.readdir(extractDir, { recursive: true })
          expect(files).toContain('etc')
        }, 'security-path-normalized-zip-')
      })

      it('should validate extracted paths stay within base directory', async () => {
        await runWithTempDir(async tempDir => {
          const zipPath = path.join(tempDir, 'test.zip')
          const zip = new AdmZip()
          zip.addFile('safe/file.txt', Buffer.from('content'))
          zip.writeZip(zipPath)

          const extractDir = path.join(tempDir, 'extract')
          // This should work fine - normal extraction
          await extractZip(zipPath, extractDir)

          const content = await fs.readFile(
            path.join(extractDir, 'safe', 'file.txt'),
            'utf8',
          )
          expect(content).toBe('content')
        }, 'security-path-validation-zip-')
      })
    })

    describe('zip bomb protection', () => {
      it('should block files exceeding maxFileSize in zip', async () => {
        await runWithTempDir(async tempDir => {
          const bombZipPath = path.join(tempDir, 'bomb.zip')
          const zip = new AdmZip()

          // Create a large buffer (150MB > 100MB default)
          const largeBuffer = Buffer.alloc(150 * 1024 * 1024)
          zip.addFile('large-file.bin', largeBuffer)

          zip.writeZip(bombZipPath)

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractZip(bombZipPath, extractDir)).rejects.toThrow(
            /File size exceeds limit/,
          )
        }, 'security-zip-bomb-file-')
      }, 15_000)

      it('should block total size exceeding maxTotalSize in zip', async () => {
        await runWithTempDir(async tempDir => {
          const bombZipPath = path.join(tempDir, 'bomb-total.zip')
          const zip = new AdmZip()

          // Create multiple 80MB files (15 * 80MB = 1200MB > 1GB default total)
          // But each file is under 100MB individual limit
          for (let i = 0; i < 15; i++) {
            const buffer = Buffer.alloc(80 * 1024 * 1024)
            zip.addFile(`file${i}.bin`, buffer)
          }

          zip.writeZip(bombZipPath)

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractZip(bombZipPath, extractDir)).rejects.toThrow(
            /Total extracted size exceeds limit/,
          )
        }, 'security-zip-bomb-total-')
      }, 30_000)

      it('should block files exceeding maxFileSize in tar', async () => {
        await runWithTempDir(async tempDir => {
          const bombTarPath = path.join(tempDir, 'bomb.tar')

          // Create tar with large file
          const fileSize = 150 * 1024 * 1024
          const pack = tarStream.pack()

          // Use a callback to write large data in chunks
          const entry = pack.entry({ name: 'large-file.bin', size: fileSize })

          // Write in chunks to avoid memory issues
          const chunkSize = 10 * 1024 * 1024
          for (let i = 0; i < fileSize; i += chunkSize) {
            const size = Math.min(chunkSize, fileSize - i)
            entry.write(Buffer.alloc(size))
          }
          entry.end()
          pack.finalize()

          const tarWriteStream = createWriteStream(bombTarPath)
          await new Promise<void>((resolve, reject) => {
            pack.pipe(tarWriteStream)
            tarWriteStream.on('finish', () => resolve())
            tarWriteStream.on('error', reject)
          })

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractTar(bombTarPath, extractDir)).rejects.toThrow(
            /File size exceeds limit/,
          )
        }, 'security-tar-bomb-file-')
      }, 15_000)

      it('should allow extraction with custom size limits', async () => {
        await runWithTempDir(async tempDir => {
          const zipPath = path.join(tempDir, 'custom.zip')
          const zip = new AdmZip()

          // Create 5MB file
          const buffer = Buffer.alloc(5 * 1024 * 1024)
          zip.addFile('file.bin', buffer)

          zip.writeZip(zipPath)

          const extractDir = path.join(tempDir, 'extract')

          // Should fail with 1MB limit
          await expect(
            extractZip(zipPath, extractDir, {
              maxFileSize: 1 * 1024 * 1024,
            }),
          ).rejects.toThrow(/File size exceeds limit/)

          // Should succeed with 10MB limit
          const extractDir2 = path.join(tempDir, 'extract2')
          await extractZip(zipPath, extractDir2, {
            maxFileSize: 10 * 1024 * 1024,
            maxTotalSize: 10 * 1024 * 1024,
          })

          const extracted = await fs.readFile(
            path.join(extractDir2, 'file.bin'),
          )
          expect(extracted.length).toBe(5 * 1024 * 1024)
        }, 'security-custom-limits-')
      })
    })

    describe('symlink protection', () => {
      it('should block symlinks in tar archives', async () => {
        await runWithTempDir(async tempDir => {
          const symlinkTarPath = path.join(tempDir, 'symlink.tar')

          // Create tar with symlink entry
          const pack = tarStream.pack()
          const entry = pack.entry({
            linkname: '/etc/passwd',
            name: 'malicious-link',
            type: 'symlink',
          })
          entry.end()
          pack.finalize()

          const tarWriteStream = createWriteStream(symlinkTarPath)
          await new Promise<void>((resolve, reject) => {
            pack.pipe(tarWriteStream)
            tarWriteStream.on('finish', () => resolve())
            tarWriteStream.on('error', reject)
          })

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractTar(symlinkTarPath, extractDir)).rejects.toThrow(
            /Symlink detected in archive.*Symlinks are not supported for security reasons/,
          )
        }, 'security-symlink-tar-')
      })

      it('should block hard links in tar archives', async () => {
        await runWithTempDir(async tempDir => {
          const linkTarPath = path.join(tempDir, 'link.tar')

          // Create tar with hard link entry
          const pack = tarStream.pack()
          const entry = pack.entry({
            linkname: '/etc/passwd',
            name: 'malicious-link',
            type: 'link',
          })
          entry.end()
          pack.finalize()

          const tarWriteStream = createWriteStream(linkTarPath)
          await new Promise<void>((resolve, reject) => {
            pack.pipe(tarWriteStream)
            tarWriteStream.on('finish', () => resolve())
            tarWriteStream.on('error', reject)
          })

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractTar(linkTarPath, extractDir)).rejects.toThrow(
            /Symlink detected in archive.*Symlinks are not supported for security reasons/,
          )
        }, 'security-hardlink-tar-')
      })

      it('should block symlinks in tar.gz archives', async () => {
        await runWithTempDir(async tempDir => {
          const symlinkTarGzPath = path.join(tempDir, 'symlink.tar.gz')

          // Create tar.gz with symlink entry
          const pack = tarStream.pack()
          const entry = pack.entry({
            linkname: '/etc/passwd',
            name: 'malicious-link',
            type: 'symlink',
          })
          entry.end()
          pack.finalize()

          const gzipStream = createGzip()
          const tarGzWriteStream = createWriteStream(symlinkTarGzPath)
          await new Promise<void>((resolve, reject) => {
            pack.pipe(gzipStream).pipe(tarGzWriteStream)
            tarGzWriteStream.on('finish', () => resolve())
            tarGzWriteStream.on('error', reject)
          })

          const extractDir = path.join(tempDir, 'extract')
          await expect(
            extractTarGz(symlinkTarGzPath, extractDir),
          ).rejects.toThrow(
            /Symlink detected in archive.*Symlinks are not supported for security reasons/,
          )
        }, 'security-symlink-targz-')
      })
    })

    describe('combined security scenarios', () => {
      it('should validate all security checks in sequence', async () => {
        await runWithTempDir(async tempDir => {
          // Test that valid archive passes all checks
          const validZipPath = path.join(tempDir, 'valid.zip')
          const zip = new AdmZip()
          zip.addFile('safe/file.txt', Buffer.from('safe content'))
          zip.writeZip(validZipPath)

          const extractDir = path.join(tempDir, 'extract')
          await extractZip(validZipPath, extractDir)

          const content = await fs.readFile(
            path.join(extractDir, 'safe', 'file.txt'),
            'utf8',
          )
          expect(content).toBe('safe content')
        }, 'security-combined-valid-')
      })

      it('should enforce security on extractArchive auto-detection', async () => {
        await runWithTempDir(async tempDir => {
          const zipPath = path.join(tempDir, 'archive.zip')
          const zip = new AdmZip()
          // Create a large file to test size limits via auto-detection
          const largeBuffer = Buffer.alloc(150 * 1024 * 1024)
          zip.addFile('large.bin', largeBuffer)
          zip.writeZip(zipPath)

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractArchive(zipPath, extractDir)).rejects.toThrow(
            /File size exceeds limit/,
          )
        }, 'security-combined-auto-')
      })
    })
  })
})
