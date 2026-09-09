/**
 * @file Host power-source detection with bounded native and operating-system
 *   probes. Missing or inconclusive evidence returns unknown.
 */

import { getNodeFsPromises } from '../node/fs/promises.mjs'
import { getNodePath } from '../node/path.mjs'
import { getNodeProcess } from '../node/process.mjs'

import { spawn } from '../process/spawn/child.mjs'

export type PowerState = 'ac' | 'battery' | 'unknown'

export type PowerSnapshot = {
  state: PowerState
  batteryPercent: number | undefined
}

export const POWER_PROBE_TIMEOUT_MS = 2000
export const POWER_SUPPLY_DIRECTORY = '/sys/class/power_supply'
export const POWER_SUPPLY_LIMIT = 64

export async function getLinuxPowerSnapshot(
  signal: AbortSignal,
): Promise<PowerSnapshot> {
  const fsPromises = getNodeFsPromises()
  const path = getNodePath()
  const entries = await fsPromises.readdir(POWER_SUPPLY_DIRECTORY)
  if (entries.length > POWER_SUPPLY_LIMIT) {
    return { state: 'unknown', batteryPercent: undefined }
  }
  let state: PowerState = 'unknown'
  const percentages: Array<number | undefined> = []
  let unreadable = false
  for (const entry of entries) {
    if (signal.aborted) {
      return { state: 'unknown', batteryPercent: undefined }
    }
    try {
      const contents = await fsPromises.readFile(
        path.join(POWER_SUPPLY_DIRECTORY, entry, 'uevent'),
        { encoding: 'utf8', signal },
      )
      const observed = parseLinuxPowerState(contents)
      if (
        observed === 'ac' ||
        (observed === 'battery' && state === 'unknown')
      ) {
        state = observed
      }
      const properties = parseLinuxPowerProperties(contents)
      if (
        properties.get('POWER_SUPPLY_TYPE') === 'Battery' &&
        properties.get('POWER_SUPPLY_SCOPE') !== 'Device'
      ) {
        percentages.push(
          parsePowerPercentage(properties.get('POWER_SUPPLY_CAPACITY')),
        )
      }
    } catch {
      unreadable = true
    }
  }
  return {
    state,
    batteryPercent:
      !unreadable && percentages.length === 1 ? percentages[0] : undefined,
  }
}

export async function getLinuxPowerState(
  signal: AbortSignal,
): Promise<PowerState> {
  return (await getLinuxPowerSnapshot(signal)).state
}

export async function getMacPowerState(
  signal: AbortSignal,
): Promise<PowerState> {
  const output = await readPowerStateCommand(
    '/usr/bin/pmset',
    ['-g', 'batt'],
    signal,
  )
  return parseMacPowerSnapshot(output).state
}

export async function getNativePowerState(): Promise<PowerState> {
  try {
    const nodeProcess = getNodeProcess()
    const native: unknown = nodeProcess.getBuiltinModule('node:smol-power')
    if (native === null || typeof native !== 'object') {
      return 'unknown'
    }
    const probe: unknown = Reflect.get(native, 'isOnAcPower')
    if (typeof probe !== 'function') {
      return 'unknown'
    }
    const online: unknown = await Reflect.apply(probe, native, [])
    return typeof online === 'boolean' ? (online ? 'ac' : 'battery') : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Raw charge is available only when a single host battery reports a valid
 * percentage.
 */
export async function getPowerSnapshot(): Promise<PowerSnapshot> {
  const unknown: PowerSnapshot = { state: 'unknown', batteryPercent: undefined }
  return await withPowerProbeDeadline(async signal => {
    const native = await getNativePowerState()
    if (signal.aborted) {
      return unknown
    }
    let snapshot = unknown
    try {
      const process = getNodeProcess()
      if (process.platform === 'linux') {
        snapshot = await getLinuxPowerSnapshot(signal)
      } else if (process.platform === 'darwin') {
        snapshot = parseMacPowerSnapshot(
          await readPowerStateCommand('/usr/bin/pmset', ['-g', 'batt'], signal),
        )
      } else if (process.platform === 'win32') {
        snapshot = parseWindowsPowerSnapshot(
          await readPowerStateCommand(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              '@{ online = @((Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -Filter "Active=True" -ErrorAction Stop).PowerOnline); percentages = @((Get-CimInstance -ClassName Win32_Battery -ErrorAction Stop).EstimatedChargeRemaining) } | ConvertTo-Json -Compress',
            ],
            signal,
          ),
        )
      }
    } catch {
      const unavailable = {
        __proto__: null,
        state: native,
        batteryPercent: undefined,
      }
      return unavailable
    }
    const result = {
      __proto__: null,
      ...snapshot,
      state: snapshot.state === 'unknown' ? native : snapshot.state,
    }
    return result
  }, unknown)
}

/**
 * Returns the detected source; unknown does not imply AC or battery power.
 */
export async function getPowerState(): Promise<PowerState> {
  return await withPowerProbeDeadline(async signal => {
    const native = await getNativePowerState()
    if (native !== 'unknown') {
      return native
    }
    if (signal.aborted) {
      return 'unknown'
    }
    const process = getNodeProcess()
    if (process.platform === 'darwin') {
      return await getMacPowerState(signal)
    }
    if (process.platform === 'linux') {
      return await getLinuxPowerState(signal)
    }
    if (process.platform === 'win32') {
      return await getWindowsPowerState(signal)
    }
    return 'unknown'
  }, 'unknown')
}

export async function getWindowsPowerState(
  signal: AbortSignal,
): Promise<PowerState> {
  const output = await readPowerStateCommand(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -Filter "Active=True" -ErrorAction Stop).PowerOnline',
    ],
    signal,
  )
  const values = output.split(/\r?\n/).map(value => value.trim().toLowerCase())
  if (!values.every(value => value === 'false' || value === 'true')) {
    return 'unknown'
  }
  return values.includes('true') ? 'ac' : 'battery'
}

