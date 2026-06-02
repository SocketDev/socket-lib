/**
 * @file Secrets/keychain — platform detection + backend availability. Shares
 *   the mock scaffolding in test/util/keychain-mocks.mts; runs isolated
 *   (isolated-tests.json) so loadFreshKeychain's vi.resetModules takes effect.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  linuxMockFactory,
  loadFreshKeychain,
  macosMockFactory,
  windowsMockFactory,
} from '../../util/keychain-mocks.mts'

import type { KeychainPlatform } from '../../util/keychain-mocks.mts'

import type * as nodeOs from 'node:os'

const { mockPlatform } = vi.hoisted(() => ({
  mockPlatform: vi.fn(() => 'darwin'),
}))

vi.mock(import('node:os'), async () => {
  const actual = await vi.importActual<typeof nodeOs>('node:os')
  // keychain.ts does `import os from 'node:os'` then `os.platform()`, so the
  // mocked platform must live on BOTH the named export and the default export
  // — otherwise the default-imported `os.platform()` hits the real platform.
  const mocked = {
    ...actual,
    platform: mockPlatform,
  } as unknown as typeof nodeOs
  return { ...mocked, default: mocked }
})

vi.mock(import('../../../src/secrets/macos'), () => macosMockFactory())
vi.mock(import('../../../src/secrets/linux'), () => linuxMockFactory())
vi.mock(import('../../../src/secrets/windows'), () => windowsMockFactory())

const loadFresh = (plat?: KeychainPlatform) =>
  loadFreshKeychain(mockPlatform, plat)

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('secrets/keychain — detectPlatform', () => {
  test('returns darwin / linux / win32 verbatim', async () => {
    for (const p of ['darwin', 'linux', 'win32'] as const) {
      const { mod } = await loadFresh(p)
      expect(mod.detectPlatform()).toBe(p)
    }
  })

  test('returns "other" for any unsupported platform', async () => {
    const { mod } = await loadFresh('other')
    expect(mod.detectPlatform()).toBe('other')
  })
})

describe.sequential('secrets/keychain — getBackendAvailability', () => {
  test('darwin: reports security(1) toolName, no installHint', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['isMacOSBackendAvailable']!.mockReturnValue(true)
    const result = mod.getBackendAvailability()
    expect(result.available).toBe(true)
    expect(result.toolName).toBe('security(1)')
    expect(result.installHint).toBeUndefined()
  })

  test('linux: includes install hint when libsecret is unavailable', async () => {
    const { linux, mod } = await loadFresh('linux')
    linux['isLinuxBackendAvailable']!.mockReturnValue(false)
    const result = mod.getBackendAvailability()
    expect(result.available).toBe(false)
    expect(result.toolName).toBe('secret-tool')
    expect(result.installHint).toMatch(/apt install libsecret-tools/)
  })

  test('linux: omits install hint when libsecret is available', async () => {
    const { linux, mod } = await loadFresh('linux')
    linux['isLinuxBackendAvailable']!.mockReturnValue(true)
    expect(mod.getBackendAvailability().installHint).toBeUndefined()
  })

  test('win32: reports PowerShell CredentialManager toolName', async () => {
    const { mod, windows } = await loadFresh('win32')
    windows['isWindowsBackendAvailable']!.mockReturnValue(true)
    const result = mod.getBackendAvailability()
    expect(result.toolName).toBe('PowerShell (CredentialManager / DPAPI)')
  })

  test('other: reports not-supported message', async () => {
    const { mod } = await loadFresh('other')
    const result = mod.getBackendAvailability()
    expect(result.available).toBe(false)
    expect(result.toolName).toBe('n/a')
    expect(result.installHint).toMatch(/is not supported/)
  })
})
