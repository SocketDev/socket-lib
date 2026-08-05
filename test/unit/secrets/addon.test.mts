/**
 * @file Unit tests for `secrets/addon` — the sockeye `keychain.node` biometric
 *   backend. The native addon is absent in CI by design, so these drive the
 *   `setKeychainAddon` seam: the contract under test is the SELF-GATING —
 *   absence, a missing item, and a cancelled Touch ID prompt (a throw from the
 *   Secure-Enclave ACL) must all read as `undefined`/`false` fall-throughs,
 *   never as errors, because `resolve()` treats this layer exactly like the
 *   broker: dormant unless it can answer.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getKeychainAddon,
  readSecretBiometric,
  setKeychainAddon,
  writeSecretBiometric,
} from '../../../src/secrets/addon'
import type { KeychainAddon } from '../../../src/secrets/addon'

const SLOT = { account: 'SOCKET_API_TOKEN', service: 'socketsecurity' }

function fakeAddon(
  overrides?: Partial<KeychainAddon> | undefined,
): KeychainAddon {
  return {
    del: vi.fn(() => true),
    get: vi.fn(() => 'tok_value'),
    set: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  // Forced ABSENCE, not lazy re-probe: a later test must never accidentally
  // load a real native addon on a developer's machine.
  setKeychainAddon(undefined)
})

describe('secrets/addon', () => {
  it('reads through the addon when one is present', () => {
    const addon = fakeAddon()
    setKeychainAddon(addon)
    expect(readSecretBiometric(SLOT)).toBe('tok_value')
    expect(addon.get).toHaveBeenCalledWith('socketsecurity', 'SOCKET_API_TOKEN')
  })

  it('returns undefined when no addon is installed', () => {
    setKeychainAddon(undefined)
    expect(readSecretBiometric(SLOT)).toBeUndefined()
    expect(getKeychainAddon()).toBeUndefined()
  })

  it('treats a missing item as a fall-through, not an error', () => {
    setKeychainAddon(fakeAddon({ get: vi.fn(() => undefined) }))
    expect(readSecretBiometric(SLOT)).toBeUndefined()
  })

  it('treats an empty stored value as absent', () => {
    setKeychainAddon(fakeAddon({ get: vi.fn(() => '') }))
    expect(readSecretBiometric(SLOT)).toBeUndefined()
  })

  it('treats a cancelled Touch ID prompt (addon throw) as a fall-through', () => {
    setKeychainAddon(
      fakeAddon({
        get: vi.fn(() => {
          throw new Error('User canceled the operation')
        }),
      }),
    )
    expect(readSecretBiometric(SLOT)).toBeUndefined()
  })

  it('writes through the addon and reports true', () => {
    const addon = fakeAddon()
    setKeychainAddon(addon)
    expect(writeSecretBiometric(SLOT, 'v')).toBe(true)
    expect(addon.set).toHaveBeenCalledWith(
      'socketsecurity',
      'SOCKET_API_TOKEN',
      'v',
    )
  })

  it('reports false rather than throwing when a write cannot take the ACL', () => {
    // The caller uses false to fall back to writeSecret and to report which
    // protection level the value actually ended up with.
    setKeychainAddon(undefined)
    expect(writeSecretBiometric(SLOT, 'v')).toBe(false)
    setKeychainAddon(
      fakeAddon({
        set: vi.fn(() => {
          throw new Error('errSecAuthFailed')
        }),
      }),
    )
    expect(writeSecretBiometric(SLOT, 'v')).toBe(false)
  })
})
