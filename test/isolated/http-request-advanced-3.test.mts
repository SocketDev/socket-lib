/**
 * @file Unit tests for HTTP/HTTPS request utilities — advanced surface (part 3
 *   of 3). Covers streaming body bodies, additional onRetry / throwOnError /
 *   parseRetryAfterHeader / sanitizeHeaders edge cases, maxResponseSize settle
 *   guards, Uint8Array bodies, redirect hook / cleanup paths, stream-body
 *   cleanup on failure, and hook error resilience. Split from the original
 *   advanced surface to keep each worker within the v8 heap ceiling —
 *   cumulative HTTP state retains memory faster than GC can reclaim it within a
 *   single test file. Shares the test server with the sibling
 *   http-request-*.test.mts files via http-request-fixtures.mts.
 */

import http from 'node:http'
import { Readable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { httpJson, httpText } from '../../src/http-request/node'
import {
  parseRetryAfterHeader,
  sanitizeHeaders,
} from '../../src/http-request/headers'
import { httpRequest } from '../../src/http-request/request'
import { HttpResponseError } from '../../src/http-request/response-types'

import { fixture, setupHttpFixture } from './http-request-fixtures'

setupHttpFixture()

describe('http-request', () => {
  describe('streaming body', () => {
    it('should pipe a Readable stream as request body', async () => {
      const body = Readable.from(Buffer.from('streamed data'))

      const response = await httpRequest(`${fixture.baseUrl}/echo-body`, {
        method: 'POST',
        body: body as import('node:stream').Readable,
      })

      expect(response.text()).toBe('streamed data')
    })

    it('should auto-merge FormData-like getHeaders()', async () => {
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

      const response = await httpRequest(`${fixture.baseUrl}/upload-form`, {
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
      const stream = Readable.from(
        Buffer.from('override test'),
      ) as import('node:stream').Readable & {
        getHeaders: () => Record<string, string>
      }
      stream.getHeaders = () => ({
        'content-type': 'multipart/form-data; boundary=auto',
      })

      const response = await httpRequest(`${fixture.baseUrl}/upload-form`, {
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
      const body = Readable.from(Buffer.from('data'))

      await expect(
        httpRequest(`${fixture.baseUrl}/echo-body`, {
          method: 'POST',
          body: body as import('node:stream').Readable,
          retries: 1,
        }),
      ).rejects.toThrow(/Streaming body.*cannot be used with retries/)
    })

    it('should disable redirects for streaming bodies', async () => {
      const body = Readable.from(Buffer.from('redirect-body'))

      // /redirect returns 302 -> /text, but with a stream body
      // redirects are disabled, so we get the raw 302.
      const response = await httpRequest(`${fixture.baseUrl}/redirect`, {
        method: 'POST',
        body: body as import('node:stream').Readable,
      })

      // Should get the 302 directly, not follow to /text
      expect(response.status).toBe(302)
      expect(response.ok).toBe(false)
    })

    it('should handle stream errors without double-firing hooks', async () => {
      const responseInfos: Array<
        import('@socketsecurity/lib/http-request/request-types').HttpHookResponseInfo
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
        httpRequest(`${fixture.baseUrl}/echo-body`, {
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
      // Observable: onRetry invoked N times with per-attempt metadata;
      // attempt count matches retries+1. Wall-clock elapsed is CI-flaky.
      let attemptCount = 0
      let onRetryCalls = 0
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
          onRetry: () => {
            onRetryCalls++
            return 0
          },
        }).catch(() => {})

        expect(attemptCount).toBe(3)
        expect(onRetryCalls).toBe(2)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should clamp negative onRetry delay to 0', async () => {
      let attemptCount = 0
      let onRetryCalls = 0
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
          onRetry: () => {
            onRetryCalls++
            return -100
          },
        }).catch(() => {})

        expect(attemptCount).toBe(2)
        expect(onRetryCalls).toBe(1)
      } finally {
        await new Promise<void>(resolve => {
          testServer.close(() => resolve())
        })
      }
    })

    it('should fall back to default delay when onRetry returns NaN', async () => {
      let attemptCount = 0
      let onRetryCalls = 0
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
          retryDelay: 10,
          onRetry: () => {
            onRetryCalls++
            return NaN
          },
        }).catch(() => {})

        expect(attemptCount).toBe(2)
        expect(onRetryCalls).toBe(1)
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
              const retryAfter = parseRetryAfterHeader(
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
        await httpRequest(`${fixture.baseUrl}/redirect`, {
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
        await httpJson(`${fixture.baseUrl}/not-found`, {
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
        await httpText(`${fixture.baseUrl}/server-error`, {
          throwOnError: true,
        })
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpResponseError)
        expect((e as HttpResponseError).response.status).toBe(500)
      }
    })
  })

  describe('parseRetryAfterHeader - additional edge cases', () => {
    it('should reject partial numeric strings like "10abc"', () => {
      // Strict parsing — "10abc" is not a valid delay-seconds value
      expect(parseRetryAfterHeader('10abc')).toBeUndefined()
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
        import('@socketsecurity/lib/http-request/request-types').HttpHookResponseInfo
      > = []

      await httpRequest(`${fixture.baseUrl}/large-body`, {
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

  describe('parseRetryAfterHeader - whitespace', () => {
    it('should handle whitespace-padded integer', () => {
      // parseInt trims leading whitespace
      expect(parseRetryAfterHeader('  60  ')).toBe(60_000)
    })
  })

  describe('Uint8Array body', () => {
    it('should send Uint8Array as request body (not treated as stream)', async () => {
      const data = new Uint8Array([104, 101, 108, 108, 111]) // "hello"
      const response = await httpRequest(`${fixture.baseUrl}/echo-body`, {
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
        await httpRequest(`${fixture.baseUrl}/not-found`, {
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
        import('@socketsecurity/lib/http-request/request-types').HttpHookResponseInfo
      > = []

      await httpRequest(`${fixture.baseUrl}/redirect-loop-1`, {
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
      const response = await httpRequest(`${fixture.baseUrl}/redirect`, {
        throwOnError: true,
      })

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })
  })

  describe('stream body cleanup on failure', () => {
    it('should destroy source stream body on request timeout', async () => {
      let streamDestroyed = false

      // Create a slow stream that will outlive the request.
      const slowStream = new Readable({
        read() {
          // Never push data — simulate a stalled upload.
        },
        destroy(_err, callback) {
          streamDestroyed = true
          callback(undefined)
        },
      })

      await expect(
        httpRequest(`${fixture.baseUrl}/timeout`, {
          method: 'POST',
          body: slowStream as import('node:stream').Readable,
          timeout: 100,
        }),
      ).rejects.toThrow(/timed out/)

      expect(streamDestroyed).toBe(true)
    })

    it('should destroy source stream body on connection error', async () => {
      let streamDestroyed = false

      const stream = new Readable({
        read() {
          // Never push — connection will fail first.
        },
        destroy(_err, callback) {
          streamDestroyed = true
          callback(undefined)
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
      const response = await httpRequest(`${fixture.baseUrl}/json`, {
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
        httpRequest(`${fixture.baseUrl}/timeout`, {
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
        httpRequest(`${fixture.baseUrl}/redirect-loop-1`, {
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
