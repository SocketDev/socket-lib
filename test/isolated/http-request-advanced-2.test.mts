/**
 * @file Unit tests for HTTP/HTTPS request utilities — advanced surface (part 2
 *   of 3). Covers readIncomingResponse, HttpResponseError, throwOnError, and
 *   onRetry. The parseRetryAfterHeader and sanitizeHeaders header-utility
 *   suites moved to http-request-advanced-headers.test.mts to keep this file
 *   under the file-size cap.
 *   ┌────────────────────────────────────────────────────────────────┐ │ OOM
 *   HISTORY — READ BEFORE TOUCHING THIS FILE │
 *   ├────────────────────────────────────────────────────────────────┤ │ The
 *   original http-request.test.mts (3390 lines, 202 tests) │ │ appeared to OOM
 *   the test worker due to "cumulative state │ │ across many tests". The real
 *   culprit was ONE test in the │ │ `readIncomingResponse` describe that built
 *   a Readable with │ │ `this.push(undefined)` instead of `this.push(null)`.
 *   Stream │ │ machinery only terminates on the null sentinel; `undefined` │ │
 *   is silently treated as "no chunk this tick" and read() is │ │ called again,
 *   pushing yet another 'body' chunk. The runaway │ │ spins until v8 OOMs. │ │
 *   │ │ Because vitest only reports per-test results when the suite │ │
 *   finishes cleanly, the OOM looked like it happened "after N │ │ tests
 *   passed" — but actually all earlier tests ran fine and │ │ the runaway
 *   started on the broken test, blowing the heap │ │ before vitest could flush
 *   results. This caused a multi-day │ │ misdiagnosis (split files, raised heap
 *   caps, switched pool │ │ type) before the actual one-character bug was
 *   found. │ │ │ │ Lesson: when a vitest suite OOMs with no per-test failures,
 *   │ │ suspect an infinite stream / unbounded async loop BEFORE │ │ reaching
 *   for heap caps or splits. Bisect with `-t` (test │ │ name filter) or `pnpm
 *   exec vitest -t '<describe>'` to find │ │ the offender quickly. │
 *   └────────────────────────────────────────────────────────────────┘ Split
 *   from the original advanced surface so each test file is scoped to a
 *   reasonable surface — splits also let bisection of future runaway tests land
 *   faster. Shares the test server with the sibling http-request-*.test.mts
 *   files via http-request-fixtures.mts.
 */