export function parseLinuxPowerProperties(
  contents: string,
): Map<string, string> {
  return new Map(
    contents.split(/\r?\n/).map(line => {
      const equals = line.indexOf('=')
      return [line.slice(0, equals), line.slice(equals + 1).trim()]
    }),
  )
}

export function parseLinuxPowerState(contents: string): PowerState {
  const properties = parseLinuxPowerProperties(contents)
  if (properties.get('POWER_SUPPLY_SCOPE') === 'Device') {
    return 'unknown'
  }
  const type = properties.get('POWER_SUPPLY_TYPE')
  if (type === 'Battery') {
    const status = properties.get('POWER_SUPPLY_STATUS')
    if (status === 'Charging') {
      return 'ac'
    }
    if (status === 'Discharging') {
      return 'battery'
    }
  }
  if (
    type &&
    (type === 'Mains' ||
      type === 'USB' ||
      type.startsWith('USB_') ||
      type === 'Wireless') &&
    properties.get('POWER_SUPPLY_ONLINE') === '1'
  ) {
    return 'ac'
  }
  return 'unknown'
}

export function parseMacPowerSnapshot(output: string): PowerSnapshot {
  const firstLine = output.split(/\r?\n/, 1)[0]
  const state =
    firstLine === "Now drawing from 'AC Power'"
      ? 'ac'
      : firstLine === "Now drawing from 'Battery Power'"
        ? 'battery'
        : 'unknown'
  // Capture the complete signed percentage so invalid ranges or fractions cannot become valid suffixes.
  const percentages = output.match(/-?\d+(?:\.\d+)?%/g) ?? []
  return {
    state,
    batteryPercent:
      percentages.length === 1
        ? parsePowerPercentage(percentages[0]?.slice(0, -1))
        : undefined,
  }
}

export function parsePowerPercentage(value: unknown): number | undefined {
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) {
      return undefined
    }
    value = Number(value)
  }
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : undefined
}

export function parseWindowsPowerSnapshot(output: string): PowerSnapshot {
  const unknown: PowerSnapshot = { state: 'unknown', batteryPercent: undefined }
  let value: unknown
  try {
    value = JSON.parse(output)
  } catch {
    return unknown
  }
  if (!value || typeof value !== 'object') {
    return unknown
  }
  const online: unknown = Reflect.get(value, 'online')
  const percentages: unknown = Reflect.get(value, 'percentages')
  const state =
    Array.isArray(online) &&
    online.length > 0 &&
    online.every(item => typeof item === 'boolean')
      ? online.includes(true)
        ? 'ac'
        : 'battery'
      : 'unknown'
  return {
    state,
    batteryPercent:
      Array.isArray(percentages) && percentages.length === 1
        ? parsePowerPercentage(percentages[0])
        : undefined,
  }
}

export async function readPowerStateCommand(
  command: string,
  args: readonly string[],
  signal: AbortSignal,
): Promise<string> {
  const result = await spawn(command, args, {
    timeout: POWER_PROBE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    signal,
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
    stdioString: true,
  })
  return result.stdout.trim()
}

export async function withPowerProbeDeadline<T>(
  probe: (signal: AbortSignal) => Promise<T>,
  fallback: T,
): Promise<T> {
  const controller = new AbortController()
  return await new Promise<T>(resolve => {
    const timer = setTimeout(() => {
      controller.abort()
      resolve(fallback)
    }, POWER_PROBE_TIMEOUT_MS)
    function finishPowerProbe(value: T): void {
      clearTimeout(timer)
      resolve(value)
    }
    void probe(controller.signal).then(finishPowerProbe, () =>
      finishPowerProbe(fallback),
    )
  })
}
