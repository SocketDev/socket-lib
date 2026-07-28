/**
 * @file Tests for the Windows-only arms of native-messaging/install.
 *
 * `registerWindows` shells out to reg.exe and `installNativeHost` branches on
 * WIN32 to pick the .cmd wrapper — neither runs on the CI/dev platforms this
 * suite executes on. The platform constant and the spawn boundary are mocked so
 * the arms are exercised and their arguments asserted, which is the part that
 * matters: the registry key shape and the absence of a shell on POSIX.
 */

import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

const { mockSpawnSync } = vi.hoisted(() => ({ mockSpawnSync: vi.fn() }))

vi.mock(
  import('@socketsecurity/lib-stable/process/spawn/child'),
  async importOriginal => ({
    ...(await importOriginal()),
    spawnSync: mockSpawnSync,
  }),
)

vi.mock(import('../../../src/constants/platform'), async importOriginal => ({
  ...(await importOriginal()),
  DARWIN: false,
  WIN32: true,
}))

const { HOST_NAME, installNativeHost, registerWindows } = await import(
  '../../../src/native-messaging/install'
)
const { withEnvSync } = await import('../../../src/env/rewire')

const tmpDirs: string[] = []

afterAll(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir, { force: true })
  }
})

function tmpDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  tmpDirs.push(dir)
  return dir
}

beforeEach(() => {
  mockSpawnSync.mockReset()
  mockSpawnSync.mockReturnValue({ status: 0, stderr: '', stdout: '' })
})

describe('registerWindows', () => {
  it('adds the native-host key under HKCU with the manifest as its value', () => {
    registerWindows('C:\\hosts\\manifest.json')
    expect(mockSpawnSync).toHaveBeenCalledTimes(1)
    const [cmd, args] = mockSpawnSync.mock.calls[0]!
    expect(cmd).toBe('reg')
    expect(args[0]).toBe('add')
    expect(args[1]).toBe(
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    )
    // /ve writes the default value; /f overwrites without prompting.
    expect(args).toContain('/ve')
    expect(args).toContain('/f')
    expect(args).toContain('C:\\hosts\\manifest.json')
  })

  it('passes the manifest path as an argv entry, never through a shell string', () => {
    // Array-arg spawn is what keeps a path with spaces or metacharacters from
    // becoming an injection surface.
    const hostile = 'C:\\Program Files\\x & y\\manifest.json'
    registerWindows(hostile)
    const [, args] = mockSpawnSync.mock.calls[0]!
    expect(args).toContain(hostile)
    expect(args.join(' ')).not.toContain('&&')
  })

  it('writes the value as REG_SZ', () => {
    registerWindows('C:\\hosts\\manifest.json')
    const [, args] = mockSpawnSync.mock.calls[0]!
    expect(args[args.indexOf('/t') + 1]).toBe('REG_SZ')
  })
})

describe('installNativeHost on Windows', () => {
  it('writes a .cmd wrapper and registers the manifest', () => {
    const home = tmpDir('nm-win-home-')
    const wrapperDir = tmpDir('nm-win-wrap-')
    const result = withEnvSync(
      {
        APPDATA: path.join(home, 'AppData', 'Roaming'),
        HOME: home,
        USERPROFILE: home,
      },
      () =>
        installNativeHost({
          allowedOrigins: ['chrome-extension://abc/'],
          wrapperDir,
        }),
    )
    // The Windows arm picks the .cmd wrapper and a batch body.
    expect(result.wrapperPath.endsWith('.cmd')).toBe(true)
    expect(readFileSync(result.wrapperPath, 'utf8')).toContain('@echo off')
    // ...then registers the first manifest it wrote.
    expect(mockSpawnSync).toHaveBeenCalledTimes(1)
    const [cmd, args] = mockSpawnSync.mock.calls[0]!
    expect(cmd).toBe('reg')
    expect(args).toContain(result.manifestPaths[0])
  })

  it('resolves the manifest directory under APPDATA', () => {
    const home = tmpDir('nm-win-appdata-')
    const appData = path.join(home, 'AppData', 'Roaming')
    const result = withEnvSync(
      { APPDATA: appData, HOME: home, USERPROFILE: home },
      () =>
        installNativeHost({
          allowedOrigins: ['*'],
          wrapperDir: tmpDir('nm-win-wrap2-'),
        }),
    )
    expect(result.manifestPaths.length).toBe(1)
    expect(result.manifestPaths[0]!.startsWith(appData)).toBe(true)
  })
})
