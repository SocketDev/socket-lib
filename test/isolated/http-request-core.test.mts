/**
 * @file Unit tests for HTTP/HTTPS request utilities — core httpRequest surface.
 *   Split of the original test/isolated/http-request.test.mts to keep each test
 *   file under the per-worker heap ceiling and the source-line cap. This file
 *   covers httpRequest; httpDownload lives in http-request-download.test.mts,
 *   parseChecksums/fetchChecksums in http-request-checksums.test.mts, and the
 *   httpJson/httpText wrappers in http-request-json-text.test.mts. Advanced
 *   topics (edge cases, options, retries, error handling) live in
 *   http-request-advanced.test.mts. All files share the same test server via
 *   http-request-fixtures.mts.
 */

import http from 'node:http'

import { describe, expect, it } from 'vitest'

// Import from the local src under test, NOT @socketsecurity/lib-stable.
// lib-stable bakes INLINED_LIB_VERSION into SOCKET_LIB_VERSION at publish
// time; the local src/ falls back to '0.0.0' at test time because nothing
// inlines it. Mixing the two yields a mismatched user-agent assertion
// (lib-stable reports 6.0.6, local httpRequest sends 0.0.0). The assertion is a
// self-consistency check — the header is built by the local httpRequest, so the
// expected value must come from the SAME local module, not the -stable snapshot.
// oxlint-disable-next-line socket/no-src-import-in-test-expect -- self-consistency check against the local httpRequest's own UA; -stable would mismatch the local SOCKET_LIB_VERSION.
import { getSocketCallerUserAgent } from '../../src/http-request/user-agent'

import { httpRequest } from '../../src/http-request/request'

import { fixture, setupHttpFixture } from './http-request-fixtures'

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

    // The following tests hit the in-process fixture server at
    // http://localhost (fixture.baseUrl, bound via listen(0)) — no
    // third-party network. They exercise Content-Encoding decode.
    it('should decompress a gzip Content-Encoding response', async () => {
      // Regression: httpRequest advertises Accept-Encoding: gzip but its
      // on('end') handler previously built the response from raw chunks
      // without decoding, so .json()/.text() saw gzip bytes and failed to
      // parse (broke GitHub-releases / nodejs.org fetches downstream).
      const response = await httpRequest(`${fixture.baseUrl}/gzip`)

      expect(response.status).toBe(200)
      expect(response.headers['content-encoding']).toBe('gzip')
      const data = response.json<{ encoded: string; ok: boolean }>()
      expect(data.encoded).toBe('gzip')
      expect(data.ok).toBe(true)
      // text() must also see the inflated body.
      expect(response.text()).toContain('"encoded":"gzip"')
    })

    it('should decompress a brotli Content-Encoding response', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/brotli`)

      expect(response.status).toBe(200)
      expect(response.headers['content-encoding']).toBe('br')
      const data = response.json<{ encoded: string; ok: boolean }>()
      expect(data.encoded).toBe('br')
      expect(data.ok).toBe(true)
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
})
