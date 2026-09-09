import path from 'node:path'
import { ChildProcess } from 'node:child_process'
import process from 'node:process'
import * as fsPromises from 'node:fs/promises'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { safeDelete } from '../../../src/fs/safe.mjs'
import type { SpawnResult } from '../../../src/process/spawn/types.mjs'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  getPowerSnapshot,
  getPowerState,
} from '../../../src/env/power-state.mjs'

const state = vi.hoisted(() => ({
  platform: 'darwin',
  native: undefined as unknown,
  nativeError: false,
  stdout: '',
  commandError: false,
  files: new Map<string, string>(),
  readError: false,
  directory: '',
  directories: [] as string[],
  entries: ['adapter', 'battery'],
}))
const command = vi.hoisted(() =>
  vi.fn((cmd: string, args: readonly string[] = []): SpawnResult<string> => {
    const child = new ChildProcess()
    const output: Awaited<SpawnResult<string>> = {
      cmd,
      args,
      code: 0,
      signal: child.signalCode,
      stdout: state.stdout,
      stderr: '',
    }
    const promise = state.commandError
      ? Promise.reject(new Error('probe unavailable'))
      : Promise.resolve(output)
    const handles: Pick<SpawnResult<string>, 'process' | 'stdin'> = {
      process: child,
      stdin: child.stdin,
    }
    return Object.assign(promise, handles)
  }),
)

vi.mock(import('../../../src/node/process.mjs'), () => {
  const mockProcess = { ...process }
  Object.defineProperty(mockProcess, 'platform', { get: () => state.platform })
  vi.spyOn(mockProcess, 'getBuiltinModule').mockImplementation(() => {
    if (state.nativeError) {
      throw new Error('native unavailable')
    }
    return typeof state.native === 'object' && state.native !== null
      ? state.native
      : undefined
  })
  return { getNodeProcess: () => mockProcess }
})
vi.mock(import('../../../src/node/fs/promises.mjs'), () => {
  const mockFs = { ...fsPromises }
  vi.spyOn(mockFs, 'readdir').mockImplementation(async (directory, options) => {
    state.directories.push(String(directory))
    if (state.readError) {
      throw new Error('sysfs unavailable')
    }
    for (const entry of state.entries) {
      writeFileSync(path.join(state.directory, entry), '')
    }
    return await fsPromises.readdir(state.directory, options)
  })
  vi.spyOn(mockFs, 'readFile').mockImplementation(async file => {
    const value = state.files.get(path.basename(path.dirname(String(file))))
    if (value === undefined) {
      throw new Error('supply unavailable')
    }
    return value
  })
  return { getNodeFsPromises: () => mockFs }
})
vi.mock(
  import('../../../src/process/spawn/child.mjs'),
  async importOriginal => {
    const actual = { ...(await importOriginal()) }
    vi.spyOn(actual, 'spawn').mockImplementation(command)
    return actual
  },
)

beforeEach(() => {
  state.platform = 'darwin'
  state.native = undefined
  state.nativeError = false
  state.stdout = ''
  state.commandError = false
  state.files.clear()
  state.readError = false
  state.directories = []
  state.directory = mkdtempSync(path.join(os.tmpdir(), 'power-state-'))
  state.entries = ['adapter', 'battery']
  command.mockClear()
})

afterEach(async () => {
  await safeDelete(state.directory)
})

