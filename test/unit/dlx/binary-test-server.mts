/**
 * @file Shared HTTP test server for DLX binary tests. Serves stub binary
 *   payloads (success, integrity-tagged, error codes, Windows script
 *   extensions, slow responses) so the dlxBinary download/cache suites can
 *   exercise the full code path without reaching the network. Consumed by
 *   binary.test.mts and binary-cache-list.test.mts.
 */

import crypto from 'node:crypto'
import http from 'node:http'

export interface DlxTestServer {
  baseUrl: string
  port: number
  server: http.Server
}

export async function startDlxTestServer(): Promise<DlxTestServer> {
  return await new Promise<DlxTestServer>(resolve => {
    const server = http.createServer((req, res) => {
      const url = req.url || ''

      if (url === '/binary') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end('#!/bin/bash\necho "test binary"')
      } else if (url === '/binary-with-integrity') {
        const content = '#!/bin/bash\necho "verified binary"'
        const hash = crypto
          .createHash('sha512')
          .update(content)
          .digest('base64')
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'X-Integrity': `sha512-${hash}`,
        })
        res.end(content)
      } else if (url === '/binary-invalid-checksum') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end('#!/bin/bash\necho "wrong content"')
      } else if (url === '/binary-404') {
        res.writeHead(404)
        res.end('Not Found')
      } else if (url === '/binary-500') {
        res.writeHead(500)
        res.end('Internal Server Error')
      } else if (url === '/binary-windows.cmd') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end('@echo off\necho "windows script"')
      } else if (url === '/binary-windows.bat') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end('@echo off\necho "batch script"')
      } else if (url === '/binary-windows.ps1') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
        res.end('Write-Host "powershell script"')
      } else if (url === '/slow-binary') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
          res.end('#!/bin/bash\necho "slow binary"')
        }, 100)
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    server.listen(0, () => {
      const address = server.address()
      let baseUrl = ''
      let port = 0
      if (address && typeof address === 'object') {
        port = address.port
        baseUrl = `http://localhost:${port}`
      }
      resolve({ baseUrl, port, server })
    })
  })
}

export async function stopDlxTestServer(server: http.Server): Promise<void> {
  await new Promise<void>(resolve => {
    server.close(() => resolve())
  })
}
