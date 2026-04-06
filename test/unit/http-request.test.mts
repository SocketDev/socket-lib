/**
 * @fileoverview Unit tests for HTTP/HTTPS request utilities.
 *
 * Tests HTTP client utilities with local test server:
 * - httpRequest() low-level HTTP request function
 * - httpText() fetches and returns text content
 * - httpJson() fetches and parses JSON responses
 * - httpDownload() downloads files to disk
 * - Redirect following, timeout handling, error cases
 * - Custom headers, user agent, retry logic
 * Used by Socket tools for API communication (registry, GitHub, GHSA).
 */

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { Writable } from 'node:stream'

import {
  enrichErrorMessage,
  fetchChecksums,
  HttpResponseError,
  httpDownload,
  httpJson,
  httpRequest,
  httpText,
  parseChecksums,
  parseRetryAfter,
  readIncomingResponse,
  sanitizeHeaders,
} from '@socketsecurity/lib/http-request'
import type {
  HttpHookRequestInfo,
  HttpHookResponseInfo,
  IncomingRequest,
  IncomingResponse,
} from '@socketsecurity/lib/http-request'
import { Logger } from '@socketsecurity/lib/logger'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runWithTempDir } from './utils/temp-file-helper'

// Test server setup
let httpServer: http.Server
let httpPort: number
let httpBaseUrl: string

beforeAll(async () => {
  // Create HTTP test server
  await new Promise<void>(resolve => {
    httpServer = http.createServer((req, res) => {
      const url = req.url || ''

      // Handle different test endpoints
      if (url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Hello, World!', status: 'success' }))
      } else if (url === '/text') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Plain text response')
      } else if (url === '/redirect') {
        res.writeHead(302, { Location: '/text' })
        res.end()
      } else if (url === '/redirect-absolute') {
        res.writeHead(302, { Location: `${httpBaseUrl}/text` })
        res.end()
      } else if (url === '/redirect-loop-1') {
        res.writeHead(302, { Location: '/redirect-loop-2' })
        res.end()
      } else if (url === '/redirect-loop-2') {
        res.writeHead(302, { Location: '/redirect-loop-3' })
        res.end()
      } else if (url === '/redirect-loop-3') {
        res.writeHead(302, { Location: '/redirect-loop-4' })
        res.end()
      } else if (url === '/redirect-loop-4') {
        res.writeHead(302, { Location: '/redirect-loop-5' })
        res.end()
      } else if (url === '/redirect-loop-5') {
        res.writeHead(302, { Location: '/redirect-loop-6' })
        res.end()
      } else if (url === '/redirect-loop-6') {
        res.writeHead(302, { Location: '/text' })
        res.end()
      } else if (url === '/not-found') {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
      } else if (url === '/server-error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal Server Error')
      } else if (url === '/timeout') {
        // Don't respond - simulate timeout
        return
      } else if (url === '/slow') {
        // Respond after delay
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('Slow response')
        }, 100)
      } else if (url === '/echo-method') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(req.method)
      } else if (url === '/echo-body') {
        let body = ''
        req.on('data', chunk => {
          body += chunk.toString()
        })
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end(body)
        })
      } else if (url === '/echo-headers') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(req.headers))
      } else if (url === '/binary') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd])
        res.end(buffer)
      } else if (url === '/download') {
        const content = 'Download test content'
        res.writeHead(200, {
          'Content-Length': String(content.length),
          'Content-Type': 'text/plain',
        })
        // Send data in chunks to test progress
        const chunk1 = content.slice(0, 10)
        const chunk2 = content.slice(10)
        res.write(chunk1)
        setTimeout(() => {
          res.end(chunk2)
        }, 10)
      } else if (url === '/large-download') {
        const content = 'X'.repeat(1000)
        res.writeHead(200, {
          'Content-Length': String(content.length),
          'Content-Type': 'text/plain',
        })
        res.end(content)
      } else if (url === '/download-no-length') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('No content length')
      } else if (url === '/invalid-json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('not valid json{')
      } else if (url === '/checksum-file') {
        // File with known content for checksum testing.
        const content = 'Test content for checksum verification'
        res.writeHead(200, {
          'Content-Length': String(content.length),
          'Content-Type': 'text/plain',
        })
        res.end(content)
      } else if (url === '/checksums.txt') {
        // Checksums file in standard format: "hash  filename".
        const content = 'Test content for checksum verification'
        const hash = createHash('sha256').update(content).digest('hex')
        const checksums = `${hash}  checksum-file\nabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890  other-file\n`
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(checksums)
      } else if (url === '/checksums-single-space.txt') {
        // Checksums file with single space separator.
        const content = 'Test content for checksum verification'
        const hash = createHash('sha256').update(content).digest('hex')
        const checksums = `${hash} checksum-file\n`
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(checksums)
      } else if (url === '/checksums-missing.txt') {
        // Checksums file without our target file.
        const checksums =
          'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890  other-file\n'
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(checksums)
      } else if (url === '/checksums-empty.txt') {
        // Empty checksums file (only comments).
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('# This file has no checksums\n\n')
      } else if (url === '/large-body') {
        const content = 'X'.repeat(10_000)
        res.writeHead(200, {
          'Content-Length': String(content.length),
          'Content-Type': 'text/plain',
        })
        res.end(content)
      } else if (url === '/post-success') {
        if (req.method === 'POST') {
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ created: true }))
        } else {
          res.writeHead(405)
          res.end()
        }
      } else if (url === '/no-redirect') {
        res.writeHead(301, { Location: '/text' })
        res.end()
      } else if (url === '/upload-form') {
        let body = ''
        req.on('data', chunk => {
          body += chunk.toString()
        })
        req.on('end', () => {
          const contentType = req.headers['content-type'] || ''
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              contentType,
              bodyLength: body.length,
              hasMultipart: contentType.includes('multipart'),
            }),
          )
        })
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')
      }
    })

    httpServer.listen(0, () => {
      const address = httpServer.address()
      if (address && typeof address === 'object') {
        httpPort = address.port
        httpBaseUrl = `http://localhost:${httpPort}`
      }
      resolve()
    })
  })

  // Create HTTPS test server (self-signed)
  await new Promise<void>(resolve => {
    // For testing, we'll skip HTTPS server as it requires certificates
    // In production tests, you would set up proper certificates
    resolve()
  })
})

afterAll(async () => {
  await new Promise<void>(resolve => {
    httpServer.close(() => resolve())
  })
})

function makeRawRequest(url: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    http.get(url, resolve).on('error', reject)
  })
}

