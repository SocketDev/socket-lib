import { mkdtempSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearEnv, resetEnv, setEnv } from '../../../src/env/rewire'
import { getRuntimeSocketPath } from '../../../src/paths/socket'
import { requestFromBroker } from '../../../src/secrets/broker'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

let tmpDir = ''
let server: net.Server | undefined

// Stand up a mock proteus daemon at the path the client resolves, replying with
// `response` to the first request line.
function startMockDaemon(response: string): Promise<void> {
  const sockPath = getRuntimeSocketPath('proteus')
  return new Promise((resolve, reject) => {
    const srv = net.createServer(conn => {
      let buffer = ''
      conn.on('data', chunk => {
        buffer += String(chunk)
        if (buffer.includes('\n')) {
          conn.write(response)
        }
      })
    })
    server = srv
    srv.on('error', reject)
    srv.listen(sockPath, () => resolve())
  })
}

beforeEach(async () => {
  // A short prefix keeps the Unix socket path under the platform length cap.
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'pb-'))
  // Pin the runtime dir so the client and the mock daemon agree on the path.
  setEnv('XDG_RUNTIME_DIR', tmpDir)
})

afterEach(async () => {
  // Await the close so the socket / Windows named pipe is fully released before
  // the next test re-listens. On Windows getRuntimeSocketPath ignores the
  // per-test tmpDir and returns a FIXED \\.\pipe\proteus-sock, so a non-awaited
  // close let the next listen() race the still-closing pipe (intermittent EADDRINUSE).
  await new Promise<void>(resolve => {
    if (server) {
      server.close(() => resolve())
    } else {
      resolve()
    }
  })
  server = undefined
  clearEnv('XDG_RUNTIME_DIR')
  resetEnv()
  await safeDelete(tmpDir)
})

describe('secrets/broker', () => {
  it('returns undefined when no daemon socket exists', async () => {
    expect(
      await requestFromBroker({ account: 'A', service: 'socketsecurity' }),
    ).toBeUndefined()
  })

  it('returns the value the daemon vends', async () => {
    await startMockDaemon('{"ok":true,"value":"sk-test-123"}\n')
    expect(
      await requestFromBroker({
        account: 'ANTHROPIC_API_KEY',
        service: 'socketsecurity',
      }),
    ).toBe('sk-test-123')
  })

  it('returns undefined when the daemon reports a miss', async () => {
    await startMockDaemon('{"ok":false,"error":"not-found"}\n')
    expect(
      await requestFromBroker({ account: 'A', service: 'socketsecurity' }),
    ).toBeUndefined()
  })
})