import http from 'node:http'
import { Readable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import {
  httpRequest,
  readIncomingResponse,
} from '../../src/http-request/request'
import { HttpResponseError } from '../../src/http-request/response-types'

import {
  fixture,
  makeRawRequest,
  setupHttpFixture,
} from './http-request-fixtures'

import type { IncomingResponse } from '../../src/http-request/request-types'

setupHttpFixture()

describe('http-request', () => {
  describe('readIncomingResponse', () => {
    it('should read a 200 JSON response', async () => {
      const msg = await makeRawRequest(`${fixture.baseUrl}/json`)
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
      const msg = await makeRawRequest(`${fixture.baseUrl}/text`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
      expect(response.text()).toBe('Plain text response')
    })

    it('should handle 404 responses', async () => {
      const msg = await makeRawRequest(`${fixture.baseUrl}/not-found`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(false)
      expect(response.status).toBe(404)
      expect(response.statusText).toBe('Not Found')
      expect(response.text()).toBe('Not Found')
    })

    it('should handle 500 server errors', async () => {
      const msg = await makeRawRequest(`${fixture.baseUrl}/server-error`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(false)
      expect(response.status).toBe(500)
      expect(response.text()).toBe('Internal Server Error')
    })

    it('should provide arrayBuffer from body', async () => {
      const msg = await makeRawRequest(`${fixture.baseUrl}/text`)
      const response = await readIncomingResponse(msg)
      const ab = response.arrayBuffer()

      expect(ab).toBeInstanceOf(ArrayBuffer)
      expect(ab.byteLength).toBeGreaterThan(0)
      expect(Buffer.from(ab).toString('utf8')).toBe('Plain text response')
    })

    it('should handle binary response data', async () => {
      const msg = await makeRawRequest(`${fixture.baseUrl}/binary`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(true)
      expect(response.body.length).toBe(7)
      expect(response.body[0]).toBe(0x00)
      expect(response.body[1]).toBe(0x01)
      expect(response.body[6]).toBe(0xfd)
    })

    it('should produce same result as httpRequest for same endpoint', async () => {
      const msg = await makeRawRequest(`${fixture.baseUrl}/json`)
      const fromRaw = await readIncomingResponse(msg)
      const fromLib = await httpRequest(`${fixture.baseUrl}/json`)

      expect(fromRaw.ok).toBe(fromLib.ok)
      expect(fromRaw.status).toBe(fromLib.status)
      expect(fromRaw.json()).toEqual(fromLib.json())
      expect(fromRaw.text()).toBe(fromLib.text())
    })

    it('should handle large response bodies', async () => {
      const msg = await makeRawRequest(`${fixture.baseUrl}/large-body`)
      const response = await readIncomingResponse(msg)

      expect(response.ok).toBe(true)
      expect(response.text()).toBe('X'.repeat(10_000))
      expect(response.body.length).toBe(10_000)
    })

    it('should default status to 0 when statusCode is undefined', async () => {
      // CRITICAL: this.push(null) ends the stream — DO NOT change to
      // push(undefined). Earlier revisions of this test used
      // `this.push(undefined)`, which does NOT terminate a Readable.
      // Without a null sentinel, Node's stream machinery keeps invoking
      // read() to refill the internal buffer; each call pushes another
      // 'body' chunk, the consumer keeps allocating, and the worker
      // OOMs in seconds. The OOM masquerades as "cumulative leak across
      // many tests" because the runaway happens on the LAST it() block,
      // so all prior tests appear to have passed cleanly. See the
      // 4-day misdiagnosis in commit history before relaxing this.
      const fakeMsg = new Readable({
        read() {
          this.push('body')
          // oxlint-disable-next-line socket/prefer-undefined-over-null -- null sentinel required to properly terminate the stream
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
      const msg = await makeRawRequest(`${fixture.baseUrl}/json`)
      const response = await readIncomingResponse(msg)

      expect(response.headers['content-type']).toBe('application/json')
      expect(response.headers).toBeDefined()
    })

    it('should throw on invalid JSON from json()', async () => {
      const msg = await makeRawRequest(`${fixture.baseUrl}/text`)
      const response = await readIncomingResponse(msg)

      expect(() => response.json()).toThrow()
    })
  })

  describe('HttpResponseError', () => {
    it('should include status and statusText in message', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/not-found`)
      const error = new HttpResponseError(response)

      expect(error.name).toBe('HttpResponseError')
      expect(error.message).toContain('404')
      expect(error.message).toContain('Not Found')
      expect(error.response).toBe(response)
    })

    it('should accept a custom message', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/server-error`)
      const error = new HttpResponseError(response, 'Custom error message')

      expect(error.message).toBe('Custom error message')
      expect(error.response.status).toBe(500)
    })

    it('should be an instance of Error', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/not-found`)
      const error = new HttpResponseError(response)

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(HttpResponseError)
    })

    it('should have a stack trace', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/not-found`)
      const error = new HttpResponseError(response)

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('HttpResponseError')
    })
  })

  describe('throwOnError', () => {
    it('should throw HttpResponseError on 404 when enabled', async () => {
      try {
        await httpRequest(`${fixture.baseUrl}/not-found`, {
          throwOnError: true,
        })
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
        await httpRequest(`${fixture.baseUrl}/server-error`, {
          throwOnError: true,
        })
        expect.unreachable('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpResponseError)
        const err = e as HttpResponseError
        expect(err.response.status).toBe(500)
      }
    })

    it('should not throw on 2xx when enabled', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/json`, {
        throwOnError: true,
      })
      expect(response.ok).toBe(true)
      expect(response.status).toBe(200)
    })

    it('should resolve non-2xx without throwOnError (default)', async () => {
      const response = await httpRequest(`${fixture.baseUrl}/not-found`)
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
      // The observable behaviour is: (1) the retry happens, (2) onRetry is
      // invoked with the computed delay and its return value overrides it.
      // Wall-clock elapsed assertions are flaky under CI scheduling.
      let attemptCount = 0
      let onRetryCalls = 0
      let overriddenDelay: number | undefined
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
            overriddenDelay = 10
            return overriddenDelay
          },
        }).catch(() => {})

        expect(attemptCount).toBe(2)
        expect(onRetryCalls).toBe(1)
        expect(overriddenDelay).toBe(10)
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
})
