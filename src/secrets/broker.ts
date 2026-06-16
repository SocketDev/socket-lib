/**
 * @file Proteus broker client. Asks the running proteus credential daemon for a
 *   secret over its local Unix socket (Windows named pipe later), so a
 *   biometric-gated read happens inside the daemon and the value is vended to
 *   this process in memory rather than sitting in an env var. This is the layer
 *   `ai/credentials.mts` documents as slotting between the env check and the
 *   keychain read in `secrets/find.ts` `resolve()`.
 *   The broker is OPTIONAL and self-gating: when the daemon isn't running (no
 *   socket file), `requestFromBroker` returns `undefined` immediately and the
 *   caller falls through to the keychain. It never throws — a broker miss is a
 *   fall-through, not an error. The daemon binary itself is built by socket-btm
 *   (`packages/proteus-builder`); download-and-start is a later layer, so today
 *   this only talks to an already-running daemon.
 */

import { existsSync } from 'node:fs'
import net from 'node:net'

import { getRuntimeSocketPath } from '../paths/socket'

// The daemon's name; getRuntimeSocketPath maps it to the socket path the daemon
// and this client both compute (1 path, 1 reference).
const PROTEUS_SOCKET_NAME = 'proteus'

// A live daemon answers within milliseconds; cap the wait so a wedged socket
// can't stall credential resolution for the whole process.
const BROKER_TIMEOUT_MS = 1000

export interface BrokerRequestOptions {
  /**
   * The keychain service scope (e.g. `socketsecurity`).
   */
  readonly service: string
  /**
   * The account within the service (e.g. `ANTHROPIC_API_KEY`).
   */
  readonly account: string
}

export interface BrokerResponse {
  readonly ok?: boolean | undefined
  readonly value?: string | undefined
}

/**
 * Ask the proteus daemon for a credential. Returns the value on success, or
 * `undefined` when the daemon isn't running, doesn't hold it, or the biometric
 * prompt was declined. Never throws: a miss falls through to the next resolver
 * layer (the keychain).
 */
export async function requestFromBroker({
  account,
  service,
}: BrokerRequestOptions): Promise<string | undefined> {
  const socketPath = getRuntimeSocketPath(PROTEUS_SOCKET_NAME)
  // Self-gating: no socket file means no daemon. existsSync is also false for a
  // Windows pipe path, so the broker stays dormant there until the win32 daemon
  // ships, with the caller transparently falling through to the keychain.
  if (!existsSync(socketPath)) {
    return undefined
  }
  return await new Promise<string | undefined>(resolvePromise => {
    const conn = net.connect(socketPath)
    let buffer = ''
    let settled = false
    function settle(value: string | undefined): void {
      if (settled) {
        return
      }
      settled = true
      conn.destroy()
      resolvePromise(value)
    }
    conn.setTimeout(BROKER_TIMEOUT_MS)
    conn.on('timeout', () => settle(undefined))
    conn.on('error', () => settle(undefined))
    conn.on('connect', () => {
      const payload = JSON.stringify({ account, op: 'get', service })
      conn.write(`${payload}\n`)
    })
    conn.on('data', chunk => {
      buffer += String(chunk)
      const newlineAt = buffer.indexOf('\n')
      if (newlineAt === -1) {
        return
      }
      try {
        const parsed = JSON.parse(buffer.slice(0, newlineAt)) as BrokerResponse
        settle(
          parsed.ok && typeof parsed.value === 'string'
            ? parsed.value
            : undefined,
        )
      } catch {
        settle(undefined)
      }
    })
  })
}
