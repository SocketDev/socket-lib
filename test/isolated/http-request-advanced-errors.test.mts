/**
 * @file Unit tests for HTTP/HTTPS request utilities — advanced surface (error
 *   and streaming slice). Covers rawResponse exposure, the stream option,
 *   enrichErrorMessage, enriched-message integration, and the request/response
 *   type aliases. Split from http-request-advanced-1.test.mts so each test file
 *   fits within the per-worker v8 heap ceiling — cumulative HTTP state retains
 *   memory faster than GC can reclaim it within a single file. Shares the test
 *   server with the sibling http-request-*.test.mts files via
 *   http-request-fixtures.mts.
 */

import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'

import type http from 'node:http'

import { describe, expect, it } from 'vitest'

import { enrichErrorMessage } from '../../src/http-request/errors'
import { httpRequest } from '../../src/http-request/request'

import { fixture, setupHttpFixture } from './http-request-fixtures'
import { runWithTempDir } from '../unit/util/temp-file-helper'

import type {
  IncomingRequest,
  IncomingResponse,
} from '../../src/http-request/request-types'

setupHttpFixture()

describe('http-request', () => {
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