describe('http-request', () => {
  describe('httpRequest', () => {
    it('should make a simple GET request', async () => {
      const response = await httpRequest(`${httpBaseUrl}/text`)

      expect(response.status).toBe(200)
      expect(response.ok).toBe(true)
      expect(response.statusText).toBe('OK')
      expect(response.text()).toBe('Plain text response')
    })

    it('should parse JSON response', async () => {
      const response = await httpRequest(`${httpBaseUrl}/json`)

      expect(response.status).toBe(200)
      expect(response.ok).toBe(true)
      const data = response.json<{ message: string; status: string }>()
      expect(data.message).toBe('Hello, World!')
      expect(data.status).toBe('success')
    })

    it('should handle 404 errors', async () => {
      const response = await httpRequest(`${httpBaseUrl}/not-found`)

      expect(response.status).toBe(404)
      expect(response.ok).toBe(false)
      expect(response.statusText).toBe('Not Found')
      expect(response.text()).toBe('Not Found')
    })

    it('should handle 500 errors', async () => {
      const response = await httpRequest(`${httpBaseUrl}/server-error`)

      expect(response.status).toBe(500)
      expect(response.ok).toBe(false)
      expect(response.text()).toBe('Internal Server Error')
    })

    it('should follow redirects by default', async () => {
      const response = await httpRequest(`${httpBaseUrl}/redirect`)

      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })

    it('should follow absolute URL redirects', async () => {
      const response = await httpRequest(`${httpBaseUrl}/redirect-absolute`)

      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })

    it('should not follow redirects when followRedirects is false', async () => {
      const response = await httpRequest(`${httpBaseUrl}/no-redirect`, {
        followRedirects: false,
      })

      expect(response.status).toBe(301)
      expect(response.ok).toBe(false)
      expect(response.headers.location).toBe('/text')
    })

    it('should handle too many redirects', async () => {
      await expect(
        httpRequest(`${httpBaseUrl}/redirect-loop-1`, { maxRedirects: 3 }),
      ).rejects.toThrow(/Too many redirects/)
    })

    it('should make POST request', async () => {
      const response = await httpRequest(`${httpBaseUrl}/post-success`, {
        method: 'POST',
      })

      expect(response.status).toBe(201)
      expect(response.json<{ created: boolean }>().created).toBe(true)
    })

    it('should send request body as string', async () => {
      const body = JSON.stringify({ test: 'data' })
      const response = await httpRequest(`${httpBaseUrl}/echo-body`, {
        body,
        method: 'POST',
      })

      expect(response.text()).toBe(body)
    })

    it('should send request body as Buffer', async () => {
      const buffer = Buffer.from('binary data')
      const response = await httpRequest(`${httpBaseUrl}/echo-body`, {
        body: buffer,
        method: 'POST',
      })

      expect(response.text()).toBe('binary data')
    })

    it('should send custom headers', async () => {
      const response = await httpRequest(`${httpBaseUrl}/echo-headers`, {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      })

      const headers = response.json<Record<string, string>>()
      expect(headers['x-custom-header']).toBe('custom-value')
      expect(headers['user-agent']).toBe('socket-registry/1.0')
    })

    it('should handle custom User-Agent', async () => {
      const response = await httpRequest(`${httpBaseUrl}/echo-headers`, {
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
          const response = await httpRequest(`${httpBaseUrl}/echo-method`, {
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
      const response = await httpRequest(`${httpBaseUrl}/binary`)

      const arrayBuffer = response.arrayBuffer()
      const view = new Uint8Array(arrayBuffer)
      expect(Array.from(view)).toEqual([
        0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd,
      ])
    })

    it('should expose body as Buffer', async () => {
      const response = await httpRequest(`${httpBaseUrl}/binary`)

      expect(Buffer.isBuffer(response.body)).toBe(true)
      expect(Array.from(response.body)).toEqual([
        0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd,
      ])
    })

    it('should handle timeout', async () => {
      await expect(
        httpRequest(`${httpBaseUrl}/timeout`, { timeout: 100 }),
      ).rejects.toThrow(/timed out after 100ms/)
    })

    it('should complete before timeout', async () => {
      const response = await httpRequest(`${httpBaseUrl}/slow`, {
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

    it('should use exponential backoff for retries', async () => {
      const startTime = Date.now()
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
          // Expected to fail
        })

        const elapsed = Date.now() - startTime
        // Should wait at least 100ms + 200ms = 300ms for exponential backoff
        expect(elapsed).toBeGreaterThanOrEqual(200)
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
        const result = await httpDownload(`${httpBaseUrl}/download`, destPath)

        expect(result.path).toBe(destPath)
        expect(result.size).toBeGreaterThan(0)

        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('Download test content')
      }, 'httpDownload-basic-')
    })

    it('should track download progress', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'progress.txt')
        const progressUpdates: Array<{ downloaded: number; total: number }> = []

        await httpDownload(`${httpBaseUrl}/large-download`, destPath, {
          onProgress: (downloaded, total) => {
            progressUpdates.push({ downloaded, total })
          },
        })

        expect(progressUpdates.length).toBeGreaterThan(0)
        // Last update should have full size
        const lastUpdate = progressUpdates[progressUpdates.length - 1]
        expect(lastUpdate.downloaded).toBe(lastUpdate.total)
        expect(lastUpdate.total).toBe(1000)
      }, 'httpDownload-progress-')
    })

    it('should not call progress callback when no content-length', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'no-length.txt')
        let progressCalled = false

        await httpDownload(`${httpBaseUrl}/download-no-length`, destPath, {
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
          httpDownload(`${httpBaseUrl}/not-found`, destPath),
        ).rejects.toThrow(/Download failed: HTTP 404/)
      }, 'httpDownload-error-')
    })

    it('should handle download timeout', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'timeout.txt')

        await expect(
          httpDownload(`${httpBaseUrl}/timeout`, destPath, { timeout: 100 }),
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
          ).rejects.toThrow(/HTTP download failed/)

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
        await httpDownload(`${httpBaseUrl}/download`, destPath, {
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
          httpDownload(`${httpBaseUrl}/download`, destPath),
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
        const result = await httpDownload(`${httpBaseUrl}/download`, destPath)
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

        await httpDownload(`${httpBaseUrl}/large-download`, destPath, {
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

        await httpDownload(`${httpBaseUrl}/large-download`, destPath, {
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

        await httpDownload(`${httpBaseUrl}/large-download`, destPath, {
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

        await httpDownload(`${httpBaseUrl}/large-download`, destPath, {
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

        await httpDownload(`${httpBaseUrl}/download-no-length`, destPath, {
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
          `${httpBaseUrl}/checksum-file`,
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
          httpDownload(`${httpBaseUrl}/checksum-file`, destPath, {
            sha256: wrongHash,
          }),
        ).rejects.toThrow(/Checksum verification failed/)

        // File should not exist after failed verification.
        const exists = await fs
          .access(destPath)
          .then(() => true)
          .catch(() => false)
        expect(exists).toBe(false)
      }, 'httpDownload-sha256-fail-')
    })

    it('should verify checksum using fetchChecksums', async () => {
      await runWithTempDir(async tmpDir => {
        const destPath = path.join(tmpDir, 'checksum-url.txt')

        // Fetch checksums first, then use the hash.
        const checksums = await fetchChecksums(`${httpBaseUrl}/checksums.txt`)
        expect(checksums['checksum-file']).toBeDefined()

        const result = await httpDownload(
          `${httpBaseUrl}/checksum-file`,
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
          `${httpBaseUrl}/checksum-file`,
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
          `${httpBaseUrl}/checksum-file`,
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
      const checksums = await fetchChecksums(`${httpBaseUrl}/checksums.txt`)

      expect(checksums['checksum-file']).toBeDefined()
      expect(checksums['checksum-file']).toHaveLength(64)
      expect(checksums['other-file']).toBe(
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      )
    })

    it('should handle single-space separator format', async () => {
      const checksums = await fetchChecksums(
        `${httpBaseUrl}/checksums-single-space.txt`,
      )

      expect(checksums['checksum-file']).toBeDefined()
      expect(checksums['checksum-file']).toHaveLength(64)
    })

    it('should throw when URL returns 404', async () => {
      await expect(fetchChecksums(`${httpBaseUrl}/not-found`)).rejects.toThrow(
        /Failed to fetch checksums/,
      )
    })

    it('should pass custom headers', async () => {
      // Just verify it doesn't throw with custom headers.
      const checksums = await fetchChecksums(`${httpBaseUrl}/checksums.txt`, {
        headers: { 'X-Custom': 'value' },
      })

      expect(checksums['checksum-file']).toBeDefined()
    })

    it('should respect timeout option', async () => {
      await expect(
        fetchChecksums(`${httpBaseUrl}/timeout`, { timeout: 100 }),
      ).rejects.toThrow(/timed out/)
    })

    it('should return empty object for empty checksums file', async () => {
      const checksums = await fetchChecksums(
        `${httpBaseUrl}/checksums-empty.txt`,
      )

      expect(Object.keys(checksums)).toHaveLength(0)
    })

    it('should return object with null prototype', async () => {
      const checksums = await fetchChecksums(`${httpBaseUrl}/checksums.txt`)

      // Verify no prototype pollution possible.
      expect(Object.getPrototypeOf(checksums)).toBeNull()
      expect(checksums['constructor']).toBeUndefined()
      expect('toString' in checksums).toBe(false)
    })
  })

  describe('httpJson', () => {
    it('should get and parse JSON', async () => {
      const data = await httpJson<{ message: string; status: string }>(
        `${httpBaseUrl}/json`,
      )

      expect(data.message).toBe('Hello, World!')
      expect(data.status).toBe('success')
    })

    it('should throw on non-ok response', async () => {
      await expect(httpJson(`${httpBaseUrl}/not-found`)).rejects.toThrow(
        /HTTP 404/,
      )
    })

    it('should throw on invalid JSON', async () => {
      await expect(httpJson(`${httpBaseUrl}/invalid-json`)).rejects.toThrow(
        /Failed to parse JSON/,
      )
    })

    it('should pass options to httpRequest', async () => {
      const data = await httpJson(`${httpBaseUrl}/json`, {
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
      await expect(httpJson(`${httpBaseUrl}/server-error`)).rejects.toThrow(
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
          JSON.stringify({ contentType: req.headers['content-type'] || null }),
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
          JSON.stringify({ contentType: req.headers['content-type'] || null }),
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
      const text = await httpText(`${httpBaseUrl}/text`)

      expect(text).toBe('Plain text response')
    })

    it('should throw on non-ok response', async () => {
      await expect(httpText(`${httpBaseUrl}/not-found`)).rejects.toThrow(
        /HTTP 404/,
      )
    })

    it('should pass options to httpRequest', async () => {
      const text = await httpText(`${httpBaseUrl}/text`, {
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
      await expect(httpText(`${httpBaseUrl}/server-error`)).rejects.toThrow(
        /HTTP 500/,
      )
    })

    it('should handle binary content as text', async () => {
      const text = await httpText(`${httpBaseUrl}/binary`)

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

  describe('edge cases', () => {
    it('should handle empty response body', async () => {
      const testServer = http.createServer((_req, _res) => {
        _res.writeHead(204)
        _res.end()
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const response = await httpRequest(`http://localhost:${testPort}/`)
        expect(response.status).toBe(204)
        expect(response.body.length).toBe(0)
        expect(response.text()).toBe('')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should handle large response bodies', async () => {
      const testServer = http.createServer((_req, res) => {
        const largeContent = 'A'.repeat(1024 * 1024) // 1MB
        res.writeHead(200)
        res.end(largeContent)
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const response = await httpRequest(`http://localhost:${testPort}/`)
        expect(response.body.length).toBe(1024 * 1024)
        expect(response.text().length).toBe(1024 * 1024)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should handle query parameters in URL', async () => {
      const response = await httpRequest(`${httpBaseUrl}/text?foo=bar&baz=qux`)
      expect(response.status).toBe(200)
    })

    it('should handle URL with hash', async () => {
      const response = await httpRequest(`${httpBaseUrl}/text#section`)
      expect(response.status).toBe(200)
    })

    it('should handle 3xx status codes that are not redirects', async () => {
      const testServer = http.createServer((_req, res) => {
        res.writeHead(304) // Not Modified
        res.end()
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const response = await httpRequest(`http://localhost:${testPort}/`)
        expect(response.status).toBe(304)
        expect(response.ok).toBe(false)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should handle redirect with maxRedirects set to 0', async () => {
      await expect(
        httpRequest(`${httpBaseUrl}/redirect`, { maxRedirects: 0 }),
      ).rejects.toThrow(/Too many redirects/)
    })

    it('should handle response with multiple header values', async () => {
      const testServer = http.createServer((_req, res) => {
        res.setHeader('Set-Cookie', ['cookie1=value1', 'cookie2=value2'])
        res.writeHead(200)
        res.end('OK')
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const response = await httpRequest(`http://localhost:${testPort}/`)
        expect(response.headers['set-cookie']).toBeDefined()
        expect(Array.isArray(response.headers['set-cookie'])).toBe(true)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })
  })

  describe('ca option', () => {
    it('should accept ca option on httpRequest without error', async () => {
      // ca is a no-op for HTTP (only applies to HTTPS), but should not throw.
      const response = await httpRequest(`${httpBaseUrl}/text`, {
        ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
      })

      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })

    it('should accept ca option on httpJson without error', async () => {
      const data = await httpJson<{ message: string }>(`${httpBaseUrl}/json`, {
        ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
      })

      expect(data.message).toBe('Hello, World!')
    })

    it('should accept ca option on httpText without error', async () => {
      const text = await httpText(`${httpBaseUrl}/text`, {
        ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
      })

      expect(text).toBe('Plain text response')
    })

    it('should accept ca option on httpDownload without error', async () => {
      await runWithTempDir(async tempDir => {
        const destPath = path.join(tempDir, 'ca-test.txt')
        const result = await httpDownload(`${httpBaseUrl}/download`, destPath, {
          ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
        })

        expect(result.path).toBe(destPath)
        expect(result.size).toBeGreaterThan(0)
      })
    })

    it('should accept ca option on fetchChecksums without error', async () => {
      const checksums = await fetchChecksums(`${httpBaseUrl}/checksums.txt`, {
        ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
      })

      expect(checksums['checksum-file']).toBeDefined()
    })

    it('should pass ca through redirects on httpRequest', async () => {
      // ca should be preserved through redirect chains.
      const response = await httpRequest(`${httpBaseUrl}/redirect`, {
        ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
      })

      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })
  })

  describe('hooks', () => {
    it('should call onRequest with method, url, headers, and timeout', async () => {
      const requestInfos: HttpHookRequestInfo[] = []
      await httpRequest(`${httpBaseUrl}/json`, {
        headers: { 'X-Custom': 'test-value' },
        hooks: {
          onRequest: info => requestInfos.push(info),
        },
      })
      expect(requestInfos).toHaveLength(1)
      expect(requestInfos[0]!.method).toBe('GET')
      expect(requestInfos[0]!.url).toBe(`${httpBaseUrl}/json`)
      expect(requestInfos[0]!.timeout).toBe(30_000)
      expect(requestInfos[0]!.headers['User-Agent']).toBe('socket-registry/1.0')
      expect(requestInfos[0]!.headers['X-Custom']).toBe('test-value')
    })

    it('should call onResponse with status, headers, and duration', async () => {
      const responseInfos: HttpHookResponseInfo[] = []
      await httpRequest(`${httpBaseUrl}/json`, {
        hooks: {
          onResponse: info => responseInfos.push(info),
        },
      })
      expect(responseInfos).toHaveLength(1)
      expect(responseInfos[0]!.method).toBe('GET')
      expect(responseInfos[0]!.url).toBe(`${httpBaseUrl}/json`)
      expect(responseInfos[0]!.status).toBe(200)
      expect(responseInfos[0]!.statusText).toBe('OK')
      expect(responseInfos[0]!.duration).toBeGreaterThanOrEqual(0)
      expect(responseInfos[0]!.error).toBeUndefined()
      expect(responseInfos[0]!.headers?.['content-type']).toContain(
        'application/json',
      )
    })

    it('should call onResponse with error on timeout', async () => {
      const responseInfos: HttpHookResponseInfo[] = []
      await httpRequest(`${httpBaseUrl}/timeout`, {
        timeout: 50,
        hooks: {
          onResponse: info => responseInfos.push(info),
        },
      }).catch(() => {})
      expect(responseInfos).toHaveLength(1)
      expect(responseInfos[0]!.error).toBeDefined()
    })

    it('should fire hooks per-attempt on retries', async () => {
      const requestInfos: HttpHookRequestInfo[] = []
      const responseInfos: HttpHookResponseInfo[] = []

      let attemptCount = 0
      const testServer = http.createServer((_req, _res) => {
        attemptCount++
        _res.socket?.destroy()
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })
      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        await httpRequest(`http://localhost:${testPort}/`, {
          retries: 1,
          retryDelay: 10,
          hooks: {
            onRequest: info => requestInfos.push(info),
            onResponse: info => responseInfos.push(info),
          },
        }).catch(() => {})

        expect(attemptCount).toBe(2)
        expect(requestInfos).toHaveLength(2)
        expect(responseInfos).toHaveLength(2)
        for (const info of responseInfos) {
          expect(info.error).toBeDefined()
        }
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should fire hooks on redirect hops with correct status codes', async () => {
      const requestInfos: HttpHookRequestInfo[] = []
      const responseInfos: HttpHookResponseInfo[] = []

      await httpRequest(`${httpBaseUrl}/redirect`, {
        hooks: {
          onRequest: info => requestInfos.push(info),
          onResponse: info => responseInfos.push(info),
        },
      })

      expect(requestInfos).toHaveLength(2)
      expect(responseInfos).toHaveLength(2)
      expect(responseInfos[0]!.status).toBe(302)
      expect(responseInfos[1]!.status).toBe(200)
    })

    it('should report POST method in hook info', async () => {
      const requestInfos: HttpHookRequestInfo[] = []
      await httpRequest(`${httpBaseUrl}/echo-body`, {
        method: 'POST',
        body: 'test',
        hooks: {
          onRequest: info => requestInfos.push(info),
        },
      })
      expect(requestInfos[0]!.method).toBe('POST')
    })

    it('should work with empty hooks object', async () => {
      const response = await httpRequest(`${httpBaseUrl}/json`, { hooks: {} })
      expect(response.ok).toBe(true)
    })

    it('should pass hooks through httpJson and httpText', async () => {
      const jsonInfos: HttpHookResponseInfo[] = []
      await httpJson(`${httpBaseUrl}/json`, {
        hooks: { onResponse: info => jsonInfos.push(info) },
      })
      expect(jsonInfos).toHaveLength(1)
      expect(jsonInfos[0]!.status).toBe(200)

      const textInfos: HttpHookResponseInfo[] = []
      await httpText(`${httpBaseUrl}/text`, {
        hooks: { onResponse: info => textInfos.push(info) },
      })
      expect(textInfos).toHaveLength(1)
      expect(textInfos[0]!.status).toBe(200)
    })
  })

  describe('maxResponseSize', () => {
    it('should reject responses exceeding limit with size info', async () => {
      try {
        await httpRequest(`${httpBaseUrl}/large-body`, {
          maxResponseSize: 50,
        })
        expect.unreachable('should have thrown')
      } catch (e) {
        const msg = (e as Error).message
        expect(msg).toMatch(/exceeds maximum size limit/)
        expect(msg).toMatch(/MB.*>.*MB/)
      }
    })

    it('should allow responses within limit', async () => {
      const response = await httpRequest(`${httpBaseUrl}/json`, {
        maxResponseSize: 1_000_000,
      })
      expect(response.ok).toBe(true)
    })

    it('should allow response exactly at limit', async () => {
      const probe = await httpRequest(`${httpBaseUrl}/json`)
      const exactSize = probe.body.length

      const response = await httpRequest(`${httpBaseUrl}/json`, {
        maxResponseSize: exactSize,
      })
      expect(response.ok).toBe(true)
      expect(response.body.length).toBe(exactSize)
    })

    it('should treat 0 as no limit', async () => {
      const response = await httpRequest(`${httpBaseUrl}/json`, {
        maxResponseSize: 0,
      })
      expect(response.ok).toBe(true)
    })

    it('should enforce after redirect', async () => {
      await expect(
        httpRequest(`${httpBaseUrl}/redirect`, {
          maxResponseSize: 5,
        }),
      ).rejects.toThrow(/exceeds maximum size limit/)
    })

    it('should work with httpJson and httpText', async () => {
      await expect(
        httpJson(`${httpBaseUrl}/json`, { maxResponseSize: 5 }),
      ).rejects.toThrow(/exceeds maximum size limit/)

      await expect(
        httpText(`${httpBaseUrl}/text`, { maxResponseSize: 5 }),
      ).rejects.toThrow(/exceeds maximum size limit/)
    })

    it('should fire onResponse hook with error on size limit', async () => {
      const responseInfos: HttpHookResponseInfo[] = []
      await httpRequest(`${httpBaseUrl}/large-body`, {
        maxResponseSize: 50,
        hooks: {
          onResponse: info => responseInfos.push(info),
        },
      }).catch(() => {})

      expect(responseInfos).toHaveLength(1)
      expect(responseInfos[0]!.error).toBeDefined()
      expect(responseInfos[0]!.error!.message).toMatch(
        /exceeds maximum size limit/,
      )
    })
  })

  describe('rawResponse', () => {
    it('should expose IncomingMessage with status and headers', async () => {
      const response = await httpRequest(`${httpBaseUrl}/json`)
      expect(response.rawResponse).toBeDefined()
      expect(response.rawResponse!.statusCode).toBe(200)
      expect(response.rawResponse!.headers['content-type']).toContain(
        'application/json',
      )
    })

    it('should be from final response after redirect', async () => {
      const response = await httpRequest(`${httpBaseUrl}/redirect`)
      expect(response.rawResponse).toBeDefined()
      expect(response.rawResponse!.statusCode).toBe(200)
    })

    it('should be available on non-2xx responses', async () => {
      const r404 = await httpRequest(`${httpBaseUrl}/not-found`)
      expect(r404.rawResponse!.statusCode).toBe(404)

      const r500 = await httpRequest(`${httpBaseUrl}/server-error`)
      expect(r500.rawResponse!.statusCode).toBe(500)
    })
  })

  describe('enrichErrorMessage', () => {
    it('should enrich each known error code', () => {
      const cases: Array<[string, string]> = [
        ['ECONNREFUSED', 'Connection refused'],
        ['ENOTFOUND', 'DNS lookup failed'],
        ['ETIMEDOUT', 'Connection timed out'],
        ['ECONNRESET', 'Connection reset'],
        ['EPIPE', 'Broken pipe'],
        ['CERT_HAS_EXPIRED', 'SSL/TLS certificate error'],
        ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SSL/TLS certificate error'],
      ]
      for (const [code, expected] of cases) {
        const err = Object.assign(new Error('test'), {
          code,
        }) as NodeJS.ErrnoException
        const msg = enrichErrorMessage('http://example.com', 'GET', err)
        expect(msg).toContain(expected)
      }
    })

    it('should include method, url, and error code in message', () => {
      const err = Object.assign(new Error('fail'), {
        code: 'ESOMETHING',
      }) as NodeJS.ErrnoException
      const msg = enrichErrorMessage('http://my-server:8080/api', 'DELETE', err)
      expect(msg).toContain('DELETE request failed')
      expect(msg).toContain('http://my-server:8080/api')
      expect(msg).toContain('Error code: ESOMETHING')
    })

    it('should handle errors without a code', () => {
      const err = new Error('generic error') as NodeJS.ErrnoException
      const msg = enrichErrorMessage('http://example.com', 'GET', err)
      expect(msg).toContain('GET request failed')
      expect(msg).not.toContain('Error code:')
    })
  })

  describe('enriched error messages — integration', () => {
    it('should include method and url in timeout errors', async () => {
      try {
        await httpRequest(`${httpBaseUrl}/timeout`, { timeout: 50 })
        expect.unreachable('should have thrown')
      } catch (e) {
        const msg = (e as Error).message
        expect(msg).toContain('GET')
        expect(msg).toContain('timed out')
        expect(msg).toContain(`${httpBaseUrl}/timeout`)
      }
    })

    it('should include method, url, and cause chain on connection errors', async () => {
      try {
        await httpRequest('http://localhost:1/no-server', { timeout: 100 })
        expect.unreachable('should have thrown')
      } catch (e) {
        const msg = (e as Error).message
        expect(msg).toContain('request failed')
        expect(msg).toContain('localhost:1')
        expect((e as Error).cause).toBeDefined()
      }
    })
  })

  describe('type aliases', () => {
    it('IncomingResponse should be assignable from http.IncomingMessage', () => {
      const msg: http.IncomingMessage = {} as http.IncomingMessage
      const response: IncomingResponse = msg
      expect(response).toBe(msg)
    })

    it('IncomingRequest should be assignable from http.IncomingMessage', () => {
      const msg: http.IncomingMessage = {} as http.IncomingMessage
      const request: IncomingRequest = msg
      expect(request).toBe(msg)
    })
  })

  describe('readIncomingResponse', () => {
    it('should read a 200 JSON response', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/json`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
      expect(response.statusText).toBe('OK')
      expect(response.json()).toEqual({
        message: 'Hello, World!',
        status: 'success',
      })
      expect(response.headers['content-type']).toBe('application/json')
      expect(response.rawResponse).toBe(msg)
    })

    it('should read a plain text response', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/text`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })

    it('should handle 404 responses', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/not-found`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(false)
      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Not Found')
      expect(response.text()).toBe('Not Found')
    })

    it('should handle 500 server errors', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/server-error`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(false)
      expect(response.status).toBe(500)
      expect(response.text()).toBe('Internal Server Error')
    })

    it('should provide arrayBuffer from body', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/text`)
      const response = await readIncomingResponse(msg)
      const ab = response.arrayBuffer()

      expect(ab).toBeInstanceOf(ArrayBuffer)
      expect(ab.byteLength).toBeGreaterThan(0)
      expect(Buffer.from(ab).toString('utf8')).toBe('Plain text response')
    })

    it('should handle binary response data', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/binary`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(true)
      expect(response.body.length).toBe(7)
      expect(response.body[0]).toBe(0x00)
      expect(response.body[1]).toBe(0x01)
      expect(response.body[6]).toBe(0xfd)
    })

    it('should produce same result as httpRequest for same endpoint', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/json`)
      const fromRaw = await readIncomingResponse(msg)
      const fromLib = await httpRequest(`${httpBaseUrl}/json`)

      expect(fromRaw.ok).toBe(fromLib.ok)
      expect(fromRaw.status).toBe(fromLib.status)
      expect(fromRaw.json()).toEqual(fromLib.json())
      expect(fromRaw.text()).toBe(fromLib.text())
    })

    it('should handle large response bodies', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/large-body`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(true)
      expect(response.text()).toBe('X'.repeat(10_000))
      expect(response.body.length).toBe(10_000)
    })

    it('should default status to 0 when statusCode is undefined', async () => {
      const { Readable } = await import('node:stream')
      const fakeMsg = new Readable({
        read() {
          this.push('body')
          this.push(null)
        },
      }) as unknown as IncomingResponse
      Object.assign(fakeMsg, {
        headers: {},
        statusCode: undefined,
        statusMessage: undefined,
      })

      const response = await readIncomingResponse(fakeMsg)

      expect(response.status).toBe(0)
      expect(response.statusText).toBe('')
      expect(response.ok).toBe(false)
      expect(response.text()).toBe('body')
    })

    it('should preserve response headers', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/json`)
      const response = await readIncomingResponse(msg)

      expect(response.headers['content-type']).toBe('application/json')
      expect(response.headers).toBeDefined()
    })

    it('should throw on invalid JSON from json()', async () => {
      const msg = await makeRawRequest(`${httpBaseUrl}/text`)
      const response = await readIncomingResponse(msg)

      expect(() => response.json()).toThrow()
    })
  })

  describe('HttpResponseError', () => {
    it('should include status and statusText in message', async () => {
      const response = await httpRequest(`${httpBaseUrl}/not-found`)
      const error = new HttpResponseError(response)

      expect(error.name).toBe('HttpResponseError')
      expect(error.message).toContain('404')
      expect(error.message).toContain('Not Found')
      expect(error.response).toBe(response)
    })

    it('should accept a custom message', async () => {
      const response = await httpRequest(`${httpBaseUrl}/server-error`)
      const error = new HttpResponseError(response, 'Custom error message')

      expect(error.message).toBe('Custom error message')
      expect(error.response.status).toBe(500)
    })

    it('should be an instance of Error', async () => {
      const response = await httpRequest(`${httpBaseUrl}/not-found`)
      const error = new HttpResponseError(response)

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(HttpResponseError)
    })

    it('should have a stack trace', async () => {
      const response = await httpRequest(`${httpBaseUrl}/not-found`)
      const error = new HttpResponseError(response)

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('HttpResponseError')
    })
  })

  describe('throwOnError', () => {
    it('should throw HttpResponseError on 404 when enabled', async () => {
      try {
        await httpRequest(`${httpBaseUrl}/not-found`, { throwOnError: true })
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpResponseError)
        const err = e as HttpResponseError
        expect(err.response.status).toBe(404)
        expect(err.response.text()).toBe('Not Found')
      }
    })

    it('should throw HttpResponseError on 500 when enabled', async () => {
      try {
        await httpRequest(`${httpBaseUrl}/server-error`, { throwOnError: true })
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpResponseError)
        const err = e as HttpResponseError
        expect(err.response.status).toBe(500)
      }
    })

    it('should not throw on 2xx when enabled', async () => {
      const response = await httpRequest(`${httpBaseUrl}/json`, {
        throwOnError: true,
      })
      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
    })

    it('should resolve non-2xx without throwOnError (default)', async () => {
      const response = await httpRequest(`${httpBaseUrl}/not-found`)
      expect(response.ok).toBe(false)
      expect(response.status).toBe(404)
    })

    it('should enable retrying non-2xx responses', async () => {
      let attemptCount = 0
      const testServer = http.createServer((_req, res) => {
        attemptCount++
        if (attemptCount < 3) {
          res.writeHead(500)
          res.end('Server Error')
        } else {
          res.writeHead(200)
          res.end('Recovered')
        }
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const response = await httpRequest(`http://localhost:${testPort}/`, {
          throwOnError: true,
          retries: 3,
          retryDelay: 10,
        })
        expect(response.text()).toBe('Recovered')
        expect(attemptCount).toBe(3)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })
  })

  describe('onRetry', () => {
    it('should call onRetry on each retry attempt', async () => {
      const retryCalls: Array<{ attempt: number; delay: number }> = []
      const testServer = http.createServer((req, _res) => {
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
          retryDelay: 10,
          onRetry: (attempt, _error, delay) => {
            retryCalls.push({ attempt, delay })
            return undefined
          },
        }).catch(() => {})

        expect(retryCalls).toHaveLength(2)
        expect(retryCalls[0]!.attempt).toBe(1)
        expect(retryCalls[1]!.attempt).toBe(2)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should stop retrying when onRetry returns false', async () => {
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
            retries: 5,
            retryDelay: 10,
            onRetry: () => false,
          }),
        ).rejects.toThrow()

        // Only 1 attempt — onRetry returned false, stopping before any retry
        expect(attemptCount).toBe(1)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should override delay when onRetry returns a number', async () => {
      const startTime = Date.now()
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
          retries: 1,
          retryDelay: 5000, // default would be very long
          onRetry: () => 10, // override to 10ms
        }).catch(() => {})

        const elapsed = Date.now() - startTime
        expect(attemptCount).toBe(2)
        // Should be fast since we overrode to 10ms, not 5000ms
        expect(elapsed).toBeLessThan(2000)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should receive HttpResponseError when throwOnError + non-2xx', async () => {
      let receivedError: unknown
      let attemptCount = 0
      const testServer = http.createServer((_req, res) => {
        attemptCount++
        if (attemptCount < 3) {
          res.writeHead(500)
          res.end('Error')
        } else {
          res.writeHead(200)
          res.end('OK')
        }
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const response = await httpRequest(`http://localhost:${testPort}/`, {
          throwOnError: true,
          retries: 3,
          retryDelay: 10,
          onRetry: (_attempt, error) => {
            receivedError = error
            return undefined
          },
        })

        expect(response.text()).toBe('OK')
        expect(receivedError).toBeInstanceOf(HttpResponseError)
        expect((receivedError as HttpResponseError).response.status).toBe(500)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should skip 4xx retries via onRetry returning false', async () => {
      let attemptCount = 0
      const testServer = http.createServer((_req, res) => {
        attemptCount++
        res.writeHead(403)
        res.end('Forbidden')
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        await expect(
          httpRequest(`http://localhost:${testPort}/`, {
            throwOnError: true,
            retries: 3,
            retryDelay: 10,
            onRetry: (_attempt, error) => {
              if (
                error instanceof HttpResponseError &&
                error.response.status >= 400 &&
                error.response.status < 500
              ) {
                return false
              }
              return undefined
            },
          }),
        ).rejects.toThrow(HttpResponseError)

        // Should not retry 4xx — only 1 attempt
        expect(attemptCount).toBe(1)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })
  })

  describe('parseRetryAfter', () => {
    it('should parse integer seconds', () => {
      expect(parseRetryAfter('120')).toBe(120_000)
    })

    it('should parse zero seconds', () => {
      expect(parseRetryAfter('0')).toBe(0)
    })

    it('should return undefined for undefined input', () => {
      expect(parseRetryAfter(undefined)).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(parseRetryAfter('')).toBeUndefined()
    })

    it('should return undefined for empty array', () => {
      expect(parseRetryAfter([])).toBeUndefined()
    })

    it('should take first value from array', () => {
      expect(parseRetryAfter(['60', '120'])).toBe(60_000)
    })

    it('should parse future HTTP-date', () => {
      const future = new Date(Date.now() + 5000).toUTCString()
      const result = parseRetryAfter(future)!

      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThanOrEqual(6000)
    })

    it('should return undefined for past HTTP-date', () => {
      const past = new Date(Date.now() - 60_000).toUTCString()
      expect(parseRetryAfter(past)).toBeUndefined()
    })

    it('should return undefined for negative seconds', () => {
      expect(parseRetryAfter('-5')).toBeUndefined()
    })

    it('should return undefined for non-parseable string', () => {
      expect(parseRetryAfter('not-a-number-or-date')).toBeUndefined()
    })
  })

  describe('sanitizeHeaders', () => {
    it('should redact authorization header', () => {
      const result = sanitizeHeaders({
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      })

      expect(result['authorization']).toBe('[REDACTED]')
      expect(result['content-type']).toBe('application/json')
    })

    it('should redact all sensitive headers', () => {
      const result = sanitizeHeaders({
        authorization: 'Bearer token',
        cookie: 'session=abc',
        'set-cookie': 'session=abc; Path=/',
        'proxy-authorization': 'Basic xyz',
        'proxy-authenticate': 'Basic',
        'www-authenticate': 'Bearer',
      })

      for (const value of Object.values(result)) {
        expect(value).toBe('[REDACTED]')
      }
    })

    it('should be case-insensitive for header names', () => {
      const result = sanitizeHeaders({
        Authorization: 'Bearer secret',
        COOKIE: 'session=abc',
      })

      expect(result['Authorization']).toBe('[REDACTED]')
      expect(result['COOKIE']).toBe('[REDACTED]')
    })

    it('should join array values', () => {
      const result = sanitizeHeaders({
        accept: ['text/html', 'application/json'],
      })

      expect(result['accept']).toBe('text/html, application/json')
    })

    it('should return empty object for undefined input', () => {
      const result = sanitizeHeaders(undefined)
      expect(result).toEqual({})
    })

    it('should skip null and undefined values', () => {
      const result = sanitizeHeaders({
        present: 'value',
        absent: undefined,
        empty: null,
      })

      expect(result['present']).toBe('value')
      expect('absent' in result).toBe(false)
      expect('empty' in result).toBe(false)
    })

    it('should stringify non-string values', () => {
      const result = sanitizeHeaders({
        'content-length': 42 as unknown,
        'x-flag': true as unknown,
      })

      expect(result['content-length']).toBe('42')
      expect(result['x-flag']).toBe('true')
    })

    it('should pass through non-sensitive headers unchanged', () => {
      const result = sanitizeHeaders({
        'content-type': 'application/json',
        'user-agent': 'my-sdk/1.0',
        'x-request-id': 'abc-123',
      })

      expect(result['content-type']).toBe('application/json')
      expect(result['user-agent']).toBe('my-sdk/1.0')
      expect(result['x-request-id']).toBe('abc-123')
    })
  })

  describe('streaming body', () => {
    it('should pipe a Readable stream as request body', async () => {
      const { Readable } = await import('node:stream')
      const body = Readable.from(Buffer.from('streamed data'))

      const response = await httpRequest(`${httpBaseUrl}/echo-body`, {
        method: 'POST',
        body: body as import('node:stream').Readable,
      })

      expect(response.text()).toBe('streamed data')
    })

    it('should auto-merge FormData-like getHeaders()', async () => {
      const { Readable } = await import('node:stream')

      // Create a minimal FormData-like object.
      const boundary = 'test-boundary-123'
      const formBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="field"',
        '',
        'value',
        `--${boundary}--`,
      ].join('\r\n')

      const stream = Readable.from(
        Buffer.from(formBody),
      ) as import('node:stream').Readable & {
        getHeaders: () => Record<string, string>
      }
      stream.getHeaders = () => ({
        'content-type': `multipart/form-data; boundary=${boundary}`,
      })

      const response = await httpRequest(`${httpBaseUrl}/upload-form`, {
        method: 'POST',
        body: stream,
      })

      const data = response.json<{
        contentType: string
        hasMultipart: boolean
      }>()
      expect(data.hasMultipart).toBe(true)
      expect(data.contentType).toContain('multipart/form-data')
    })

    it('should allow user headers to override stream headers', async () => {
      const { Readable } = await import('node:stream')

      const stream = Readable.from(
        Buffer.from('override test'),
      ) as import('node:stream').Readable & {
        getHeaders: () => Record<string, string>
      }
      stream.getHeaders = () => ({
        'content-type': 'multipart/form-data; boundary=auto',
      })

      const response = await httpRequest(`${httpBaseUrl}/upload-form`, {
        method: 'POST',
        body: stream,
        headers: {
          'content-type': 'application/octet-stream',
        },
      })

      const data = response.json<{
        contentType: string
        hasMultipart: boolean
      }>()
      // User header should override getHeaders()
      expect(data.contentType).toBe('application/octet-stream')
      expect(data.hasMultipart).toBe(false)
    })

    it('should throw when streaming body is used with retries > 0', async () => {
      const { Readable } = await import('node:stream')
      const body = Readable.from(Buffer.from('data'))

      await expect(
        httpRequest(`${httpBaseUrl}/echo-body`, {
          method: 'POST',
          body: body as import('node:stream').Readable,
          retries: 1,
        }),
      ).rejects.toThrow(/Streaming body.*cannot be used with retries/)
    })

    it('should disable redirects for streaming bodies', async () => {
      const { Readable } = await import('node:stream')
      const body = Readable.from(Buffer.from('redirect-body'))

      // /redirect returns 302 -> /text, but with a stream body
      // redirects are disabled, so we get the raw 302.
      const response = await httpRequest(`${httpBaseUrl}/redirect`, {
        method: 'POST',
        body: body as import('node:stream').Readable,
      })

      // Should get the 302 directly, not follow to /text
      expect(response.status).toBe(302)
      expect(response.ok).toBe(false)
    })

    it('should handle stream errors without double-firing hooks', async () => {
      const { Readable } = await import('node:stream')
      const responseInfos: Array<
        import('@socketsecurity/lib/http-request').HttpHookResponseInfo
      > = []

      const errorStream = new Readable({
        read() {
          // Emit error after a tick to allow piping to start.
          process.nextTick(() => {
            this.destroy(new Error('stream exploded'))
          })
        },
      })

      await expect(
        httpRequest(`${httpBaseUrl}/echo-body`, {
          method: 'POST',
          body: errorStream as import('node:stream').Readable,
          hooks: {
            onResponse: info => responseInfos.push(info),
          },
        }),
      ).rejects.toThrow(/stream exploded/)

      // The settled guard should prevent duplicate onResponse hook calls.
      expect(responseInfos).toHaveLength(1)
    })
  })

  describe('onRetry - additional edge cases', () => {
    it('should propagate errors thrown by onRetry', async () => {
      const testServer = http.createServer((req, _res) => {
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
            onRetry: () => {
              throw new Error('onRetry kaboom')
            },
          }),
        ).rejects.toThrow('onRetry kaboom')
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should treat onRetry returning 0 as 0ms delay', async () => {
      const startTime = Date.now()
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
          retryDelay: 5000,
          onRetry: () => 0,
        }).catch(() => {})

        const elapsed = Date.now() - startTime
        expect(attemptCount).toBe(3)
        // 0ms override — should be much faster than 5s default
        expect(elapsed).toBeLessThan(2000)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should clamp negative onRetry delay to 0', async () => {
      const startTime = Date.now()
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
          retries: 1,
          retryDelay: 5000,
          onRetry: () => -100,
        }).catch(() => {})

        const elapsed = Date.now() - startTime
        expect(attemptCount).toBe(2)
        // Negative clamped to 0 — should be fast
        expect(elapsed).toBeLessThan(2000)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should fall back to default delay when onRetry returns NaN', async () => {
      const startTime = Date.now()
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
          retries: 1,
          retryDelay: 10, // small default so test is fast
          onRetry: () => NaN,
        }).catch(() => {})

        const elapsed = Date.now() - startTime
        expect(attemptCount).toBe(2)
        // NaN falls back to default retryDelay (10ms) — should be fast
        expect(elapsed).toBeLessThan(2000)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should use onRetry with rate-limited endpoint and Retry-After', async () => {
      let attemptCount = 0
      const testServer = http.createServer((_req, res) => {
        attemptCount++
        if (attemptCount < 2) {
          res.writeHead(429, { 'Retry-After': '0' })
          res.end('Rate limited')
        } else {
          res.writeHead(200)
          res.end('OK')
        }
      })

      await new Promise<void>(resolve => {
        testServer.listen(0, () => resolve())
      })

      const address = testServer.address()
      const testPort = address && typeof address === 'object' ? address.port : 0

      try {
        const response = await httpRequest(`http://localhost:${testPort}/`, {
          throwOnError: true,
          retries: 2,
          retryDelay: 10,
          onRetry: (_attempt, error) => {
            if (error instanceof HttpResponseError) {
              const retryAfter = parseRetryAfter(
                error.response.headers['retry-after'],
              )
              return retryAfter ?? undefined
            }
            return undefined
          },
        })

        expect(response.text()).toBe('OK')
        expect(attemptCount).toBe(2)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })
  })

  describe('throwOnError - additional edge cases', () => {
    it('should throw HttpResponseError for 3xx when followRedirects is false', async () => {
      try {
        await httpRequest(`${httpBaseUrl}/redirect`, {
          throwOnError: true,
          followRedirects: false,
        })
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpResponseError)
        expect((e as HttpResponseError).response.status).toBe(302)
      }
    })

    it('should propagate HttpResponseError through httpJson', async () => {
      try {
        await httpJson(`${httpBaseUrl}/not-found`, {
          throwOnError: true,
        })
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpResponseError)
        expect((e as HttpResponseError).response.status).toBe(404)
      }
    })

    it('should propagate HttpResponseError through httpText', async () => {
      try {
        await httpText(`${httpBaseUrl}/server-error`, {
          throwOnError: true,
        })
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpResponseError)
        expect((e as HttpResponseError).response.status).toBe(500)
      }
    })
  })

  describe('parseRetryAfter - additional edge cases', () => {
    it('should reject partial numeric strings like "10abc"', () => {
      // Strict parsing — "10abc" is not a valid delay-seconds value
      expect(parseRetryAfter('10abc')).toBeUndefined()
    })
  })

  describe('sanitizeHeaders - additional edge cases', () => {
    it('should handle __proto__ and constructor keys safely', () => {
      const result = sanitizeHeaders({
        __proto__: 'poison',
        constructor: 'attack',
        'x-normal': 'fine',
      } as unknown as Record<string, unknown>)

      // __proto__ is not enumerable via Object.keys on a normal object,
      // but constructor is.
      expect(result['x-normal']).toBe('fine')
      expect(result['constructor']).toBe('attack')
      // The output object should have null prototype.
      expect(Object.getPrototypeOf(result)).toBeNull()
    })

    it('should skip inherited prototype properties', () => {
      const proto = { inherited: 'should-not-appear' }
      const obj = Object.create(proto) as Record<string, unknown>
      obj['own'] = 'visible'

      const result = sanitizeHeaders(obj)
      expect(result['own']).toBe('visible')
      expect('inherited' in result).toBe(false)
    })
  })

  describe('maxResponseSize - settle guard', () => {
    it('should fire onResponse exactly once when maxResponseSize exceeded', async () => {
      const responseInfos: Array<
        import('@socketsecurity/lib/http-request').HttpHookResponseInfo
      > = []

      await httpRequest(`${httpBaseUrl}/large-body`, {
        maxResponseSize: 50,
        hooks: {
          onResponse: info => responseInfos.push(info),
        },
      }).catch(() => {})

      // The settled guard prevents duplicate hook fires.
      expect(responseInfos).toHaveLength(1)
      expect(responseInfos[0]!.error).toBeDefined()
      expect(responseInfos[0]!.error!.message).toMatch(
        /exceeds maximum size limit/,
      )
    })
  })

  describe('parseRetryAfter - whitespace', () => {
    it('should handle whitespace-padded integer', () => {
      // parseInt trims leading whitespace
      expect(parseRetryAfter('  60  ')).toBe(60_000)
    })
  })

  describe('Uint8Array body', () => {
    it('should send Uint8Array as request body (not treated as stream)', async () => {
      const data = new Uint8Array([104, 101, 108, 108, 111]) // "hello"
      const response = await httpRequest(`${httpBaseUrl}/echo-body`, {
        method: 'POST',
        body: Buffer.from(data) as Buffer,
      })

      expect(response.text()).toBe('hello')
    })
  })

  describe('onRetry - not called with retries: 0', () => {
    it('should not call onRetry when retries is 0', async () => {
      let onRetryCalled = false

      try {
        await httpRequest(`${httpBaseUrl}/not-found`, {
          throwOnError: true,
          retries: 0,
          onRetry: () => {
            onRetryCalled = true
            return undefined
          },
        })
      } catch {
        // Expected to throw
      }

      expect(onRetryCalled).toBe(false)
    })
  })

  describe('redirect hook and cleanup', () => {
    it('should fire onResponse exactly once per redirect hop on maxRedirects exceeded', async () => {
      const responseInfos: Array<
        import('@socketsecurity/lib/http-request').HttpHookResponseInfo
      > = []

      await httpRequest(`${httpBaseUrl}/redirect-loop-1`, {
        maxRedirects: 2,
        hooks: {
          onResponse: info => responseInfos.push(info),
        },
      }).catch(() => {})

      // 3 redirect hops observed (each emits one 3xx hook before checking limits).
      // The "too many redirects" rejection uses raw reject, not rejectOnce,
      // so no additional error hook fires. Exactly 3 hook calls total.
      expect(responseInfos).toHaveLength(3)
      for (const info of responseInfos) {
        expect(info.status).toBeGreaterThanOrEqual(300)
        expect(info.status).toBeLessThan(400)
        expect(info.error).toBeUndefined()
      }
    })

    it('should work correctly with throwOnError across a 302 → 200 redirect', async () => {
      const response = await httpRequest(`${httpBaseUrl}/redirect`, {
        throwOnError: true,
      })

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })
  })

  describe('stream body cleanup on failure', () => {
    it('should destroy source stream body on request timeout', async () => {
      const { Readable } = await import('node:stream')
      let streamDestroyed = false

      // Create a slow stream that will outlive the request.
      const slowStream = new Readable({
        read() {
          // Never push data — simulate a stalled upload.
        },
        destroy(_err, callback) {
          streamDestroyed = true
          callback(null)
        },
      })

      await expect(
        httpRequest(`${httpBaseUrl}/timeout`, {
          method: 'POST',
          body: slowStream as import('node:stream').Readable,
          timeout: 100,
        }),
      ).rejects.toThrow(/timed out/)

      expect(streamDestroyed).toBe(true)
    })

    it('should destroy source stream body on connection error', async () => {
      const { Readable } = await import('node:stream')
      let streamDestroyed = false

      const stream = new Readable({
        read() {
          // Never push — connection will fail first.
        },
        destroy(_err, callback) {
          streamDestroyed = true
          callback(null)
        },
      })

      await expect(
        httpRequest('http://localhost:1/no-server', {
          method: 'POST',
          body: stream as import('node:stream').Readable,
          timeout: 100,
        }),
      ).rejects.toThrow()

      expect(streamDestroyed).toBe(true)
    })
  })

  describe('hook error resilience', () => {
    it('should still resolve when onResponse hook throws on success', async () => {
      const response = await httpRequest(`${httpBaseUrl}/json`, {
        hooks: {
          onResponse: () => {
            throw new Error('hook exploded')
          },
        },
      })

      // Promise must still settle despite the hook throwing.
      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
    })

    it('should still reject when onResponse hook throws on error', async () => {
      await expect(
        httpRequest(`${httpBaseUrl}/timeout`, {
          timeout: 50,
          hooks: {
            onResponse: () => {
              throw new Error('hook exploded on error')
            },
          },
        }),
      ).rejects.toThrow(/timed out/)
    })

    it('should still reject when onResponse hook throws on redirect failure', async () => {
      await expect(
        httpRequest(`${httpBaseUrl}/redirect-loop-1`, {
          maxRedirects: 0,
          hooks: {
            onResponse: () => {
              throw new Error('hook exploded on redirect')
            },
          },
        }),
      ).rejects.toThrow(/Too many redirects/)
    })
  })
})
