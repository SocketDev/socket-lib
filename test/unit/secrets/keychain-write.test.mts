/**
 * @file Secrets/keychain — writeSecret / writeSecretSync (validation,
 *   unchanged-vs-written, label, platform routing). Shares the mock scaffolding
 *   in test/util/keychain-mocks.mts.
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

describe.sequential('secrets/keychain — writeSecret', () => {
  test('throws TypeError when value is empty', async () => {
    const { mod } = await loadFresh('darwin')
    await expect(
      mod.writeSecret({ service: 's', account: 'a', value: '' }),
    ).rejects.toThrow(/non-empty string/)
  })

  test('throws when platform is unsupported', async () => {
    const { mod } = await loadFresh('other')
    await expect(
      mod.writeSecret({ service: 's', account: 'a', value: 'v' }),
    ).rejects.toThrow(/Unsupported platform/)
  })

  test('returns "unchanged" when stored value matches', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValueOnce('same-value')
    expect(
      await mod.writeSecret({
        service: 's',
        account: 'a',
        value: 'same-value',
      }),
    ).toBe('unchanged')
    expect(macos['writeMacOS']).not.toHaveBeenCalled()
  })

  test('returns "written" and writes when value differs', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValueOnce('old')
    macos['writeMacOS']!.mockResolvedValueOnce(undefined)
    expect(
      await mod.writeSecret({ service: 's', account: 'a', value: 'new' }),
    ).toBe('written')
    expect(macos['writeMacOS']).toHaveBeenCalledWith(
      's',
      'a',
      'new',
      's credential',
    )
  })

  test('uses an explicit label when provided', async () => {
    const label = 'socket-lib-test:secrets/keychain:writeSecret-explicit-label'
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValueOnce(undefined)
    macos['writeMacOS']!.mockResolvedValueOnce(undefined)
    await mod.writeSecret({
      service: 's',
      account: 'a',
      value: 'v',
      label,
    })
    expect(macos['writeMacOS']).toHaveBeenCalledWith('s', 'a', 'v', label)
  })

  test('routes to writeLinux on linux', async () => {
    const { linux, mod } = await loadFresh('linux')
    linux['readLinux']!.mockResolvedValueOnce(undefined)
    linux['writeLinux']!.mockResolvedValueOnce(undefined)
    await mod.writeSecret({ service: 's', account: 'a', value: 'v' })
    expect(linux['writeLinux']).toHaveBeenCalled()
  })

  test('routes to writeWindows on win32', async () => {
    const { mod, windows } = await loadFresh('win32')
    windows['readWindows']!.mockResolvedValueOnce(undefined)
    windows['writeWindows']!.mockResolvedValueOnce(undefined)
    await mod.writeSecret({ service: 's', account: 'a', value: 'v' })
    expect(windows['writeWindows']).toHaveBeenCalled()
  })
})

describe.sequential('secrets/keychain — writeSecretSync', () => {
  test('throws TypeError when value is empty', async () => {
    const { mod } = await loadFresh('darwin')
    expect(() =>
      mod.writeSecretSync({ service: 's', account: 'a', value: '' }),
    ).toThrow(/non-empty string/)
  })

  test('throws on unsupported platforms', async () => {
    const { mod } = await loadFresh('other')
    expect(() =>
      mod.writeSecretSync({ service: 's', account: 'a', value: 'v' }),
    ).toThrow(/Unsupported platform/)
  })

  test('returns "unchanged" when current matches', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOSSync']!.mockReturnValueOnce('v')
    expect(
      mod.writeSecretSync({ service: 's', account: 'a', value: 'v' }),
    ).toBe('unchanged')
  })

  test('returns "written" and writes when current differs', async () => {
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOSSync']!.mockReturnValueOnce('old')
    expect(
      mod.writeSecretSync({ service: 's', account: 'a', value: 'new' }),
    ).toBe('written')
    expect(macos['writeMacOSSync']).toHaveBeenCalledWith(
      's',
      'a',
      'new',
      's credential',
    )
  })

  test('routes to writeLinuxSync on linux', async () => {
    const { linux, mod } = await loadFresh('linux')
    linux['readLinuxSync']!.mockReturnValueOnce(undefined)
    expect(
      mod.writeSecretSync({ service: 's', account: 'a', value: 'v' }),
    ).toBe('written')
    expect(linux['writeLinuxSync']).toHaveBeenCalled()
  })

  test('routes to writeWindowsSync on win32', async () => {
    const { mod, windows } = await loadFresh('win32')
    windows['readWindowsSync']!.mockReturnValueOnce(undefined)
    expect(
      mod.writeSecretSync({ service: 's', account: 'a', value: 'v' }),
    ).toBe('written')
    expect(windows['writeWindowsSync']).toHaveBeenCalled()
  })
})
