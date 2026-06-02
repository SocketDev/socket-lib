/**
 * @file Chrome native messaging host entry point. Chrome launches this script
 *   as a subprocess when the extension calls
 *   `chrome.runtime.connectNative('dev.socket.trusted-publisher-host')`. The
 *   protocol is length-prefixed binary over stdin/stdout: incoming: [4-byte LE
 *   uint32 length][UTF-8 JSON message] outgoing: [4-byte LE uint32
 *   length][UTF-8 JSON response] The host handles one request type: { type:
 *   'get-api-token' } → { token: string } | { error: string } The host NEVER
 *   logs to stdout (Chrome treats any stdout byte outside the length-prefixed
 *   protocol as a message boundary error). All diagnostics go to stderr only.
 *   Detection: Chrome passes the extension origin as `process.argv[2]`
 *   (`chrome-extension://<id>/`). The `NATIVE_MESSAGING_HOST` constant in
 *   `src/constants/platform.ts` captures this check so other modules can skip
 *   TTY-only paths when running in this context.
 */

import process from 'node:process'

import { getDefaultLogger } from '../logger/default'
import { readSocketApiToken } from '../secrets/socket-api-token'
import { assertNodeStripTypesSupported } from './install'

const logger = getDefaultLogger()

export async function handleOne(): Promise<void> {
  const header = await readExact(4)
  const length = header.readUInt32LE(0)
  if (length === 0 || length > 1_048_576) {
    writeMessage({ error: `invalid message length: ${length}` })
    return
  }

  const body = await readExact(length)
  let msg: unknown
  try {
    msg = JSON.parse(body.toString('utf8'))
  } catch {
    writeMessage({ error: 'message is not valid JSON' })
    return
  }

  const type = (msg as Record<string, unknown>)['type']

  if (type === 'get-api-token') {
    const token = await readSocketApiToken()
    if (token) {
      writeMessage({ token })
    } else {
      writeMessage({
        error:
          'Socket API token not found. Set SOCKET_API_TOKEN in your ' +
          'environment or store it in the OS keychain under service ' +
          '"socket-cli", account "SOCKET_API_TOKEN".',
      })
    }
    return
  }

  writeMessage({ error: `unknown message type: ${String(type)}` })
}

// Native messaging: read exactly `length` bytes from stdin.
export function readExact(length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0

    function onData(chunk: Buffer): void {
      chunks.push(chunk)
      received += chunk.length
      if (received >= length) {
        process.stdin.off('data', onData)
        process.stdin.off('error', reject)
        const full = Buffer.concat(chunks)
        resolve(full.subarray(0, length))
      }
    }

    process.stdin.on('data', onData)
    process.stdin.on('error', reject)
    process.stdin.once('end', () => {
      process.stdin.off('data', onData)
      reject(new Error('stdin closed before message was complete'))
    })
  })
}

export function writeMessage(obj: unknown): void {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8')
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(payload.length, 0)
  // Native messaging protocol requires raw binary writes to stdout.
  // Chrome treats any non-protocol byte as a framing error, so the logger
  // must not be used here. socket-hook: allow console
  process.stdout.write(Buffer.concat([header, payload])) // socket-hook: allow console
}

export async function runHost(): Promise<void> {
  // Defense in depth: the installer already gates on Node version, but a
  // user could switch Node versions (e.g. via nvm) between install and the
  // moment Chrome execs the wrapper. logger.error writes to stderr —
  // stdout is reserved for the length-prefixed NM protocol.
  try {
    assertNodeStripTypesSupported()
  } catch (e) {
    logger.error((e as Error).message)
    process.exit(1)
  }
  process.stdin.resume()
  while (true) {
    try {
      await handleOne()
    } catch {
      // stdin closed — normal Chrome shutdown.
      process.exit(0)
    }
  }
}
