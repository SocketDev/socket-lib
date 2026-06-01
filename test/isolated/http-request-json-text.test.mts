/**
 * @file Unit tests for HTTP/HTTPS request utilities — JSON/text convenience
 *   wrappers. Split out of test/isolated/http-request-core.test.mts to keep
 *   each test file under the per-worker heap ceiling and the source-line cap.
 *   This file covers httpJson and httpText; the core surface (httpRequest,
 *   httpDownload, parseChecksums, fetchChecksums) lives in
 *   http-request-core.test.mts. Both files share the same test server via
 *   http-request-fixtures.mts.
 */

import http from 'node:http'

import { describe, expect, it } from 'vitest'

import { httpJson, httpText } from '../../src/http-request/node'

import { fixture, setupHttpFixture } from './http-request-fixtures'

setupHttpFixture()

describe('http-request', () => {
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
