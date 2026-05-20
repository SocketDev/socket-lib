/**
 * @file Unit tests for HTTP/HTTPS request utilities — advanced surface (part 1
 *   of 3). Covers general edge cases, ca option, hooks, maxResponseSize,
 *   rawResponse, stream option, enrichErrorMessage, and type aliases. Split
 *   from the original advanced surface so each test file fits within the
 *   per-worker v8 heap ceiling — cumulative HTTP state retains memory faster
 *   than GC can reclaim it within a single file. Shares the test server with
 *   the sibling http-request-*.test.mts files via http-request-fixtures.mts.
 */

import { createWriteStream, promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { fetchChecksums } from '../../src/http-request/checksums'
import { httpJson, httpText } from '../../src/http-request/convenience'
import { httpDownload } from '../../src/http-request/download'
import { enrichErrorMessage } from '../../src/http-request/errors'
import { getSocketCallerUserAgent } from '../../src/http-request/user-agent'
import { httpRequest } from '../../src/http-request/request'

import { fixture, setupHttpFixture } from './http-request-fixtures'
import { runWithTempDir } from '../unit/util/temp-file-helper'

import type {
  HttpHookRequestInfo,
  HttpHookResponseInfo,
  IncomingRequest,
  IncomingResponse,
} from '../../src/http-request/request-types'

setupHttpFixture()

describe('http-request', () => {
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
      const response = await httpRequest(
        `${fixture.baseUrl}/text?foo=bar&baz=qux`,
      )
      expect(response.status).toBe(200)
    })

    it('should handle URL with hash', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/text#section`)
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
        httpRequest(`${fixture.baseUrl}/redirect`, { maxRedirects: 0 }),
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
      const response = await httpRequest(`${fixture.baseUrl}/text`, {
        ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
      })

      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })

    it('should accept ca option on httpJson without error', async () => {
      const data = await httpJson<{ message: string }>(
        `${fixture.baseUrl}/json`,
        {
          ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
        },
      )

      expect(data.message).toBe('Hello, World!')
    })

    it('should accept ca option on httpText without error', async () => {
      const text = await httpText(`${fixture.baseUrl}/text`, {
        ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
      })

      expect(text).toBe('Plain text response')
    })

    it('should accept ca option on httpDownload without error', async () => {
      await runWithTempDir(async tempDir => {
        const destPath = path.join(tempDir, 'ca-test.txt')
        const result = await httpDownload(
          `${fixture.baseUrl}/download`,
          destPath,
          {
            ca: [
              '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
            ],
          },
        )

        expect(result.path).toBe(destPath)
        expect(result.size).toBeGreaterThan(0)
      })
    })

    it('should accept ca option on fetchChecksums without error', async () => {
      const checksums = await fetchChecksums(
        `${fixture.baseUrl}/checksums.txt`,
        {
          ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
        },
      )

      expect(checksums['checksum-file']).toBeDefined()
    })

    it('should pass ca through redirects on httpRequest', async () => {
      // ca should be preserved through redirect chains.
      const response = await httpRequest(`${fixture.baseUrl}/redirect`, {
        ca: ['-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'],
      })

      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })
  })

  describe('hooks', () => {
    it('should call onRequest with method, url, headers, and timeout', async () => {
      const requestInfos: HttpHookRequestInfo[] = []
      await httpRequest(`${fixture.baseUrl}/json`, {
        headers: { 'X-Custom': 'test-value' },
        hooks: {
          onRequest: info => requestInfos.push(info),
        },
      })
      expect(requestInfos).toHaveLength(1)
      expect(requestInfos[0]!.method).toBe('GET')
      expect(requestInfos[0]!.url).toBe(`${fixture.baseUrl}/json`)
      expect(requestInfos[0]!.timeout).toBe(30_000)
      expect(requestInfos[0]!.headers['User-Agent']).toBe(
        getSocketCallerUserAgent(),
      )
      expect(requestInfos[0]!.headers['X-Custom']).toBe('test-value')
    })

    it('should call onResponse with status, headers, and duration', async () => {
      const responseInfos: HttpHookResponseInfo[] = []
      await httpRequest(`${fixture.baseUrl}/json`, {
        hooks: {
          onResponse: info => responseInfos.push(info),
        },
      })
      expect(responseInfos).toHaveLength(1)
      expect(responseInfos[0]!.method).toBe('GET')
      expect(responseInfos[0]!.url).toBe(`${fixture.baseUrl}/json`)
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
      await httpRequest(`${fixture.baseUrl}/timeout`, {
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

      await httpRequest(`${fixture.baseUrl}/redirect`, {
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
      await httpRequest(`${fixture.baseUrl}/echo-body`, {
        method: 'POST',
        body: 'test',
        hooks: {
          onRequest: info => requestInfos.push(info),
        },
      })
      expect(requestInfos[0]!.method).toBe('POST')
    })

    it('should work with empty hooks object', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/json`, {
        hooks: {},
      })
      expect(response.ok).toBe(true)
    })

    it('should pass hooks through httpJson and httpText', async () => {
      const jsonInfos: HttpHookResponseInfo[] = []
      await httpJson(`${fixture.baseUrl}/json`, {
        hooks: { onResponse: info => jsonInfos.push(info) },
      })
      expect(jsonInfos).toHaveLength(1)
      expect(jsonInfos[0]!.status).toBe(200)

      const textInfos: HttpHookResponseInfo[] = []
      await httpText(`${fixture.baseUrl}/text`, {
        hooks: { onResponse: info => textInfos.push(info) },
      })
      expect(textInfos).toHaveLength(1)
      expect(textInfos[0]!.status).toBe(200)
    })
  })

  describe('maxResponseSize', () => {
    it('should reject responses exceeding limit with size info', async () => {
      try {
        await httpRequest(`${fixture.baseUrl}/large-body`, {
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
      const response = await httpRequest(`${fixture.baseUrl}/json`, {
        maxResponseSize: 1_000_000,
      })
      expect(response.ok).toBe(true)
    })

    it('should allow response exactly at limit', async () => {
      const probe = await httpRequest(`${fixture.baseUrl}/json`)
      const exactSize = probe.body.length

      const response = await httpRequest(`${fixture.baseUrl}/json`, {
        maxResponseSize: exactSize,
      })
      expect(response.ok).toBe(true)
      expect(response.body.length).toBe(exactSize)
    })

    it('should treat 0 as no limit', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/json`, {
        maxResponseSize: 0,
      })
      expect(response.ok).toBe(true)
    })

    it('should enforce after redirect', async () => {
      await expect(
        httpRequest(`${fixture.baseUrl}/redirect`, {
          maxResponseSize: 5,
        }),
      ).rejects.toThrow(/exceeds maximum size limit/)
    })

    it('should work with httpJson and httpText', async () => {
      await expect(
        httpJson(`${fixture.baseUrl}/json`, { maxResponseSize: 5 }),
      ).rejects.toThrow(/exceeds maximum size limit/)

      await expect(
        httpText(`${fixture.baseUrl}/text`, { maxResponseSize: 5 }),
      ).rejects.toThrow(/exceeds maximum size limit/)
    })

    it('should fire onResponse hook with error on size limit', async () => {
      const responseInfos: HttpHookResponseInfo[] = []
      await httpRequest(`${fixture.baseUrl}/large-body`, {
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
      const response = await httpRequest(`${fixture.baseUrl}/json`)
      expect(response.rawResponse).toBeDefined()
      expect(response.rawResponse!.statusCode).toBe(200)
      expect(response.rawResponse!.headers['content-type']).toContain(
        'application/json',
      )
    })

    it('should be from final response after redirect', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/redirect`)
      expect(response.rawResponse).toBeDefined()
      expect(response.rawResponse!.statusCode).toBe(200)
    })

    it('should be available on non-2xx responses', async () => {
      const r404 = await httpRequest(`${fixture.baseUrl}/not-found`)
      expect(r404.rawResponse!.statusCode).toBe(404)

      const r500 = await httpRequest(`${fixture.baseUrl}/server-error`)
      expect(r500.rawResponse!.statusCode).toBe(500)
    })
  })

  describe('stream option', () => {
    it('should resolve immediately with unconsumed rawResponse', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/text`, {
        stream: true,
      })

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
      expect(response.statusText).toBe('OK')
      expect(response.headers['content-type']).toBe('text/plain')
      expect(response.rawResponse).toBeDefined()
      // Body not buffered in stream mode.
      expect(response.body.length).toBe(0)
      expect(response.text()).toBe('')

      // Read the stream manually.
      const chunks: Buffer[] = []
      for await (const chunk of response.rawResponse!) {
        chunks.push(chunk as Buffer)
      }
      expect(Buffer.concat(chunks).toString('utf8')).toBe('Plain text response')
    })

    it('should follow redirects in stream mode', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/redirect`, {
        stream: true,
      })

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
      expect(response.rawResponse).toBeDefined()

      const chunks: Buffer[] = []
      for await (const chunk of response.rawResponse!) {
        chunks.push(chunk as Buffer)
      }
      expect(Buffer.concat(chunks).toString('utf8')).toBe('Plain text response')
    })

    it('should handle non-2xx in stream mode', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/not-found`, {
        stream: true,
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(404)
      expect(response.rawResponse).toBeDefined()
    })

    it('should throw on json() in stream mode', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/json`, {
        stream: true,
      })
      expect(() => response.json()).toThrow(
        'Cannot parse JSON from a streaming response',
      )
    })

    it('should pipe to a file via stream mode', async () => {
      await runWithTempDir(async tmpDir => {
        const response = await httpRequest(`${fixture.baseUrl}/download`, {
          stream: true,
        })
        expect(response.ok).toBe(true)

        const destPath = path.join(tmpDir, 'streamed.txt')
        await new Promise<void>((resolve, reject) => {
          const ws = createWriteStream(destPath)
          ws.on('error', reject)
          ws.on('close', resolve)
          response.rawResponse!.pipe(ws)
        })

        const content = await fs.readFile(destPath, 'utf8')
        expect(content).toBe('Download test content')
      }, 'stream-pipe-')
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
        await httpRequest(`${fixture.baseUrl}/timeout`, { timeout: 50 })
        expect.unreachable('should have thrown')
      } catch (e) {
        const msg = (e as Error).message
        expect(msg).toContain('GET')
        expect(msg).toContain('timed out')
        expect(msg).toContain(`${fixture.baseUrl}/timeout`)
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
})
