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

import type { Readable, Writable } from 'node:stream'

const logger = getDefaultLogger()

export async function handleOne(stdin?: Readable, stdout?: Writable): Promise<void> {
  const inStream = stdin ?? process.stdin
  const outStream = stdout ?? process.stdout
  const header = await readExact(4, inStream)
  const length = header.readUInt32LE(0)
  if (length === 0 || length > 1_048_576) {
    writeMessage({ error: `invalid message length: ${length}` }, outStream)
    return
  }

  const body = await readExact(length, inStream)
  let msg: unknown
  try {
    msg = JSON.parse(body.toString('utf8'))
  } catch {
    writeMessage({ error: 'message is not valid JSON' }, outStream)
    return
  }

  const type = (msg as Record<string, unknown>)['type']

  if (type === 'get-api-token') {
    const token = await readSocketApiToken()
    if (token) {
      writeMessage({ token }, outStream)
    } else {
      writeMessage(
        {
          error:
            'Socket API token not found. Set SOCKET_API_TOKEN in your environment.',
        },
        outStream,
      )
    }
    return
  }

  writeMessage({ error: `unknown message type: ${String(type)}` }, outStream)
}

// Native messaging: read exactly `length` bytes from the stream. Uses
// the paused-mode `readable` event so leftover bytes stay in the
// stream's internal buffer between calls — flowing-mode `data` would
// hand us oversized chunks with no way to put the tail back.
export function readExact(length: number, stream?: Readable): Promise<Buffer> {
  const src = stream ?? process.stdin
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0

    function cleanup(): void {
      src.off('readable', onReadable)
      src.off('error', onError)
      src.off('end', onEnd)
    }

    function tryRead(): void {
      let needed = length - received
      while (needed > 0) {
        const chunk = src.read(needed) ?? src.read()
        if (chunk === null) {
          return
        }
        chunks.push(chunk)
        received += chunk.length
        needed = length - received
      }
      cleanup()
      const full = Buffer.concat(chunks)
      if (received > length) {
        src.unshift(full.subarray(length))
      }
      resolve(full.subarray(0, length))
    }

    function onReadable(): void {
      tryRead()
    }

    function onError(err: Error): void {
      cleanup()
      reject(err)
    }

    function onEnd(): void {
      cleanup()
      reject(new Error('stdin closed before message was complete'))
    }

    src.on('readable', onReadable)
    src.on('error', onError)
    src.once('end', onEnd)
    // Drain anything already buffered (e.g. from a previous readExact
    // unshift, or a synchronously-populated test stream).
    tryRead()
  })
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
  while (true) {
    try {
      await handleOne()
    } catch {
      // stdin closed — normal Chrome shutdown.
      process.exit(0)
    }
  }
}

export function writeMessage(obj: unknown, stream?: Writable): void {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8')
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(payload.length, 0)
  // Native messaging protocol requires raw binary writes to stdout.
  // Chrome treats any non-protocol byte as a framing error, so the logger
  // must not be used here. socket-hook: allow console
  ;(stream ?? process.stdout).write(Buffer.concat([header, payload])) // socket-hook: allow console
}
