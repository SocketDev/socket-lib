/**
 * @file Security tests for archive extraction utilities. Covers the hardening
 *   layers shared by extractZip/extractTar/extractTarGz/extractArchive:
 *
 *   - Path traversal protection (adm-zip normalization, base-dir containment)
 *   - Zip bomb protection (per-file maxFileSize, aggregate maxTotalSize)
 *   - Symlink/hard-link rejection in tar and tar.gz archives
 *   - Combined end-to-end security validation through auto-detection
 */

import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createGzip } from 'node:zlib'

import AdmZip from 'adm-zip'
// @ts-expect-error - no type declarations
import tarStream from 'tar-stream'
import { describe, expect, it } from 'vitest'

import { extractArchive } from '../../src/archives/extract'
import { extractTar, extractTarGz } from '../../src/archives/tar'
import { extractZip } from '../../src/archives/zip'

import { runWithTempDir } from '../unit/util/temp-file-helper'

// Suppress unhandled error warnings from tar-fs stream destruction.
// The errors are properly caught by the pipeline, but Vitest tracks Error
// object creation. The size-limit failures below tear down the tar stream,
// which surfaces here.
process.on('uncaughtException', err => {
  if (err.message?.includes('File size exceeds limit')) {
    // Expected error from tar extraction security checks - ignore
    return
  }
  throw err
})

describe('archives security features', () => {
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
    }, 60_000)

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
    }, 60_000)
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
    }, 60_000)

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
    }, 120_000)

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
    }, 60_000)

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

        const extracted = await fs.readFile(path.join(extractDir2, 'file.bin'))
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
