import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type * as nodeOs from 'node:os'

const { mockPlatform } = vi.hoisted(() => ({
  mockPlatform: vi.fn(() => 'darwin'),
}))

vi.mock(import('node:os'), async () => {
  const actual = await vi.importActual<typeof nodeOs>('node:os')
  return { ...actual, default: actual, platform: mockPlatform }
})

vi.mock(import('../../../src/secrets/macos'), () => ({
  deleteMacOS: vi.fn(),
  deleteMacOSSync: vi.fn(),
  isMacOSBackendAvailable: vi.fn(),
  readMacOS: vi.fn(),
  readMacOSSync: vi.fn(),
  writeMacOS: vi.fn(),
  writeMacOSSync: vi.fn(),
}))

vi.mock(import('../../../src/secrets/linux'), () => ({
  deleteLinux: vi.fn(),
  deleteLinuxSync: vi.fn(),
  isLinuxBackendAvailable: vi.fn(),
  readLinux: vi.fn(),
  readLinuxSync: vi.fn(),
  writeLinux: vi.fn(),
  writeLinuxSync: vi.fn(),
}))

vi.mock(import('../../../src/secrets/windows'), () => ({
  deleteWindows: vi.fn(),
  deleteWindowsSync: vi.fn(),
  isWindowsBackendAvailable: vi.fn(),
  readWindows: vi.fn(),
  readWindowsSync: vi.fn(),
  writeWindows: vi.fn(),
  writeWindowsSync: vi.fn(),
}))

async function loadFresh(
  plat: 'darwin' | 'linux' | 'win32' | 'other' = 'darwin',
) {
  mockPlatform.mockReturnValue(plat)
  const macos = await import('../../../src/secrets/macos')
  const linux = await import('../../../src/secrets/linux')
  const windows = await import('../../../src/secrets/windows')
  const mod = await import('../../../src/secrets/keychain')
  return {
    macos: macos as unknown as Record<string, ReturnType<typeof vi.fn>>,
    linux: linux as unknown as Record<string, ReturnType<typeof vi.fn>>,
    windows: windows as unknown as Record<string, ReturnType<typeof vi.fn>>,
    mod,
  }
}

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
    const { macos, mod } = await loadFresh('darwin')
    macos['readMacOS']!.mockResolvedValueOnce(undefined)
    macos['writeMacOS']!.mockResolvedValueOnce(undefined)
    await mod.writeSecret({
      service: 's',
      account: 'a',
      value: 'v',
      label: 'My Label',
    })
    expect(macos['writeMacOS']).toHaveBeenCalledWith('s', 'a', 'v', 'My Label')
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
