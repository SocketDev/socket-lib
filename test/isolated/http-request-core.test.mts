/**
 * @file Unit tests for HTTP/HTTPS request utilities — core surface. Half-split
 *   of the original test/isolated/http-request.test.mts to keep each test file
 *   under the 4 GB per-worker heap ceiling. This file covers the core surface:
 *   httpRequest, httpDownload, parseChecksums, fetchChecksums, httpJson,
 *   httpText. Advanced topics (edge cases, options, retries, error handling)
 *   live in http-request-advanced.test.mts. Both files share the same test
 *   server via http-request-fixtures.mts.
 */

import { createHash } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import {
  fetchChecksums,
  parseChecksums,
} from '../../src/http-request/checksums'
import { httpJson, httpText } from '../../src/http-request/convenience'
import { getSocketCallerUserAgent } from '../../src/http-request/user-agent'
import { httpDownload } from '../../src/http-request/download'
import { httpRequest } from '../../src/http-request/request'
import { Logger } from '../../src/logger/logger'

import { fixture, setupHttpFixture } from './http-request-fixtures'
import { runWithTempDir } from '../unit/util/temp-file-helper'

setupHttpFixture()

describe('http-request', () => {
  describe('httpRequest', () => {
    it('should make a simple GET request', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/text`)

      expect(response.status).toBe(200)
      expect(response.ok).toBe(true)
      expect(response.statusText).toBe('OK')
      expect(response.text()).toBe('Plain text response')
    })

    it('should parse JSON response', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/json`)

      expect(response.status).toBe(200)
      expect(response.ok).toBe(true)
      const data = response.json<{ message: string; status: string }>()
      expect(data.message).toBe('Hello, World!')
      expect(data.status).toBe('success')
    })

    it('should handle 404 errors', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/not-found`)

      expect(response.status).toBe(404)
      expect(response.ok).toBe(false)
      expect(response.statusText).toBe('Not Found')
      expect(response.text()).toBe('Not Found')
    })

    it('should handle 500 errors', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/server-error`)

      expect(response.status).toBe(500)
      expect(response.ok).toBe(false)
      expect(response.text()).toBe('Internal Server Error')
    })

    it('should follow redirects by default', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/redirect`)

      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })

    it('should follow absolute URL redirects', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/redirect-absolute`)

      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })

    it('should not follow redirects when followRedirects is false', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/no-redirect`, {
        followRedirects: false,
      })

      expect(response.status).toBe(301)
      expect(response.ok).toBe(false)
      expect(response.headers.location).toBe('/text')
    })

    it('should handle too many redirects', async () => {
      await expect(
        httpRequest(`${fixture.baseUrl}/redirect-loop-1`, { maxRedirects: 3 }),
      ).rejects.toThrow(/Too many redirects/)
    })

    it('should make POST request', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/post-success`, {
        method: 'POST',
      })

      expect(response.status).toBe(201)
      expect(response.json<{ created: boolean }>().created).toBe(true)
    })

    it('should send request body as string', async () => {
      const body = JSON.stringify({ test: 'data' })
      const response = await httpRequest(`${fixture.baseUrl}/echo-body`, {
        body,
        method: 'POST',
      })

      expect(response.text()).toBe(body)
    })

    it('should send request body as Buffer', async () => {
      const buffer = Buffer.from('binary data')
      const response = await httpRequest(`${fixture.baseUrl}/echo-body`, {
        body: buffer,
        method: 'POST',
      })

      expect(response.text()).toBe('binary data')
    })

    it('should send custom headers', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/echo-headers`, {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      })

      const headers = response.json<Record<string, string>>()
      expect(headers['x-custom-header']).toBe('custom-value')
      expect(headers['user-agent']).toBe(getSocketCallerUserAgent())
    })

    it('should handle custom User-Agent', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/echo-headers`, {
        headers: {
          'User-Agent': 'my-custom-agent',
        },
      })

      const headers = response.json<Record<string, string>>()
      expect(headers['user-agent']).toBe('my-custom-agent')
    })

    it('should support different HTTP methods', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

      const results = await Promise.all(
        methods.map(async method => {
          const response = await httpRequest(`${fixture.baseUrl}/echo-method`, {
            method,
          })
          return { method, text: response.text() }
        }),
      )

      for (const result of results) {
        expect(result.text).toBe(result.method)
      }
    })

    it('should get arrayBuffer from response', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/binary`)

      const arrayBuffer = response.arrayBuffer()
      const view = new Uint8Array(arrayBuffer)
      expect(Array.from(view)).toEqual([
        0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd,
      ])
    })

    it('should expose body as Buffer', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/binary`)

      expect(Buffer.isBuffer(response.body)).toBe(true)
      expect(Array.from(response.body)).toEqual([
        0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd,
      ])
    })

    it('should handle timeout', async () => {
      await expect(
        httpRequest(`${fixture.baseUrl}/timeout`, { timeout: 100 }),
      ).rejects.toThrow(/timed out after 100ms/)
    })

    it('should complete before timeout', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/slow`, {
        timeout: 2000,
      })
      expect(response.text()).toBe('Slow response')
    })

    it('should retry on failure', async () => {
      let attemptCount = 0
      const testServer = http.createServer((req, res) => {
        attemptCount++
        if (attemptCount < 3) {
          // Fail first 2 attempts
          req.socket.destroy()
        } else {
          // Succeed on 3rd attempt
          res.writeHead(200)
          res.end('Success after retries')
        }
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const response = await httpRequest(`http://localhost:${testPort}/`, {
          retries: 3,
          retryDelay: 10,
        })
        expect(response.text()).toBe('Success after retries')
        expect(attemptCount).toBe(3)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should fail after all retries exhausted', async () => {
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
        await expect(
          httpRequest(`http://localhost:${testPort}/`, {
            retries: 2,
            retryDelay: 10,
          }),
        ).rejects.toThrow(/request failed/)
        expect(attemptCount).toBe(3) // Initial attempt + 2 retries
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should handle network errors', async () => {
      await expect(
        httpRequest('http://localhost:1/nonexistent', { timeout: 100 }),
      ).rejects.toThrow(/request failed/)
    })

    it('should handle invalid URLs gracefully', async () => {
      await expect(httpRequest('not-a-url')).rejects.toThrow()
    })

    it('should retry up to the configured count on connection failure', async () => {
      // We assert the observable behaviour (attempt count == initial + retries)
      // rather than wall-clock elapsed time, which is flaky on slow CI runners.
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
        await httpRequest(`http://localhost:${testPort}/`, {
          retries: 2,
          retryDelay: 100,
        }).catch(() => {
          // Expected to fail — server resets the socket every time.
        })

        // Initial + 2 retries = 3 attempts.
        expect(attemptCount).toBe(3)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should handle connection close without response', async () => {
      const testServer = http.createServer((_req, _res) => {
        // Close connection without sending response
        _res.socket?.destroy()
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        await expect(
          httpRequest(`http://localhost:${testPort}/`),
        ).rejects.toThrow(/request failed/)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })
  })

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

    it('should verify sha256 checksum when provided', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'checksum.txt')
        const content = 'Test content for checksum verification'
        const expectedHash = createHash('sha256').update(content).digest('hex')

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

    it('should verify checksum using fetchChecksums', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'checksum-url.txt')

        // Fetch checksums first, then use the hash.
        const checksums = await fetchChecksums(
          `${fixture.baseUrl}/checksums.txt`,
        )
        expect(checksums['checksum-file']).toBeDefined()

        const result = await httpDownload(
          `${fixture.baseUrl}/checksum-file`,
          destPath,
          { sha256: checksums['checksum-file'] },
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
        const expectedHash = createHash('sha256')
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
      const expectedHash = createHash('sha256').update(content).digest('hex')

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

  describe('parseChecksums', () => {
    it('should parse GNU-style checksums (two spaces)', () => {
      const text = `
abc123def456789012345678901234567890123456789012345678901234abcd  file1.txt
fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab  file2.zip
`
      const checksums = parseChecksums(text)

      expect(checksums['file1.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
      expect(checksums['file2.zip']).toBe(
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab',
      )
    })

    it('should parse simple-style checksums (single space)', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd file.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['file.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should parse BSD-style checksums', () => {
      const text =
        'SHA256 (myfile.tar.gz) = abc123def456789012345678901234567890123456789012345678901234abcd\n'
      const checksums = parseChecksums(text)

      expect(checksums['myfile.tar.gz']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should ignore comments and empty lines', () => {
      const text = `
# This is a comment
abc123def456789012345678901234567890123456789012345678901234abcd  file.txt

# Another comment
`
      const checksums = parseChecksums(text)

      expect(Object.keys(checksums)).toHaveLength(1)
      expect(checksums['file.txt']).toBeDefined()
    })

    it('should normalize hashes to lowercase', () => {
      const text =
        'ABC123DEF456789012345678901234567890123456789012345678901234ABCD  FILE.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['FILE.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should return empty object for empty input', () => {
      const checksums = parseChecksums('')
      expect(Object.keys(checksums)).toHaveLength(0)
    })

    it('should handle filenames with spaces', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd  file with spaces.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['file with spaces.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should handle mixed formats in same file', () => {
      const text = `
# Mixed format checksums file
abc123def456789012345678901234567890123456789012345678901234abcd  gnu-style.txt
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef bsd-single.txt
SHA256 (bsd-paren.tar.gz) = fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab
`
      const checksums = parseChecksums(text)

      expect(checksums['gnu-style.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
      expect(checksums['bsd-single.txt']).toBe(
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      )
      expect(checksums['bsd-paren.tar.gz']).toBe(
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab',
      )
    })

    it('should skip invalid lines', () => {
      const text = `
abc123def456789012345678901234567890123456789012345678901234abcd  valid.txt
this is not a valid checksum line
tooshort  invalid.txt
abc123def456789012345678901234567890123456789012345678901234abcd
`
      const checksums = parseChecksums(text)

      expect(Object.keys(checksums)).toHaveLength(1)
      expect(checksums['valid.txt']).toBeDefined()
    })

    it('should handle filenames with paths', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd  path/to/file.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['path/to/file.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should handle tab separator', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd\tfile.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['file.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should handle Windows line endings (CRLF)', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd  file1.txt\r\n' +
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab  file2.txt\r\n'
      const checksums = parseChecksums(text)

      expect(checksums['file1.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
      expect(checksums['file2.txt']).toBe(
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab',
      )
    })
  })

  describe('fetchChecksums', () => {
    it('should fetch and parse checksums from URL', async () => {
      const checksums = await fetchChecksums(`${fixture.baseUrl}/checksums.txt`)

      expect(checksums['checksum-file']).toBeDefined()
      expect(checksums['checksum-file']).toHaveLength(64)
      expect(checksums['other-file']).toBe(
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      )
    })

    it('should handle single-space separator format', async () => {
      const checksums = await fetchChecksums(
        `${fixture.baseUrl}/checksums-single-space.txt`,
      )

      expect(checksums['checksum-file']).toBeDefined()
      expect(checksums['checksum-file']).toHaveLength(64)
    })

    it('should throw when URL returns 404', async () => {
      await expect(
        fetchChecksums(`${fixture.baseUrl}/not-found`),
      ).rejects.toThrow(/Failed to fetch checksums/)
    })

    it('should pass custom headers', async () => {
      // Just verify it doesn't throw with custom headers.
      const checksums = await fetchChecksums(
        `${fixture.baseUrl}/checksums.txt`,
        {
          headers: { 'X-Custom': 'value' },
        },
      )

      expect(checksums['checksum-file']).toBeDefined()
    })

    it('should respect timeout option', async () => {
      await expect(
        fetchChecksums(`${fixture.baseUrl}/timeout`, { timeout: 100 }),
      ).rejects.toThrow(/timed out/)
    })

    it('should return empty object for empty checksums file', async () => {
      const checksums = await fetchChecksums(
        `${fixture.baseUrl}/checksums-empty.txt`,
      )

      expect(Object.keys(checksums)).toHaveLength(0)
    })

    it('should return object with null prototype', async () => {
      const checksums = await fetchChecksums(`${fixture.baseUrl}/checksums.txt`)

      // Verify no prototype pollution possible.
      expect(Object.getPrototypeOf(checksums)).toBeNull()
      expect(checksums['constructor']).toBeUndefined()
      expect('toString' in checksums).toBe(false)
    })
  })

  describe('httpJson', () => {
    it('should get and parse JSON', async () => {
      const data = await httpJson<{ message: string; status: string }>(
        `${fixture.baseUrl}/json`,
      )

      expect(data.message).toBe('Hello, World!')
      expect(data.status).toBe('success')
    })

    it('should throw on non-ok response', async () => {
      await expect(httpJson(`${fixture.baseUrl}/not-found`)).rejects.toThrow(
        /HTTP 404/,
      )
    })

    it('should throw on invalid JSON', async () => {
      await expect(httpJson(`${fixture.baseUrl}/invalid-json`)).rejects.toThrow(
        /Failed to parse JSON/,
      )
    })

    it('should pass options to httpRequest', async () => {
      const data = await httpJson(`${fixture.baseUrl}/json`, {
        headers: { 'X-Test': 'value' },
        timeout: 5000,
      })

      expect(data).toBeDefined()
    })

    it('should support retries', async () => {
      let attemptCount = 0
      const testServer = http.createServer((req, res) => {
        attemptCount++
        if (attemptCount < 2) {
          req.socket.destroy()
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ retries: 'worked' }))
        }
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const data = await httpJson<{ retries: string }>(
          `http://localhost:${testPort}/`,
          {
            retries: 2,
            retryDelay: 10,
          },
        )

        expect(data.retries).toBe('worked')
        expect(attemptCount).toBe(2)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should handle server errors', async () => {
      await expect(httpJson(`${fixture.baseUrl}/server-error`)).rejects.toThrow(
        /HTTP 500/,
      )
    })

    it('should set Accept: application/json by default', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ accept: req.headers.accept }))
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const data = await httpJson<{ accept: string }>(
          `http://localhost:${testPort}/`,
        )
        expect(data.accept).toBe('application/json')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should set Content-Type: application/json when body is present', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ contentType: req.headers['content-type'] }))
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const data = await httpJson<{ contentType: string }>(
          `http://localhost:${testPort}/`,
          {
            method: 'POST',
            body: JSON.stringify({ test: 'data' }),
          },
        )
        expect(data.contentType).toBe('application/json')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should not set Content-Type when body is absent', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            // oxlint-disable-next-line socket/prefer-undefined-over-null -- JSON.stringify drops undefined keys; null preserves the field so toBeNull() can assert.
            contentType: req.headers['content-type'] || null,
          }),
        )
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const data = await httpJson<{ contentType: string | null }>(
          `http://localhost:${testPort}/`,
        )
        expect(data.contentType).toBeNull()
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should not set Content-Type when body is empty string', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            // oxlint-disable-next-line socket/prefer-undefined-over-null -- JSON.stringify drops undefined keys; null preserves the field so toBeNull() can assert.
            contentType: req.headers['content-type'] || null,
          }),
        )
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const data = await httpJson<{ contentType: string | null }>(
          `http://localhost:${testPort}/`,
          {
            method: 'POST',
            body: '',
          },
        )
        expect(data.contentType).toBeNull()
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should allow overriding default headers', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            accept: req.headers.accept,
            contentType: req.headers['content-type'],
          }),
        )
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const data = await httpJson<{
          accept: string
          contentType: string
        }>(`http://localhost:${testPort}/`, {
          method: 'POST',
          body: JSON.stringify({ test: 'data' }),
          headers: {
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
          },
        })
        expect(data.accept).toBe('application/vnd.api+json')
        expect(data.contentType).toBe('application/vnd.api+json')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })
  })

  describe('httpText', () => {
    it('should get text response', async () => {
      const text = await httpText(`${fixture.baseUrl}/text`)

      expect(text).toBe('Plain text response')
    })

    it('should throw on non-ok response', async () => {
      await expect(httpText(`${fixture.baseUrl}/not-found`)).rejects.toThrow(
        /HTTP 404/,
      )
    })

    it('should pass options to httpRequest', async () => {
      const text = await httpText(`${fixture.baseUrl}/text`, {
        headers: { 'X-Test': 'value' },
        timeout: 5000,
      })

      expect(text).toBe('Plain text response')
    })

    it('should support retries', async () => {
      let attemptCount = 0
      const testServer = http.createServer((req, res) => {
        attemptCount++
        if (attemptCount < 2) {
          req.socket.destroy()
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('Retry success')
        }
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const text = await httpText(`http://localhost:${testPort}/`, {
          retries: 2,
          retryDelay: 10,
        })

        expect(text).toBe('Retry success')
        expect(attemptCount).toBe(2)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should handle server errors', async () => {
      await expect(httpText(`${fixture.baseUrl}/server-error`)).rejects.toThrow(
        /HTTP 500/,
      )
    })

    it('should handle binary content as text', async () => {
      const text = await httpText(`${fixture.baseUrl}/binary`)

      expect(text).toBeDefined()
      expect(text.length).toBeGreaterThan(0)
    })

    it('should set Accept: text/plain by default', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(req.headers.accept || '')
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const text = await httpText(`http://localhost:${testPort}/`)
        expect(text).toBe('text/plain')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should set Content-Type: text/plain when body is present', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(req.headers['content-type'] || '')
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const text = await httpText(`http://localhost:${testPort}/`, {
          method: 'POST',
          body: 'test data',
        })
        expect(text).toBe('text/plain')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should not set Content-Type when body is absent', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(req.headers['content-type'] || 'no-content-type')
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const text = await httpText(`http://localhost:${testPort}/`)
        expect(text).toBe('no-content-type')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should not set Content-Type when body is empty string', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(req.headers['content-type'] || 'no-content-type')
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const text = await httpText(`http://localhost:${testPort}/`, {
          method: 'POST',
          body: '',
        })
        expect(text).toBe('no-content-type')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should allow overriding default headers', async () => {
      const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(
          `Accept: ${req.headers.accept}, Content-Type: ${req.headers['content-type']}`,
        )
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const text = await httpText(`http://localhost:${testPort}/`, {
          method: 'POST',
          body: 'test data',
          headers: {
            Accept: 'text/html',
            'Content-Type': 'text/csv',
          },
        })
        expect(text).toBe('Accept: text/html, Content-Type: text/csv')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })
  })
})
