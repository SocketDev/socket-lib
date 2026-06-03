/**
 * @file Unit tests for HTTP/HTTPS request utilities — advanced surface (part 1
 *   of 3). Covers general edge cases, ca option, hooks, and maxResponseSize.
 *   The rawResponse, stream, enrichErrorMessage, and type-alias coverage lives
 *   in the sibling http-request-advanced-errors.test.mts. Split from the
 *   original advanced surface so each test file fits within the per-worker v8
 *   heap ceiling — cumulative HTTP state retains memory faster than GC can
 *   reclaim it within a single file. Shares the test server with the sibling
 *   http-request-*.test.mts files via http-request-fixtures.mts.
 */

import http from 'node:http'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { fetchChecksumFile } from '../../src/http-request/checksum-file'
// oxlint-disable-next-line socket/no-platform-specific-import -- the isolated vitest config resolves only the explicit /node file; the barrel has no index.ts and exports-map resolution isn't wired for relative/aliased imports here.
import { httpJson, httpText } from '../../src/http-request/node'
import { httpDownload } from '../../src/http-request/download'
import { httpRequest } from '../../src/http-request/request'

// Import from the local src under test, NOT @socketsecurity/lib-stable —
// see test/isolated/http-request-core.test.mts for the version-mismatch
// rationale.
// oxlint-disable-next-line socket/no-src-import-in-test-expect -- self-consistency check against the local httpRequest's own UA; -stable would mismatch the local SOCKET_LIB_VERSION.
import { getSocketCallerUserAgent } from '../../src/http-request/user-agent'

import { fixture, setupHttpFixture } from './http-request-fixtures'
import { runWithTempDir } from '../unit/util/temp-file-helper'

import type {
  HttpHookRequestInfo,
  HttpHookResponseInfo,
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

    it('should accept ca option on fetchChecksumFile without error', async () => {
      const checksums = await fetchChecksumFile(
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
      // Buffered requests advertise the encodings response-reader can decode.
      expect(requestInfos[0]!.headers['Accept-Encoding']).toBe('gzip, br')
    })

    it('omits Accept-Encoding on streamed requests (piped raw to disk)', async () => {
      const requestInfos: HttpHookRequestInfo[] = []
      const response = await httpRequest(`${fixture.baseUrl}/json`, {
        stream: true,
        hooks: {
          onRequest: info => requestInfos.push(info),
        },
      })
      // Drain the stream so the socket closes cleanly.
      response.rawResponse?.resume()
      expect(requestInfos).toHaveLength(1)
      expect(requestInfos[0]!.headers['Accept-Encoding']).toBeUndefined()
    })

    it('lets a caller override Accept-Encoding', async () => {
      const requestInfos: HttpHookRequestInfo[] = []
      await httpRequest(`${fixture.baseUrl}/json`, {
        headers: { 'Accept-Encoding': 'identity' },
        hooks: {
          onRequest: info => requestInfos.push(info),
        },
      })
      expect(requestInfos[0]!.headers['Accept-Encoding']).toBe('identity')
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
        for (let i = 0, { length } = responseInfos; i < length; i += 1) {
          const info = responseInfos[i]!
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
})
