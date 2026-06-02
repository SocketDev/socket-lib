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
 *
 *   ## Threat model
 *
 *   **The OS keychain is the trust boundary.** This host hands a Socket API
 *   bearer token to a Chrome extension. If a process running as the user can
 *   read the keychain, that process can read the token directly without going
 *   through us — so we don't try to defend against keychain-level compromise.
 *   We DO defend against:
 *
 *   1. **A hijacked extension hammering `get-api-token`.** A compromised CDN
 *      dependency or XSS in a content script can call `connectNative` in a
 *      tight loop. The token-bucket rate limit (capacity 60, refill 1s) gives a
 *      typing-fast human all the headroom they need and bounds a bot to 1 req/s
 *      sustained.
 *   2. **Foreign extensions connecting to this host.** Chrome enforces
 *      `allowed_origins` from the host manifest. The installer rejects `['*']`
 *      in production mode (see `installNativeHost`'s `production` opt); dev
 *      mode allows it for unsigned-extension testing.
 *   3. **Token logging leaks.** `logger.error` writes to stderr; the token is
 *      never passed through it. The only path the token traverses on its way
 *      out is the protocol stdout write, which is binary-framed JSON.
 *   4. **Protocol abuse.** Messages over 1 MiB are rejected; malformed JSON is
 *      rejected with a structured error; unknown `type` values are echoed back
 *      so the extension can detect contract drift. **Out of scope:** keychain
 *      ACL bypass (out-of-process attacker reading our memory), Chrome itself
 *      being malicious (then `connectNative` is the least of our problems), and
 *      side-channel attacks on the length-prefix protocol (the protocol is
 *      between Chrome and Node; we don't drive its timing).
 */

import process from 'node:process'

import { getDefaultLogger } from '../logger/default'
import { readSocketApiToken } from '../secrets/socket-api-token'
import { assertNodeStripTypesSupported } from './install'
import { TokenBucketLimiter } from './rate-limit'

const logger = getDefaultLogger()

// One bucket per extension origin (`chrome-extension://<id>/`, passed by
// Chrome as argv[2]). Capacity 60 + 1s refill = burst 60 then sustained
// 1 req/s. A user pasting commands or rapid-clicking a panel button
// never hits the limit; a botted extension burns through 60 in a few
// frames then gets locked to 1/s, which is too slow to be useful.
//
// `maxKeys: 32` bounds memory: even if an attacker varies the origin
// arg, we'll never carry more than 32 buckets in memory. The LRU evicts
// the oldest first so legitimate origins stay hot.
const limiter = new TokenBucketLimiter({
  capacity: 60,
  refillIntervalMs: 1000,
  maxKeys: 32,
})

// Bucket key. `argv[2]` is the Chrome-passed extension origin; absent
// during local CLI testing, in which case all requests share one
// bucket under the 'cli' label.
export function bucketKey(): string {
  return process.argv[2] ?? 'cli'
}

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

  // Rate-limit per origin. Burst-friendly for humans, restrictive enough
  // to bound a botted extension. The check runs AFTER framing + JSON
  // parse so malformed traffic doesn't drain real callers' buckets.
  if (!limiter.consume(bucketKey())) {
    writeMessage({
      error: 'rate limited; try again in a moment',
    })
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
          'Socket API token not found. Set SOCKET_API_TOKEN in your environment.',
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

export function writeMessage(obj: unknown): void {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8')
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(payload.length, 0)
  // Native messaging protocol requires raw binary writes to stdout.
  // Chrome treats any non-protocol byte as a framing error, so the logger
  // must not be used here. socket-hook: allow console
  process.stdout.write(Buffer.concat([header, payload])) // socket-hook: allow console
}
