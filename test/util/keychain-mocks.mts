/**
 * @file Shared mock scaffolding for the secrets/keychain test suites. The
 *   keychain dispatcher routes to per-platform backends (macos / linux /
 *   windows) based on `os.platform()`; these helpers build the fully-mocked
 *   backend modules and load the dispatcher fresh for a chosen platform.
 *   `vi.mock` / `vi.hoisted` are hoisted per test file, so each suite keeps its
 *   own `vi.mock(import('.../macos'), macosMockFactory)` lines and the
 *   `mockPlatform` hoisted ref — only the bulky factory shapes + `loadFresh`
 *   live here. The `node:os` mock must put the mocked `platform` on BOTH the
 *   named and default export (keychain.ts uses `import os from 'node:os'`), and
 *   `loadFresh` calls `vi.resetModules()` before re-importing so each platform
 *   load is fresh.
 */

import { vi } from 'vitest'

import type * as KeychainModule from '../../src/secrets/keychain'

export type KeychainPlatform = 'darwin' | 'linux' | 'win32' | 'other'

export type MockedModule = Record<string, ReturnType<typeof vi.fn>>

export interface LoadedKeychain {
  linux: MockedModule
  macos: MockedModule
  mod: typeof KeychainModule
  windows: MockedModule
}

// Factory for the mocked macOS backend module.
export function macosMockFactory(): MockedModule {
  return {
    deleteMacOS: vi.fn(),
    deleteMacOSSync: vi.fn(),
    isMacOSBackendAvailable: vi.fn(),
    readMacOS: vi.fn(),
    readMacOSSync: vi.fn(),
    writeMacOS: vi.fn(),
    writeMacOSSync: vi.fn(),
  }
}

// Factory for the mocked Linux backend module.
export function linuxMockFactory(): MockedModule {
  return {
    deleteLinux: vi.fn(),
    deleteLinuxSync: vi.fn(),
    isLinuxBackendAvailable: vi.fn(),
    readLinux: vi.fn(),
    readLinuxSync: vi.fn(),
    writeLinux: vi.fn(),
    writeLinuxSync: vi.fn(),
  }
}

// Factory for the mocked Windows backend module.
export function windowsMockFactory(): MockedModule {
  return {
    deleteWindows: vi.fn(),
    deleteWindowsSync: vi.fn(),
    isWindowsBackendAvailable: vi.fn(),
    readWindows: vi.fn(),
    readWindowsSync: vi.fn(),
    writeWindows: vi.fn(),
    writeWindowsSync: vi.fn(),
  }
}

/**
 * Reset modules, set the mocked `os.platform()` return, then import the three
 * backend mocks + the keychain dispatcher fresh for that platform. The caller
 * passes its own hoisted `mockPlatform` (vi.hoisted is per-file).
 */
export async function loadFreshKeychain(
  mockPlatform: ReturnType<typeof vi.fn>,
  plat: KeychainPlatform = 'darwin',
): Promise<LoadedKeychain> {
  vi.resetModules()
  mockPlatform.mockReturnValue(plat)
  const macos = await import('../../src/secrets/macos')
  const linux = await import('../../src/secrets/linux')
  const windows = await import('../../src/secrets/windows')
  const mod = await import('../../src/secrets/keychain')
  return {
    linux: linux as unknown as MockedModule,
    macos: macos as unknown as MockedModule,
    mod,
    windows: windows as unknown as MockedModule,
  }
}
