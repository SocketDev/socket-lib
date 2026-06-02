/**
 * @file Unit tests for the `secrets/socket-api-token` convenience helper.
 *   Verifies that the wrapper looks up the fleet-canonical env vars
 *   (`SOCKET_API_TOKEN` → `SOCKET_API_KEY`) in order, that the sync + async
 *   variants behave identically on the env-var path, and that `allowEnvOnly`
 *   suppresses the keychain fallback. Env-var values are tested directly (no
 *   mocking); keychain behavior is covered by `secrets.test.mts`. The helpers
 *   below read/write `process.env.SOCKET_API_TOKEN` directly so the suite can
 *   drive the env-var precedence path of the resolver. That is the exact
 *   scenario the `use-fleet-canonical-api-token-getter` bypass exists for
 *   (test/bootstrap code manipulating the raw env), so each direct access
 *   carries the `socket-api-token-getter: allow direct-env` marker.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  readSocketApiToken,
  readSocketApiTokenSync,
} from '../../src/secrets/socket-api-token'

const TOKEN_VAR = 'SOCKET_API_TOKEN'

export function readTokenEnv(): string | undefined {
  // socket-api-token-getter: allow direct-env
  return process.env[TOKEN_VAR]
}

export function setTokenEnv(value: string): void {
  // socket-api-token-getter: allow direct-env
  process.env[TOKEN_VAR] = value
}

export function clearTokenEnv(): void {
  // Clear BOTH the canonical name and the legacy SOCKET_API_KEY alias that
  // readSocketApiToken falls back to — otherwise a SOCKET_API_KEY set in the
  // runner's env (CI / dev) leaks into the "returns undefined when unset" cases.
  // socket-api-token-getter: allow direct-env
  delete process.env[TOKEN_VAR]
  // socket-api-token-getter: allow direct-env
  // socket-api-token-env: bootstrap -- compat test clears the legacy alias the getter falls back to
  delete process.env['SOCKET_API_KEY']
}

export function snapshotEnv(): { restore: () => void } {
  const prevToken = readTokenEnv()
  clearTokenEnv()
  return {
    restore: () => {
      if (prevToken === undefined) {
        clearTokenEnv()
      } else {
        setTokenEnv(prevToken)
      }
    },
  }
}

describe.sequential('secrets/socket-api-token', () => {
  let envSnap: { restore: () => void }
  beforeEach(() => {
    envSnap = snapshotEnv()
  })
  afterEach(() => {
    envSnap.restore()
  })

  it('reads the canonical SOCKET_API_TOKEN env var', async () => {
    setTokenEnv('canonical-value')
    expect(await readSocketApiToken({ allowEnvOnly: true })).toBe(
      'canonical-value',
    )
  })

  it('returns the env value via the allowEnvOnly path', async () => {
    setTokenEnv('legacy-value')
    expect(await readSocketApiToken({ allowEnvOnly: true })).toBe(
      'legacy-value',
    )
  })

  it('returns undefined when the env var is unset (allowEnvOnly)', async () => {
    expect(await readSocketApiToken({ allowEnvOnly: true })).toBeUndefined()
  })

  it('reads a populated env var on the sync path', () => {
    setTokenEnv('sync-value')
    expect(readSocketApiTokenSync({ allowEnvOnly: true })).toBe('sync-value')
  })

  it('sync variant: returns undefined when nothing is set', () => {
    expect(readSocketApiTokenSync({ allowEnvOnly: true })).toBeUndefined()
  })

  it('options are optional (defaults to allowing keychain fallback)', async () => {
    // With the env var set, the call resolves to that value without touching
    // the keychain.
    setTokenEnv('present')
    const value = await readSocketApiToken()
    expect(value).toBe('present')
  })
})