describe('getPowerState', () => {
  test.each([true, false])(
    'uses native Boolean %s without spawning',
    async value => {
      state.native = { isOnAcPower: () => value }
      expect(await getPowerState()).toBe(value ? 'ac' : 'battery')
      expect(command).not.toHaveBeenCalled()
    },
  )

  test.each([
    undefined,
    {},
    { isOnAcPower: () => 'yes' },
    {
      isOnAcPower: () => {
        throw new Error('native failed')
      },
    },
  ])('falls back from unavailable native provider %j', async native => {
    state.native = native
    state.stdout = "Now drawing from 'AC Power'\n"
    expect(await getPowerState()).toBe('ac')
  })

  test('falls back when loading the native provider throws', async () => {
    state.nativeError = true
    state.stdout = "Now drawing from 'Battery Power'\n"
    expect(await getPowerState()).toBe('battery')
  })

  test.each([
    ["Now drawing from 'AC Power'\n", 'ac'],
    ["Now drawing from 'Battery Power'\n", 'battery'],
    ['', 'unknown'],
    ['Battery capacity: 85%', 'unknown'],
    ['unrecognized AC Power warning', 'unknown'],
  ])('parses macOS source %s', async (stdout, expected) => {
    state.stdout = stdout
    expect(await getPowerState()).toBe(expected)
    expect(command).toHaveBeenCalledWith(
      '/usr/bin/pmset',
      ['-g', 'batt'],
      expect.objectContaining({
        timeout: 2000,
        killSignal: 'SIGKILL',
        shell: false,
      }),
    )
  })

  test('returns unknown when a command fails or times out', async () => {
    state.commandError = true
    expect(await getPowerState()).toBe('unknown')
  })

  test.each([
    ['True\r\n', 'ac'],
    ['False\r\n', 'battery'],
    ['False\r\nTrue\r\n', 'ac'],
    ['', 'unknown'],
    ['False\ninvalid', 'unknown'],
    ['0', 'unknown'],
  ])('parses Windows PowerOnline %s', async (stdout, expected) => {
    state.platform = 'win32'
    state.stdout = stdout
    expect(await getPowerState()).toBe(expected)
    expect(command).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive']),
      expect.objectContaining({ timeout: 2000, shell: false }),
    )
  })

  test.each([
    ['POWER_SUPPLY_TYPE=Mains\nPOWER_SUPPLY_ONLINE=1', 'ac'],
    ['POWER_SUPPLY_TYPE=USB_PD\nPOWER_SUPPLY_ONLINE=1', 'ac'],
    ['POWER_SUPPLY_TYPE=Battery\nPOWER_SUPPLY_STATUS=Discharging', 'battery'],
    ['POWER_SUPPLY_TYPE=Battery\nPOWER_SUPPLY_STATUS=Charging', 'ac'],
    ['POWER_SUPPLY_TYPE=Battery\nPOWER_SUPPLY_STATUS=Full', 'unknown'],
    ['POWER_SUPPLY_TYPE=Mains\nPOWER_SUPPLY_ONLINE=0', 'unknown'],
    ['POWER_SUPPLY_TYPE=Mains\nPOWER_SUPPLY_ONLINE=invalid', 'unknown'],
    [
      'POWER_SUPPLY_TYPE=Battery\nPOWER_SUPPLY_SCOPE=Device\nPOWER_SUPPLY_STATUS=Discharging',
      'unknown',
    ],
    ['', 'unknown'],
  ])('classifies Linux supply evidence %s', async (contents, expected) => {
    state.platform = 'linux'
    state.files.set('adapter', contents)
    expect(await getPowerState()).toBe(expected)
    expect(command).not.toHaveBeenCalled()
  })

  test('connected adapter overrides battery discharge maintenance', async () => {
    state.platform = 'linux'
    state.files.set('adapter', 'POWER_SUPPLY_TYPE=Mains\nPOWER_SUPPLY_ONLINE=1')
    state.files.set(
      'battery',
      'POWER_SUPPLY_TYPE=Battery\nPOWER_SUPPLY_STATUS=Discharging',
    )
    state.entries.reverse()
    expect(await getPowerState()).toBe('ac')
  })

  test('missing sysfs returns unknown', async () => {
    state.platform = 'linux'
    state.readError = true
    expect(await getPowerState()).toBe('unknown')
  })

  test('empty inventory and oversized inventories return unknown', async () => {
    state.platform = 'linux'
    state.entries = []
    expect(await getPowerState()).toBe('unknown')
    state.entries = Array.from({ length: 65 }, (_, index) => `supply-${index}`)
    expect(await getPowerState()).toBe('unknown')
  })

  test('returns unknown at the deadline and stops after a late native result', async () => {
    vi.useFakeTimers()
    const pending = Promise.withResolvers<boolean>()
    try {
      state.native = { isOnAcPower: () => pending.promise }
      const result = getPowerState()
      await vi.advanceTimersByTimeAsync(2000)
      expect(await result).toBe('unknown')
      pending.resolve(false)
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(0)
      expect(command).not.toHaveBeenCalled()
    } finally {
      pending.resolve(false)
      vi.useRealTimers()
    }
  })

  test('native rejection falls back without an unhandled rejection', async () => {
    state.native = {
      isOnAcPower: () => Promise.reject(new Error('native rejected')),
    }
    state.stdout = "Now drawing from 'AC Power'"
    expect(await getPowerState()).toBe('ac')
  })

  test('unsupported platforms return unknown', async () => {
    state.platform = 'freebsd'
    expect(await getPowerState()).toBe('unknown')
    expect(command).not.toHaveBeenCalled()
  })
})

