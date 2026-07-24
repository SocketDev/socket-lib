/**
 * @file Secrets/keychain — deleteSecret(Sync), the slot helpers
 *   (read/write/deleteSecretFromSlots), and clearCache. Shares the mock
 *   scaffolding in test/util/keychain-mocks.mts.
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

const loadFresh = (plat?: KeychainPlatform | undefined) =>
  loadFreshKeychain(mockPlatform, plat)

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('secrets/keychain — deleteSecret + deleteSecretSync', () => {
  test('async: routes to deleteMacOS on darwin', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['deleteMacOS']!.mockResolvedValueOnce('removed')
    expect(await mod.deleteSecret({ service: 's', account: 'a' })).toBe(
      'removed',
    )
  })

  test('async: routes to deleteLinux on linux', async () => {
    const { linux, mod } = await loadFresh('linux')
    linux['deleteLinux']!.mockResolvedValueOnce('absent')
    expect(await mod.deleteSecret({ service: 's', account: 'a' })).toBe(
      'absent',
    )
  })

  test('async: routes to deleteWindows on win32', async () => {
    const { mod, windows } = await loadFresh('win32')
    windows['deleteWindows']!.mockResolvedValueOnce('removed')
    expect(await mod.deleteSecret({ service: 's', account: 'a' })).toBe(
      'removed',
    )
  })

  test('async: returns "absent" on unsupported platforms', async () => {
    const { mod } = await loadFresh('other')
    expect(await mod.deleteSecret({ service: 's', account: 'a' })).toBe(
      'absent',
    )
  })

  test('sync: routes to deleteMacOSSync on darwin', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['deleteMacOSSync']!.mockReturnValueOnce('removed')
    expect(mod.deleteSecretSync({ service: 's', account: 'a' })).toBe('removed')
  })

  test('sync: routes to deleteLinuxSync on linux', async () => {
    const { linux, mod } = await loadFresh('linux')
    linux['deleteLinuxSync']!.mockReturnValueOnce('removed')
    expect(mod.deleteSecretSync({ service: 's', account: 'a' })).toBe('removed')
  })

  test('sync: routes to deleteWindowsSync on win32', async () => {
    const { mod, windows } = await loadFresh('win32')
    windows['deleteWindowsSync']!.mockReturnValueOnce('absent')
    expect(mod.deleteSecretSync({ service: 's', account: 'a' })).toBe('absent')
  })

  test('sync: returns "absent" on unsupported platforms', async () => {
    const { mod } = await loadFresh('other')
    expect(mod.deleteSecretSync({ service: 's', account: 'a' })).toBe('absent')
  })
})

describe.sequential('secrets/keychain — slot helpers', () => {
  test('readSecretFromSlots returns first matching account', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValueOnce(undefined).mockResolvedValueOnce(
      'found',
    )
    expect(
      await mod.readSecretFromSlots({
        service: 's',
        accounts: ['legacy', 'canonical'],
      }),
    ).toEqual({ value: 'found', account: 'canonical' })
  })

  test('readSecretFromSlots returns undefined when no slot matches', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValue(undefined)
    expect(
      await mod.readSecretFromSlots({
        service: 's',
        accounts: ['a', 'b'],
      }),
    ).toBeUndefined()
  })

  test('readSecretFromSlotsSync returns first matching account', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOSSync']!.mockReturnValueOnce(undefined).mockReturnValueOnce(
      'found-sync',
    )
    expect(
      mod.readSecretFromSlotsSync({
        service: 's',
        accounts: ['a', 'b'],
      }),
    ).toEqual({ value: 'found-sync', account: 'b' })
  })

  test('writeSecretToSlots writes to each account in order', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValue(undefined)
    macos['writeMacOS']!.mockResolvedValue(undefined)
    const results = await mod.writeSecretToSlots({
      service: 's',
      accounts: ['a', 'b'],
      value: 'v',
    })
    expect(results.map(r => r.account)).toEqual(['a', 'b'])
    expect(results.every(r => r.outcome === 'written')).toBe(true)
  })

  test('writeSecretToSlotsSync writes to each account in order', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOSSync']!.mockReturnValue(undefined)
    const results = mod.writeSecretToSlotsSync({
      service: 's',
      accounts: ['a', 'b'],
      value: 'v',
    })
    expect(results.map(r => r.account)).toEqual(['a', 'b'])
  })

  test('deleteSecretFromSlots deletes each account', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['deleteMacOS']!.mockResolvedValueOnce(
      'removed',
    ).mockResolvedValueOnce('absent')
    const results = await mod.deleteSecretFromSlots({
      service: 's',
      accounts: ['a', 'b'],
    })
    expect(results).toEqual([
      { account: 'a', outcome: 'removed' },
      { account: 'b', outcome: 'absent' },
    ])
  })

  test('deleteSecretFromSlotsSync deletes each account', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['deleteMacOSSync']!.mockReturnValueOnce(
      'removed',
    ).mockReturnValueOnce('absent')
    const results = mod.deleteSecretFromSlotsSync({
      service: 's',
      accounts: ['a', 'b'],
    })
    expect(results).toEqual([
      { account: 'a', outcome: 'removed' },
      { account: 'b', outcome: 'absent' },
    ])
  })
})

describe.sequential('secrets/keychain — clearCache', () => {
  test('drops the in-process cache so subsequent reads hit the backend', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValueOnce('first').mockResolvedValueOnce(
      'second',
    )
    expect(await mod.readSecret({ service: 's', account: 'a' })).toBe('first')
    mod.clearCache()
    expect(await mod.readSecret({ service: 's', account: 'a' })).toBe('second')
    expect(macos['readMacOS']).toHaveBeenCalledTimes(2)
  })
})
