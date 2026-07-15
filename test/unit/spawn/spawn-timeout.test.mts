/**
 * @file Unit tests for platform-aware spawn-timeout scaling — `spawnTimeoutMs`,
 *   `getWin32SpawnTimeoutMultiplier`, `resolveSpawnTimeout` — and the
 *   `localTimeout` spawn-option wiring in child.ts. `process.platform` and
 *   `SOCKET_SPAWN_TIMEOUT_MULTIPLIER` are stubbed so both platform branches and
 *   the env override are covered without a real Windows host.
 */

import process from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

import { spawn, spawnSync } from '../../../src/process/spawn/child'
import {
  DEFAULT_WIN32_SPAWN_TIMEOUT_MULTIPLIER,
  getWin32SpawnTimeoutMultiplier,
  resolveSpawnTimeout,
  spawnTimeoutMs,
} from '../../../src/process/spawn/timeout'

const ORIGINAL_PLATFORM = process.platform

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM)
  delete process.env['SOCKET_SPAWN_TIMEOUT_MULTIPLIER']
})

describe('DEFAULT_WIN32_SPAWN_TIMEOUT_MULTIPLIER', () => {
  it('is 6', () => {
    expect(DEFAULT_WIN32_SPAWN_TIMEOUT_MULTIPLIER).toBe(6)
  })
})

describe('getWin32SpawnTimeoutMultiplier', () => {
  it('defaults to 6 when the env var is unset', () => {
    delete process.env['SOCKET_SPAWN_TIMEOUT_MULTIPLIER']
    expect(getWin32SpawnTimeoutMultiplier()).toBe(6)
  })

  it('reads a positive finite override', () => {
    process.env['SOCKET_SPAWN_TIMEOUT_MULTIPLIER'] = '3'
    expect(getWin32SpawnTimeoutMultiplier()).toBe(3)
  })

  it('falls back to the default for a non-numeric value', () => {
    process.env['SOCKET_SPAWN_TIMEOUT_MULTIPLIER'] = 'nope'
    expect(getWin32SpawnTimeoutMultiplier()).toBe(6)
  })

  it('falls back to the default for zero or negative', () => {
    process.env['SOCKET_SPAWN_TIMEOUT_MULTIPLIER'] = '0'
    expect(getWin32SpawnTimeoutMultiplier()).toBe(6)
    process.env['SOCKET_SPAWN_TIMEOUT_MULTIPLIER'] = '-4'
    expect(getWin32SpawnTimeoutMultiplier()).toBe(6)
  })
})

describe('spawnTimeoutMs', () => {
  it('returns the base value off Windows', () => {
    setPlatform('linux')
    expect(spawnTimeoutMs(5000)).toBe(5000)
  })

  it('scales by the default multiplier on win32', () => {
    setPlatform('win32')
    expect(spawnTimeoutMs(5000)).toBe(30_000)
  })

  it('honors the env override on win32', () => {
    setPlatform('win32')
    process.env['SOCKET_SPAWN_TIMEOUT_MULTIPLIER'] = '4'
    expect(spawnTimeoutMs(5000)).toBe(20_000)
  })
})

describe('resolveSpawnTimeout', () => {
  it('scales a localTimeout on win32', () => {
    setPlatform('win32')
    expect(resolveSpawnTimeout({ localTimeout: 5000 })).toBe(30_000)
  })

  it('leaves a localTimeout unscaled off Windows', () => {
    setPlatform('linux')
    expect(resolveSpawnTimeout({ localTimeout: 5000 })).toBe(5000)
  })

  it('passes a fixed timeout through unchanged', () => {
    setPlatform('win32')
    expect(resolveSpawnTimeout({ timeout: 5000 })).toBe(5000)
  })

  it('returns undefined when neither is set', () => {
    expect(resolveSpawnTimeout({})).toBeUndefined()
  })

  it('throws when both timeout and localTimeout are set', () => {
    expect(() =>
      resolveSpawnTimeout({ localTimeout: 5000, timeout: 1000 }),
    ).toThrow(/either `timeout`.*or `localTimeout`.*not both/)
  })
})

describe('localTimeout option wiring', () => {
  it('spawnSync accepts localTimeout and runs', () => {
    const result = spawnSync('echo', ['ok'], { localTimeout: 5000 })
    expect(result.status).toBe(0)
    expect(String(result.stdout)).toContain('ok')
  })

  it('spawnSync throws when both timeout and localTimeout are passed', () => {
    expect(() =>
      spawnSync('echo', ['x'], { localTimeout: 5000, timeout: 1000 }),
    ).toThrow(/not both/)
  })

  it('spawn (async) accepts localTimeout and resolves', async () => {
    const result = await spawn('echo', ['ok'], { localTimeout: 5000 })
    expect(String(result.stdout)).toContain('ok')
  })
})
