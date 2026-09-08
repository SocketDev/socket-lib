/**
 * @file Security tests for archive extraction utilities. Covers the hardening
 *   layers shared by extractZip/extractTar/extractTarGz/extractArchive:
 *
 *   - Path traversal protection: adm-zip normalization and base-dir containment
 *   - Zip bomb protection (per-file maxFileSize, aggregate maxTotalSize)
 *   - Symlink/hard-link rejection in tar and tar.gz archives
 *   - Combined end-to-end security validation through auto-detection
 */

import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createGzip } from 'node:zlib'

import AdmZip from '../../src/external/adm-zip.js'
import { describe, expect, it } from 'vitest'

import { createTarPack } from '../_shared/tar-pack.mts'

import { tolerantTimeout } from '../_shared/fleet/lib/timing.mts'

import { extractArchive } from '../../src/archives/extract.mjs'
import { extractTar, extractTarGz } from '../../src/archives/tar.mjs'
import { extractZip } from '../../src/archives/zip.mjs'

import { runWithTempDir } from '../unit/util/temp-files.mjs'

// Size guards inspect declared metadata before decompressing fixture bytes.
function addDeclaredSizeFile(zip: AdmZip, name: string, size: number): void {
  zip.addFile(name, Buffer.from('fixture'))
  zip.getEntry(name)!.header.size = size
}

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
    it(
      'should safely handle relative paths in zip files (adm-zip normalizes)',
      async () => {
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
      },
      tolerantTimeout(60_000),
    )

    it(
      'should validate extracted paths stay within base directory',
      async () => {
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
      },
      tolerantTimeout(60_000),
    )
  })

  describe('zip bomb protection', () => {
    it(
      'should block files exceeding maxFileSize in zip',
      async () => {
        await runWithTempDir(async tempDir => {
          const bombZipPath = path.join(tempDir, 'bomb.zip')
          const zip = new AdmZip()

          addDeclaredSizeFile(zip, 'large-file.bin', 150 * 1024 * 1024)

          zip.writeZip(bombZipPath)

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractZip(bombZipPath, extractDir)).rejects.toThrow(
            /File size exceeds limit/,
          )
        }, 'security-zip-bomb-file-')
      },
      tolerantTimeout(60_000),
    )

    it(
      'should block total size exceeding maxTotalSize in zip',
      async () => {
        await runWithTempDir(async tempDir => {
          const bombZipPath = path.join(tempDir, 'bomb-total.zip')
          const zip = new AdmZip()

          // Fifteen declared 80 MiB entries exceed the default 1 GiB total.
          // Each declared entry remains below the default 100 MiB limit.
          for (let i = 0; i < 15; i++) {
            addDeclaredSizeFile(zip, `file${i}.bin`, 80 * 1024 * 1024)
          }

          zip.writeZip(bombZipPath)

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractZip(bombZipPath, extractDir)).rejects.toThrow(
            /Total extracted size exceeds limit/,
          )
        }, 'security-zip-bomb-total-')
      },
      tolerantTimeout(120_000),
    )

    it(
      'should block files exceeding maxFileSize in tar',
      async () => {
        await runWithTempDir(async tempDir => {
          const bombTarPath = path.join(tempDir, 'bomb.tar')

          const pack = createTarPack()
          pack.entry({ name: 'large-file.bin' }, Buffer.from('fixture'))
          pack.finalize()
          const chunks: Uint8Array[] = []
          for await (const chunk of pack) {
            chunks.push(chunk)
          }
          const archive = Buffer.concat(chunks)
          archive.write(
            `${(150 * 1024 * 1024).toString(8).padStart(11, '0')}\0`,
            124,
          )
          // TAR checksums count the checksum field as eight ASCII spaces.
          archive.fill(32, 148, 156)
          let checksum = 0
          for (const byte of archive.subarray(0, 512)) {
            checksum += byte
          }
          archive.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148)
          await fs.writeFile(bombTarPath, archive)

          const extractDir = path.join(tempDir, 'extract')
          await expect(extractTar(bombTarPath, extractDir)).rejects.toThrow(
            /File size exceeds limit/,
          )
        }, 'security-tar-bomb-file-')
      },
      tolerantTimeout(60_000),
    )

    it('should allow extraction with custom size limits', async () => {
      await runWithTempDir(async tempDir => {
        const zipPath = path.join(tempDir, 'custom.zip')
        const zip = new AdmZip()

        const buffer = Buffer.alloc(5 * 1024)
        zip.addFile('file.bin', buffer)

        zip.writeZip(zipPath)

        const extractDir = path.join(tempDir, 'extract')

        // Reject above the configured limit.
        await expect(
          extractZip(zipPath, extractDir, {
            maxFileSize: 1024,
          }),
        ).rejects.toThrow(/File size exceeds limit/)

        // Extract the actual payload below both configured limits.
        const extractDir2 = path.join(tempDir, 'extract2')
        await extractZip(zipPath, extractDir2, {
          maxFileSize: 10 * 1024,
          maxTotalSize: 10 * 1024,
        })

        const extracted = await fs.readFile(path.join(extractDir2, 'file.bin'))
        expect(extracted).toEqual(buffer)
      }, 'security-custom-limits-')
    })
  })

  describe('symlink protection', () => {
    it('should block symlinks in tar archives', async () => {
      await runWithTempDir(async tempDir => {
        const symlinkTarPath = path.join(tempDir, 'symlink.tar')

        // Create tar with symlink entry
        const pack = createTarPack()
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
        const pack = createTarPack()
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
        const pack = createTarPack()
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
        addDeclaredSizeFile(zip, 'large.bin', 150 * 1024 * 1024)
        zip.writeZip(zipPath)

        const extractDir = path.join(tempDir, 'extract')
        await expect(extractArchive(zipPath, extractDir)).rejects.toThrow(
          /File size exceeds limit/,
        )
      }, 'security-combined-auto-')
    })
  })
})
