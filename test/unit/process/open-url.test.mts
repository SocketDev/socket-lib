/**
 * @file Unit tests for process/open-url. `pickOpenCommand` is pure, so its
 *   per-platform mapping is asserted directly. `openUrl` is driven with an
 *   injected spawner so the launch path is verified without opening a real
 *   browser: the test captures the command, args, and options the spawner
 *   receives and asserts nothing is actually spawned.
 */

import { describe, expect, it } from 'vitest'

import { openUrl, pickOpenCommand } from '../../../src/process/open-url'

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
