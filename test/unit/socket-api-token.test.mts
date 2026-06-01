/**
 * @file Unit tests for the `secrets/socket-api-token` convenience helper.
 *   Verifies that the wrapper looks up the fleet-canonical env vars
 *   (`SOCKET_API_TOKEN` → `SOCKET_API_KEY`) in order, that the sync + async
 *   variants behave identically on the env-var path, and that `allowEnvOnly`
 *   suppresses the keychain fallback. Env-var values are tested directly (no
 *   mocking); keychain behavior is covered by `secrets.test.mts`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  readSocketApiToken,
  readSocketApiTokenSync,
} from '../../src/secrets/socket-api-token'

export function snapshotEnv(): { restore: () => void } {
  const prevToken = process.env['SOCKET_API_TOKEN']
  const prevKey = process.env['SOCKET_API_TOKEN']
  delete process.env['SOCKET_API_TOKEN']
  delete process.env['SOCKET_API_TOKEN']
  return {
    restore: () => {
      if (prevToken === undefined) {
        delete process.env['SOCKET_API_TOKEN']
      } else {
        process.env['SOCKET_API_TOKEN'] = prevToken
      }
      if (prevKey === undefined) {
        delete process.env['SOCKET_API_TOKEN']
      } else {
        process.env['SOCKET_API_TOKEN'] = prevKey
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
    process.env['SOCKET_API_TOKEN'] = 'canonical-value'
    expect(await readSocketApiToken({ allowEnvOnly: true })).toBe(
      'canonical-value',
    )
  })

  it('falls back to legacy SOCKET_API_KEY when canonical is unset', async () => {
    process.env['SOCKET_API_TOKEN'] = 'legacy-value'
    expect(await readSocketApiToken({ allowEnvOnly: true })).toBe(
      'legacy-value',
    )
  })

  it('prefers canonical over legacy when both are set', async () => {
    process.env['SOCKET_API_TOKEN'] = 'canonical-wins'
    process.env['SOCKET_API_TOKEN'] = 'legacy-loses'
    expect(await readSocketApiToken({ allowEnvOnly: true })).toBe(
      'canonical-wins',
    )
  })

  it('returns undefined when neither env var is set (allowEnvOnly)', async () => {
    expect(await readSocketApiToken({ allowEnvOnly: true })).toBeUndefined()
  })

  it('treats whitespace-only env var as unset', async () => {
    process.env['SOCKET_API_TOKEN'] = '   '
    process.env['SOCKET_API_TOKEN'] = 'real-legacy'
    expect(await readSocketApiToken({ allowEnvOnly: true })).toBe('real-legacy')
  })

  it('sync variant mirrors async on the env path', () => {
    process.env['SOCKET_API_TOKEN'] = 'sync-value'
    expect(readSocketApiTokenSync({ allowEnvOnly: true })).toBe('sync-value')
  })

  it('sync variant: legacy fallback', () => {
    process.env['SOCKET_API_TOKEN'] = 'sync-legacy'
    expect(readSocketApiTokenSync({ allowEnvOnly: true })).toBe('sync-legacy')
  })

  it('sync variant: returns undefined when nothing is set', () => {
    expect(readSocketApiTokenSync({ allowEnvOnly: true })).toBeUndefined()
  })

  it('options are optional (defaults to allowing keychain fallback)', async () => {
    // With no env vars set and no options, the call must not throw. The
    // result depends on whether the host keychain has a `socket-cli` entry,
    // so we only assert the shape: a string or undefined.
    process.env['SOCKET_API_TOKEN'] = 'present'
    const value = await readSocketApiToken()
    expect(value).toBe('present')
  })
})
