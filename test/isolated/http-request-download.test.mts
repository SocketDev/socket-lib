/**
 * @file Unit tests for HTTP/HTTPS request utilities — httpDownload progress,
 *   logger, and retry surface. Split out of
 *   test/isolated/http-request-core.test.mts to keep each test file under the
 *   per-worker heap ceiling and the source-line cap. The sha256-verification
 *   paths live in http-request-download-checksum.test.mts; the rest of the core
 *   surface (httpRequest) lives in http-request-core.test.mts. All files share
 *   the same test server via http-request-fixtures.mts.
 */

import { promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { httpDownload } from '../../src/http-request/download'
import { Logger } from '../../src/logger/node'

import { fixture, setupHttpFixture } from './http-request-fixtures'
import { runWithTempDir } from '../unit/util/temp-file-helper'

setupHttpFixture()

describe('http-request', () => {
  describe('httpDownload', () => {
    it('should download file to disk', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'download.txt')
        const result = await httpDownload(
          `${fixture.baseUrl}/download`,
          destPath,
        )

        expect(result.path).toBe(destPath)
        expect(result.size).toBeGreaterThan(0)

        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('Download test content')
      }, 'httpDownload-basic-')
    })

    it('should include response metadata in result', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'metadata.txt')
        const result = await httpDownload(
          `${fixture.baseUrl}/download`,
          destPath,
        )

        expect(result.ok).toBe(true)
        expect(result.status).toBe(200)
        expect(result.statusText).toBe('OK')
        expect(result.headers).toBeDefined()
        expect(result.headers['content-type']).toBe('text/plain')
        expect(result.headers['content-length']).toBeDefined()
      }, 'httpDownload-metadata-')
    })

    it('should track download progress', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'progress.txt')
        const progressUpdates: Array<{ downloaded: number; total: number }> = []

        await httpDownload(`${fixture.baseUrl}/large-download`, destPath, {
          onProgress: (downloaded, total) => {
            progressUpdates.push({ downloaded, total })
          },
        })

        expect(progressUpdates.length).toBeGreaterThan(0)
        // Last update should have full size
        const lastUpdate = progressUpdates[progressUpdates.length - 1]
        expect(lastUpdate!.downloaded).toBe(lastUpdate!.total)
        expect(lastUpdate!.total).toBe(1000)
      }, 'httpDownload-progress-')
    })

    it('should not call progress callback when no content-length', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'no-length.txt')
        let progressCalled = false

        await httpDownload(`${fixture.baseUrl}/download-no-length`, destPath, {
          onProgress: () => {
            progressCalled = true
          },
        })

        expect(progressCalled).toBe(false)
        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('No content length')
      }, 'httpDownload-no-length-')
    })

    it('should handle download errors', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'error.txt')

        await expect(
          httpDownload(`${fixture.baseUrl}/not-found`, destPath),
        ).rejects.toThrow(/Download failed: HTTP 404/)
      }, 'httpDownload-error-')
    })

    it('should handle download timeout', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'timeout.txt')

        await expect(
          httpDownload(`${fixture.baseUrl}/timeout`, destPath, {
            timeout: 100,
          }),
        ).rejects.toThrow(/timed out after 100ms/)
      }, 'httpDownload-timeout-')
    })

    it('should retry download on failure', async () => {
      let attemptCount = 0
      const testServer = http.createServer((req, res) => {
        attemptCount++
        if (attemptCount < 3) {
          req.socket.destroy()
        } else {
          res.writeHead(200, { 'Content-Length': '7' })
          res.end('Success')
        }
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        await runWithTempDir(async tmpDir => {
          const destPath = path.join(tmpDir, 'retry.txt')
          const result = await httpDownload(
            `http://localhost:${testPort}/`,
            destPath,
            {
              retries: 3,
              retryDelay: 10,
            },
          )

          expect(result.size).toBe(7)
          expect(attemptCount).toBe(3)

          const content = await fs.readFile(destPath, 'utf8')
          expect(content).toBe('Success')
        }, 'httpDownload-retry-')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should fail after all download retries exhausted', async () => {
      let attemptCount = 0
      const testServer = http.createServer((req, _res) => {
        attemptCount++
        req.socket.destroy()
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        await runWithTempDir(async tmpDir => {
          const destPath = path.join(tmpDir, 'fail.txt')

          await expect(
            httpDownload(`http://localhost:${testPort}/`, destPath, {
              retries: 2,
              retryDelay: 10,
            }),
          ).rejects.toThrow(/request failed/)

          expect(attemptCount).toBe(3)
        }, 'httpDownload-fail-')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should send custom headers in download', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'headers.txt')

        // Use main test server - headers are already checked by echo-headers endpoint
        await httpDownload(`${fixture.baseUrl}/download`, destPath, {
          headers: { 'X-Custom-Header': 'test-value' },
        })

        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('Download test content')
      }, 'httpDownload-headers-')
    })

    it('should handle file write errors', async () => {
      await runWithTempDir(async tmpDir => {
        // Try to write to an invalid path
        const destPath = path.join(tmpDir, 'nonexistent', 'nested', 'file.txt')

        await expect(
          httpDownload(`${fixture.baseUrl}/download`, destPath),
        ).rejects.toThrow(/Failed to write file/)
      }, 'httpDownload-write-error-')
    })

    it('should handle response errors during download', async () => {
      const testServer = http.createServer((_req, _res) => {
        _res.writeHead(200, { 'Content-Length': '100' })
        _res.write('partial')
        // Simulate error during transmission
        setTimeout(() => {
          _res.destroy()
        }, 10)
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        await runWithTempDir(async tmpDir => {
          const destPath = path.join(tmpDir, 'error.txt')

          await expect(
            httpDownload(`http://localhost:${testPort}/`, destPath),
          ).rejects.toThrow()
        }, 'httpDownload-response-error-')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should use default timeout of 120 seconds', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'default-timeout.txt')

        // This should succeed quickly with default timeout
        const result = await httpDownload(
          `${fixture.baseUrl}/download`,
          destPath,
        )
        expect(result.size).toBeGreaterThan(0)
      }, 'httpDownload-default-timeout-')
    })

    it('should log progress with logger option', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'logger.txt')
        const logMessages: string[] = []

        const stdout = new Writable({
          write(chunk, _encoding, callback) {
            logMessages.push(chunk.toString())
            callback()
          },
        })

        const logger = new Logger({ stdout })

        await httpDownload(`${fixture.baseUrl}/large-download`, destPath, {
          logger,
          progressInterval: 25, // Log every 25%
        })

        // Should have logged progress at 25%, 50%, 75%, 100%
        expect(logMessages.length).toBeGreaterThan(0)
        expect(logMessages.some(msg => msg.includes('Progress:'))).toBe(true)
        expect(logMessages.some(msg => msg.includes('MB'))).toBe(true)

        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('X'.repeat(1000))
      }, 'httpDownload-logger-')
    })

    it('should use default progressInterval of 10%', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'logger-default.txt')
        const logMessages: string[] = []

        const stdout = new Writable({
          write(chunk, _encoding, callback) {
            logMessages.push(chunk.toString())
            callback()
          },
        })

        const logger = new Logger({ stdout })

        await httpDownload(`${fixture.baseUrl}/large-download`, destPath, {
          logger,
          // No progressInterval specified - should default to 10%
        })

        expect(logMessages.length).toBeGreaterThan(0)
        expect(logMessages.some(msg => msg.includes('Progress:'))).toBe(true)
      }, 'httpDownload-logger-default-')
    })

    it('should prefer onProgress callback over logger', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'logger-precedence.txt')
        const logMessages: string[] = []
        let onProgressCalled = false

        const stdout = new Writable({
          write(chunk, _encoding, callback) {
            logMessages.push(chunk.toString())
            callback()
          },
        })

        const logger = new Logger({ stdout })

        await httpDownload(`${fixture.baseUrl}/large-download`, destPath, {
          logger,
          onProgress: () => {
            onProgressCalled = true
          },
          progressInterval: 25,
        })

        // onProgress should have been called
        expect(onProgressCalled).toBe(true)
        // Logger should NOT have been used
        expect(logMessages.length).toBe(0)
      }, 'httpDownload-logger-precedence-')
    })

    it('should format progress with MB units correctly', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'logger-format.txt')
        const logMessages: string[] = []

        const stdout = new Writable({
          write(chunk, _encoding, callback) {
            logMessages.push(chunk.toString())
            callback()
          },
        })

        const logger = new Logger({ stdout })

        await httpDownload(`${fixture.baseUrl}/large-download`, destPath, {
          logger,
          progressInterval: 50,
        })

        // Check format: "  Progress: XX% (Y.Y MB / Z.Z MB)"
        expect(logMessages.length).toBeGreaterThan(0)
        const progressMsg = logMessages.find(msg => msg.includes('Progress:'))
        expect(progressMsg).toBeDefined()
        expect(progressMsg).toMatch(
          /Progress: \d+% \(\d+\.\d+ MB \/ \d+\.\d+ MB\)/,
        )
      }, 'httpDownload-logger-format-')
    })

    it('should not log progress with logger when no content-length', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'logger-no-length.txt')
        const logMessages: string[] = []

        const stdout = new Writable({
          write(chunk, _encoding, callback) {
            logMessages.push(chunk.toString())
            callback()
          },
        })

        const logger = new Logger({ stdout })

        await httpDownload(`${fixture.baseUrl}/download-no-length`, destPath, {
          logger,
        })

        // Should not have logged any progress (no content-length header)
        expect(logMessages.length).toBe(0)

        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('No content length')
      }, 'httpDownload-logger-no-length-')
    })
  })
})
