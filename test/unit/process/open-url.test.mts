/**
 * @file Unit tests for process/open-url. `pickOpenCommand` is pure, so its
 *   per-platform mapping is asserted directly. `openUrl` is driven with an
 *   injected spawner so the launch path is verified without opening a real
 *   browser: the test captures the command, args, and options the spawner
 *   receives and asserts nothing is actually spawned.
 */

import { describe, expect, it } from 'vitest'

import {
  BROWSER_BINARY_ENV_VAR,
  buildOpenUrlInvocation,
  NEW_WINDOW_BROWSERS,
  openUrl,
  pickOpenCommand,
  resolveNewWindowBrowser,
} from '../../../src/process/open-url'

import type { OpenUrlSpawnOptions } from '../../../src/process/open-url'

interface Launch {
  command: string
  args: readonly string[]
  options: OpenUrlSpawnOptions
}

function recordingSpawner(sink: Launch[]) {
  return (
    command: string,
    args: readonly string[],
    options: OpenUrlSpawnOptions,
  ): void => {
    sink.push({ command, args, options })
  }
}

describe('pickOpenCommand', () => {
  it('maps darwin to open', () => {
    expect(pickOpenCommand('darwin')).toBe('open')
  })

  it('maps win32 to start', () => {
    expect(pickOpenCommand('win32')).toBe('start')
  })

  it('maps other platforms to xdg-open', () => {
    expect(pickOpenCommand('linux')).toBe('xdg-open')
    expect(pickOpenCommand('freebsd')).toBe('xdg-open')
  })
})

describe('openUrl', () => {
  const URL = 'https://example.com/auth/cli/abc123'

  it('launches the darwin opener with the url and no real browser', () => {
    const launches: Launch[] = []
    openUrl(URL, { platform: 'darwin', spawn: recordingSpawner(launches) })
    expect(launches).toHaveLength(1)
    expect(launches[0]!.command).toBe('open')
    expect(launches[0]!.args).toStrictEqual([URL])
  })

  it('passes the url as the sole argument, never interpolated', () => {
    const launches: Launch[] = []
    openUrl(URL, { platform: 'linux', spawn: recordingSpawner(launches) })
    expect(launches[0]!.command).toBe('xdg-open')
    expect(launches[0]!.args).toStrictEqual([URL])
  })

  it('spawns detached with stdio ignored so the opener outlives the process', () => {
    const launches: Launch[] = []
    openUrl(URL, { platform: 'darwin', spawn: recordingSpawner(launches) })
    expect(launches[0]!.options.detached).toBe(true)
    expect(launches[0]!.options.stdio).toBe('ignore')
    expect(launches[0]!.options.shell).toBe(false)
  })

  it('uses a shell only on win32 where start is a cmd.exe builtin', () => {
    const launches: Launch[] = []
    openUrl(URL, { platform: 'win32', spawn: recordingSpawner(launches) })
    expect(launches[0]!.command).toBe('start')
    expect(launches[0]!.options.shell).toBe(true)
  })
})

// Nothing exists unless a test says so, so a developer's installed Chrome can
// never decide the outcome here.
function nothingExists(): boolean {
  return false
}

function onlyThese(present: readonly string[]) {
  return function exists(filePath: string): boolean {
    return present.includes(filePath)
  }
}

describe('resolveNewWindowBrowser', () => {
  it('picks the first present candidate in table order', () => {
    const candidates = NEW_WINDOW_BROWSERS['darwin']!
    expect(
      resolveNewWindowBrowser({
        env: {},
        exists: onlyThese([candidates[1]!, candidates[2]!]),
        platform: 'darwin',
      }),
    ).toBe(candidates[1])
  })

  it('lets the env override win over the table', () => {
    const override = '/opt/unusual/chrome'
    expect(
      resolveNewWindowBrowser({
        env: { [BROWSER_BINARY_ENV_VAR]: override },
        exists: onlyThese([override, NEW_WINDOW_BROWSERS['darwin']![0]!]),
        platform: 'darwin',
      }),
    ).toBe(override)
  })

  it('resolves an absent override to nothing rather than to another browser', () => {
    // Naming a missing binary is a mistake worth surfacing as the plain
    // opener, not as a silent substitution of a browser nobody asked for.
    expect(
      resolveNewWindowBrowser({
        env: { [BROWSER_BINARY_ENV_VAR]: '/nope/missing' },
        exists: onlyThese([NEW_WINDOW_BROWSERS['darwin']![0]!]),
        platform: 'darwin',
      }),
    ).toBeUndefined()
  })

  it('has no candidates on an unknown platform', () => {
    expect(
      resolveNewWindowBrowser({ env: {}, exists: () => true, platform: 'aix' }),
    ).toBeUndefined()
  })
})

describe('buildOpenUrlInvocation', () => {
  const URL = 'https://example.com/auth/cli/abc123'

  it('stays on the platform opener when no new window is asked for', () => {
    // The default is unchanged, so every existing caller keeps its behavior.
    const invocation = buildOpenUrlInvocation(URL, {
      env: {},
      exists: () => true,
      platform: 'darwin',
    })
    expect(invocation).toStrictEqual({
      args: [URL],
      command: 'open',
      newWindow: false,
    })
  })

  it('asks the browser binary for a new window when one is present', () => {
    const chrome = NEW_WINDOW_BROWSERS['darwin']![0]!
    expect(
      buildOpenUrlInvocation(URL, {
        env: {},
        exists: onlyThese([chrome]),
        newWindow: true,
        platform: 'darwin',
      }),
    ).toStrictEqual({
      args: ['--new-window', URL],
      command: chrome,
      newWindow: true,
    })
  })

  it('falls back to the platform opener when no browser is found', () => {
    // A machine this does not recognize still opens the URL, as a tab.
    expect(
      buildOpenUrlInvocation(URL, {
        env: {},
        exists: nothingExists,
        newWindow: true,
        platform: 'linux',
      }),
    ).toStrictEqual({ args: [URL], command: 'xdg-open', newWindow: false })
  })
})

describe('openUrl with newWindow', () => {
  it('spawns the browser binary with --new-window and no shell', () => {
    const chrome = NEW_WINDOW_BROWSERS['win32']![0]!
    const launches: Launch[] = []
    openUrl(URL, {
      env: {},
      exists: onlyThese([chrome]),
      newWindow: true,
      platform: 'win32',
      spawn: recordingSpawner(launches),
    })
    expect(launches[0]!.command).toBe(chrome)
    expect(launches[0]!.args).toStrictEqual(['--new-window', URL])
    // Even on win32: only the platform opener needs cmd.exe, and skipping it
    // keeps the URL clear of its quoting rules.
    expect(launches[0]!.options.shell).toBe(false)
  })

  it('still uses the win32 shell on the fallback lane', () => {
    const launches: Launch[] = []
    openUrl(URL, {
      env: {},
      exists: nothingExists,
      newWindow: true,
      platform: 'win32',
      spawn: recordingSpawner(launches),
    })
    expect(launches[0]!.command).toBe('start')
    expect(launches[0]!.options.shell).toBe(true)
  })
})
