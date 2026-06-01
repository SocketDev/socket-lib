/**
 * @file Unit tests for HTTP/HTTPS request utilities — advanced surface (part 4
 *   of 4). Covers redirect hook / cleanup paths, stream-body cleanup on
 *   failure, and hook error resilience. Split from http-request-advanced-3 to
 *   keep each worker within the v8 heap ceiling — cumulative HTTP state retains
 *   memory faster than GC can reclaim it within a single test file. Shares the
 *   test server with the sibling http-request-*.test.mts files via
 *   http-request-fixtures.mts.
 */

import { Readable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import type { HttpHookResponseInfo } from '@socketsecurity/lib/http-request/request-types'

import { httpRequest } from '../../src/http-request/request'

import { fixture, setupHttpFixture } from './http-request-fixtures'

setupHttpFixture()

describe('http-request', () => {
  describe('redirect hook and cleanup', () => {
    it('should fire onResponse exactly once per redirect hop on maxRedirects exceeded', async () => {
      const responseInfos: HttpHookResponseInfo[] = []

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
      for (let i = 0, { length } = responseInfos; i < length; i += 1) {
        const info = responseInfos[i]!
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
          body: slowStream as Readable,
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
          body: stream as Readable,
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