describe('getPowerSnapshot', () => {
  test.each([0, 4, 5, 100])('reports raw macOS charge %s', async percentage => {
    state.stdout = `Now drawing from 'Battery Power'\n -InternalBattery-0 ${percentage}%; discharging`
    expect(await getPowerSnapshot()).toEqual({
      state: 'battery',
      batteryPercent: percentage,
    })
  })

  test.each(['-1%', '101%', '4.5%', 'unknown%', '4%; 5%'])(
    'does not guess malformed or multiple charges %s',
    async charges => {
      state.stdout = `Now drawing from 'AC Power'\n${charges}`
      expect(await getPowerSnapshot()).toEqual({
        state: 'ac',
        batteryPercent: undefined,
      })
    },
  )

  test('observes unplugging and crossing the low-charge boundary without caching', async () => {
    state.stdout = "Now drawing from 'AC Power'\n5%"
    expect(await getPowerSnapshot()).toEqual({ state: 'ac', batteryPercent: 5 })
    state.stdout = "Now drawing from 'Battery Power'\n4%"
    expect(await getPowerSnapshot()).toEqual({
      state: 'battery',
      batteryPercent: 4,
    })
  })

  test('native source still permits an OS charge probe', async () => {
    state.native = { isOnAcPower: () => false }
    state.stdout = "Now drawing from 'Battery Power'\n4%"
    expect(await getPowerSnapshot()).toEqual({
      state: 'battery',
      batteryPercent: 4,
    })
    expect(command).toHaveBeenCalledTimes(1)
  })

  test.each([
    [true, 'Battery Power', 'battery'],
    [false, 'AC Power', 'ac'],
  ])(
    'uses the later OS source after native %s changes',
    async (native, source, expected) => {
      state.native = { isOnAcPower: () => native }
      state.stdout = `Now drawing from '${source}'\n4%`
      expect(await getPowerSnapshot()).toEqual({
        state: expected,
        batteryPercent: 4,
      })
    },
  )

  test('retains a known native source when the OS charge probe fails', async () => {
    state.native = { isOnAcPower: () => true }
    state.commandError = true
    expect(await getPowerSnapshot()).toEqual({
      state: 'ac',
      batteryPercent: undefined,
    })
  })

  test.each([0, 4, 5, 100])('reports raw Linux charge %s', async percentage => {
    state.platform = 'linux'
    state.entries = ['battery']
    state.files.set(
      'battery',
      `POWER_SUPPLY_TYPE=Battery\nPOWER_SUPPLY_STATUS=Discharging\nPOWER_SUPPLY_CAPACITY=${percentage}`,
    )
    expect(await getPowerSnapshot()).toEqual({
      state: 'battery',
      batteryPercent: percentage,
    })
  })

  test('does not aggregate multiple Linux batteries', async () => {
    state.platform = 'linux'
    const contents =
      'POWER_SUPPLY_TYPE=Battery\nPOWER_SUPPLY_STATUS=Discharging\nPOWER_SUPPLY_CAPACITY=4'
    state.files.set('adapter', contents)
    state.files.set('battery', contents)
    expect(await getPowerSnapshot()).toEqual({
      state: 'battery',
      batteryPercent: undefined,
    })
  })

  test('does not report peripheral battery charge', async () => {
    state.platform = 'linux'
    state.entries = ['battery']
    state.files.set(
      'battery',
      'POWER_SUPPLY_TYPE=Battery\nPOWER_SUPPLY_SCOPE=Device\nPOWER_SUPPLY_STATUS=Discharging\nPOWER_SUPPLY_CAPACITY=4',
    )
    expect(await getPowerSnapshot()).toEqual({
      state: 'unknown',
      batteryPercent: undefined,
    })
  })

  test.each([0, 4, 5, 100])(
    'reports raw Windows charge %s',
    async percentage => {
      state.platform = 'win32'
      state.stdout = JSON.stringify({
        online: [false],
        percentages: [percentage],
      })
      expect(await getPowerSnapshot()).toEqual({
        state: 'battery',
        batteryPercent: percentage,
      })
    },
  )

  test.each([
    '{"online":[true],"percentages":[-1]}',
    '{"online":[true],"percentages":[101]}',
    '{"online":[true],"percentages":[4,5]}',
    '{"online":[true],"percentages":[null]}',
    '{"online":[true],"percentages":[]}',
  ])('keeps Windows source with unknown charge %s', async stdout => {
    state.platform = 'win32'
    state.stdout = stdout
    expect(await getPowerSnapshot()).toEqual({
      state: 'ac',
      batteryPercent: undefined,
    })
  })

  test.each(['', 'invalid', 'null', '{}', '{"online":[],"percentages":[]}'])(
    'returns unknown for absent Windows metadata %s',
    async stdout => {
      state.platform = 'win32'
      state.stdout = stdout
      expect(await getPowerSnapshot()).toEqual({
        state: 'unknown',
        batteryPercent: undefined,
      })
    },
  )

  test('bounds the entire snapshot, including native detection', async () => {
    vi.useFakeTimers()
    const pending = Promise.withResolvers<boolean>()
    try {
      state.native = { isOnAcPower: () => pending.promise }
      const result = getPowerSnapshot()
      await vi.advanceTimersByTimeAsync(2000)
      expect(await result).toEqual({
        state: 'unknown',
        batteryPercent: undefined,
      })
      pending.resolve(false)
      await vi.advanceTimersByTimeAsync(0)
      expect(command).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      pending.resolve(false)
      vi.useRealTimers()
    }
  })
})
