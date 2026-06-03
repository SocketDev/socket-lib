/**
 * @file Unit tests for HTTP/HTTPS request utilities — httpDownload checksum
 *   verification. Split out of test/isolated/http-request-download.test.mts to
 *   keep each test file under the per-worker heap ceiling and the source-line
 *   cap. This file covers the sha256-verification paths; the progress, logger,
 *   and retry tests live in http-request-download.test.mts. Both files share
 *   the same test server via http-request-fixtures.mts.
 */

import crypto from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { integrityToChecksum } from '../../src/integrity'
import { fetchChecksumFile } from '../../src/http-request/checksum-file'
import { httpDownload } from '../../src/http-request/download'

import { fixture, setupHttpFixture } from './http-request-fixtures'
import { runWithTempDir } from '../unit/util/temp-file-helper'

setupHttpFixture()

describe('http-request', () => {
  describe('httpDownload', () => {
    it('should verify sha256 checksum when provided', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'checksum.txt')
        const content = 'Test content for checksum verification'
        const expectedHash = crypto
          .createHash('sha256')
          .update(content)
          .digest('hex')

        const result = await httpDownload(
          `${fixture.baseUrl}/checksum-file`,
          destPath,
          { sha256: expectedHash },
        )

        expect(result.path).toBe(destPath)
        const downloadedContent = await fs.readFile(destPath, 'utf8')
        expect(downloadedContent).toBe(content)
      }, 'httpDownload-sha256-')
    })

    it('should fail when sha256 checksum does not match', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'checksum-fail.txt')
        const wrongHash =
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

        await expect(
          httpDownload(`${fixture.baseUrl}/checksum-file`, destPath, {
            sha256: wrongHash,
          }),
        ).rejects.toThrow(/Checksum verification failed/)

        // File should not exist after failed verification.
        const exists = existsSync(destPath)
        expect(exists).toBe(false)
      }, 'httpDownload-sha256-fail-')
    })

    it('should verify checksum using fetchChecksumFile', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'checksum-url.txt')

        // Fetch checksums first, then use the hash.
        const checksums = await fetchChecksumFile(
          `${fixture.baseUrl}/checksums.txt`,
        )
        expect(checksums['checksum-file']).toBeDefined()

        const result = await httpDownload(
          `${fixture.baseUrl}/checksum-file`,
          destPath,
          { sha256: integrityToChecksum(checksums['checksum-file']!) },
        )

        expect(result.path).toBe(destPath)
        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('Test content for checksum verification')
      }, 'httpDownload-checksums-url-')
    })

    it('should accept uppercase sha256 hash', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'checksum-upper.txt')
        const content = 'Test content for checksum verification'
        const expectedHash = crypto
          .createHash('sha256')
          .update(content)
          .digest('hex')
          .toUpperCase()

        const result = await httpDownload(
          `${fixture.baseUrl}/checksum-file`,
          destPath,
          { sha256: expectedHash },
        )

        expect(result.path).toBe(destPath)
      }, 'httpDownload-sha256-uppercase-')
    })

    it('should verify checksum after successful retry', async () => {
      let attemptCount = 0
      const content = 'Retry checksum content'
      const expectedHash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex')

      const testServer = http.createServer((req, res) => {
        attemptCount++
        if (attemptCount < 2) {
          req.socket.destroy()
        } else {
          res.writeHead(200, { 'Content-Length': String(content.length) })
          res.end(content)
        }
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        await runWithTempDir(async tmpDir => {
          const destPath = path.join(tmpDir, 'retry-checksum.txt')
          const result = await httpDownload(
            `http://localhost:${testPort}/`,
            destPath,
            {
              retries: 2,
              retryDelay: 10,
              sha256: expectedHash,
            },
          )

          expect(result.size).toBe(content.length)
          expect(attemptCount).toBe(2)

          const downloaded = await fs.readFile(destPath, 'utf8')
          expect(downloaded).toBe(content)
        }, 'httpDownload-retry-checksum-')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should skip verification when sha256 is undefined', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'no-checksum.txt')

        const result = await httpDownload(
          `${fixture.baseUrl}/checksum-file`,
          destPath,
          { sha256: undefined },
        )

        expect(result.path).toBe(destPath)
        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('Test content for checksum verification')
      }, 'httpDownload-sha256-undefined-')
    })
  })
})
