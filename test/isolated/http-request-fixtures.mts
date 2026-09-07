/**
 * @file Shared test fixture for the http-request test files. The full
 *   http-request test suite was originally a single 3390-line file with 202
 *   tests. Even alone in a fresh worker with a 4 GB heap ceiling, that file
 *   OOMs deep into its run — cumulative state (keep-alive sockets, response
 *   buffers, closure-captured constants) pushes the worker past the limit.
 *   Splitting the tests across two files (core + advanced) lets each file run
 *   in its own worker with heap budget intact. This module exports the shared
 *   HTTP test server setup so each split file can stand up + tear down its own
 *   instance without duplicating the 186-line request handler. The pattern is:
 *   import { setupHttpFixture, fixture } from './http-request-fixtures.mjs'
 *   setupHttpFixture() describe('…', () => { it('…', async () => { const
 *   response = await httpRequest(`${fixture.baseUrl}/text`) … }) })
 *   `setupHttpFixture()` installs vitest `beforeAll` / `afterAll` hooks in the
 *   caller's file scope. `fixture` is a live reference whose `baseUrl` field is
 *   populated when the server starts listening. Cleanup discipline: every test
 *   in the split files uses `fixture.baseUrl` rather than capturing it into a
 *   local — that way the binding refreshes between describes when the server is
 *   recycled, and there's no stale-port surprise.
 */

import crypto from 'node:crypto'
import http from 'node:http'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { afterAll, beforeAll } from 'vitest'

/**
 * Live fixture state. Mutated by `setupHttpFixture()`'s beforeAll hook; read by
 * tests. The shape stays stable across `beforeAll` re-invocations so callers
 * can capture the object reference once.
 */
export const fixture = {
  baseUrl: '',
  port: 0,
}

/**
 * Helper for tests that need to bypass the normal httpRequest path and issue a
 * raw http.get against the fixture server (e.g. testing readIncomingResponse).
 */
export function makeRawRequest(url: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    http.get(url, resolve).on('error', reject)
  })
}

/**
 * The port an ad-hoc test server ended up listening on. `address()` answers a
 * string for a unix socket and null before the server is listening, neither of
 * which a test that just called `listen(0)` can hit, so the fallback is only
 * there to keep the return a number.
 */
export function listeningPort(server: http.Server): number {
  const address = server.address()
  return address !== null && typeof address === 'object' ? address.port : 0
}

/**
 * Install vitest beforeAll / afterAll hooks for the HTTP test server. Call this
 * once at the top of a test file (outside any `describe`). The server listens
 * on a random port (`listen(0)`) and `fixture.baseUrl` is populated before any
 * test runs.
 */
export function setupHttpFixture(): void {
  let httpServer: http.Server

  const routes: Record<
    string,
    (res: http.ServerResponse, req: http.IncomingMessage) => void
  > = {
    '/json': res => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'Hello, World!', status: 'success' }))
    },
    '/text': res => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Plain text response')
    },
    '/gzip': res => {
      // gzip-encoded JSON body — httpRequest advertises
      // Accept-Encoding: gzip and must transparently decode so
      // .json()/.text() see the inflated payload, not raw deflated bytes.
      res.writeHead(200, {
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/json',
      })
      res.end(gzipSync(JSON.stringify({ encoded: 'gzip', ok: true })))
    },
    '/brotli': res => {
      res.writeHead(200, {
        'Content-Encoding': 'br',
        'Content-Type': 'application/json',
      })
      res.end(brotliCompressSync(JSON.stringify({ encoded: 'br', ok: true })))
    },
    '/redirect': res => {
      res.writeHead(302, { Location: '/text' })
      res.end()
    },
    '/redirect-absolute': res => {
      res.writeHead(302, { Location: `${fixture.baseUrl}/text` })
      res.end()
    },
    '/redirect-loop-1': res => {
      res.writeHead(302, { Location: '/redirect-loop-2' })
      res.end()
    },
    '/redirect-loop-2': res => {
      res.writeHead(302, { Location: '/redirect-loop-3' })
      res.end()
    },
    '/redirect-loop-3': res => {
      res.writeHead(302, { Location: '/redirect-loop-4' })
      res.end()
    },
    '/redirect-loop-4': res => {
      res.writeHead(302, { Location: '/redirect-loop-5' })
      res.end()
    },
    '/redirect-loop-5': res => {
      res.writeHead(302, { Location: '/redirect-loop-6' })
      res.end()
    },
    '/redirect-loop-6': res => {
      res.writeHead(302, { Location: '/text' })
      res.end()
    },
    '/not-found': res => {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
    },
    '/server-error': res => {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    },
    '/timeout': () => {
      // Don't respond - simulate timeout
      return
    },
    '/slow': res => {
      // Respond after delay
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Slow response')
      }, 100)
    },
    '/echo-method': (res, req) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(req.method)
    },
    '/echo-body': (res, req) => {
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(body)
      })
    },
    '/echo-headers': (res, req) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(req.headers))
    },
    '/binary': res => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd])
      res.end(buffer)
    },
    '/download': res => {
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
    },
    '/large-download': res => {
      const content = 'X'.repeat(1000)
      res.writeHead(200, {
        'Content-Length': String(content.length),
        'Content-Type': 'text/plain',
      })
      res.end(content)
    },
    '/download-no-length': res => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('No content length')
    },
    '/invalid-json': res => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('not valid json{')
    },
    '/checksum-file': res => {
      const content = 'Test content for checksum verification'
      res.writeHead(200, {
        'Content-Length': String(content.length),
        'Content-Type': 'text/plain',
      })
      res.end(content)
    },
    '/checksums.txt': res => {
      const content = 'Test content for checksum verification'
      const hash = crypto.createHash('sha256').update(content).digest('hex')
      const checksums = `${hash}  checksum-file\nabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890  other-file\n`
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(checksums)
    },
    '/checksums-single-space.txt': res => {
      const content = 'Test content for checksum verification'
      const hash = crypto.createHash('sha256').update(content).digest('hex')
      const checksums = `${hash} checksum-file\n`
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(checksums)
    },
    '/checksums-missing.txt': res => {
      const checksums =
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890  other-file\n'
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(checksums)
    },
    '/checksums-empty.txt': res => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('# This file has no checksums\n\n')
    },
    '/large-body': res => {
      const content = 'X'.repeat(10_000)
      res.writeHead(200, {
        'Content-Length': String(content.length),
        'Content-Type': 'text/plain',
      })
      res.end(content)
    },
    '/post-success': (res, req) => {
      if (req.method === 'POST') {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ created: true }))
      } else {
        res.writeHead(405)
        res.end()
      }
    },
    '/no-redirect': res => {
      res.writeHead(301, { Location: '/text' })
      res.end()
    },
    '/upload-form': (res, req) => {
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
    },
  }

  beforeAll(async () => {
    await new Promise<void>(resolve => {
      httpServer = http.createServer((req, res) => {
        const url = req.url || ''

        const handler = Object.hasOwn(routes, url) ? routes[url] : undefined
        if (handler) {
          handler(res, req)
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('OK')
        }
      })

      httpServer.listen(0, () => {
        const address = httpServer.address()
        if (address !== null && typeof address === 'object') {
          fixture.port = address.port
          fixture.baseUrl = `http://localhost:${address.port}`
        }
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>(resolve => {
      httpServer.close(() => resolve())
    })
  })
}
