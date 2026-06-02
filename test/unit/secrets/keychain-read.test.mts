/**
 * @file Secrets/keychain — readSecret / readSecretSync platform routing + the
 *   dedupe-read cache. Shares the mock scaffolding in
 *   test/util/keychain-mocks.mts.
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
  // mocked platform must live on BOTH the named export and the default export.
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

describe.sequential('secrets/keychain — readSecret', () => {
  test('routes to readMacOS on darwin', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValueOnce('mac-value')
    expect(await mod.readSecret({ service: 's', account: 'a' })).toBe(
      'mac-value',
    )
    expect(macos['readMacOS']).toHaveBeenCalledWith('s', 'a')
  })

  test('routes to readLinux on linux', async () => {
    const { linux, mod } = await loadFresh('linux')
    linux['readLinux']!.mockResolvedValueOnce('linux-value')
    expect(await mod.readSecret({ service: 's', account: 'a' })).toBe(
      'linux-value',
    )
  })

  test('routes to readWindows on win32', async () => {
    const { mod, windows } = await loadFresh('win32')
    windows['readWindows']!.mockResolvedValueOnce('win-value')
    expect(await mod.readSecret({ service: 's', account: 'a' })).toBe(
      'win-value',
    )
  })

  test('returns undefined on unsupported platforms', async () => {
    const { mod } = await loadFresh('other')
    expect(await mod.readSecret({ service: 's', account: 'a' })).toBeUndefined()
  })

  test('uses dedupeRead cache for repeated reads', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValueOnce('cached')
    const a = await mod.readSecret({ service: 'svc', account: 'acc' })
    const b = await mod.readSecret({ service: 'svc', account: 'acc' })
    expect(a).toBe('cached')
    expect(b).toBe('cached')
    expect(macos['readMacOS']).toHaveBeenCalledTimes(1)
  })
})

describe.sequential('secrets/keychain — readSecretSync', () => {
  test('routes to readMacOSSync on darwin', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOSSync']!.mockReturnValueOnce('mac-sync')
    expect(mod.readSecretSync({ service: 's', account: 'a' })).toBe('mac-sync')
  })

  test('routes to readLinuxSync on linux', async () => {
    const { linux, mod } = await loadFresh('linux')
    linux['readLinuxSync']!.mockReturnValueOnce('linux-sync')
    expect(mod.readSecretSync({ service: 's', account: 'a' })).toBe(
      'linux-sync',
    )
  })

  test('routes to readWindowsSync on win32', async () => {
    const { mod, windows } = await loadFresh('win32')
    windows['readWindowsSync']!.mockReturnValueOnce('win-sync')
    expect(mod.readSecretSync({ service: 's', account: 'a' })).toBe('win-sync')
  })

  test('returns undefined on unsupported platforms', async () => {
    const { mod } = await loadFresh('other')
    expect(mod.readSecretSync({ service: 's', account: 'a' })).toBeUndefined()
  })

  test('returns the cached value on the second sync read', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOSSync']!.mockReturnValueOnce('cached-sync')
    const a = mod.readSecretSync({
      service: 'svc-cached-sync',
      account: 'acc-cached-sync',
    })
    const b = mod.readSecretSync({
      service: 'svc-cached-sync',
      account: 'acc-cached-sync',
    })
    expect(a).toBe('cached-sync')
    expect(b).toBe('cached-sync')
    expect(macos['readMacOSSync']).toHaveBeenCalledTimes(1)
  })
})
