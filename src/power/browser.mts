import { withPowerProbeDeadline } from './util.mjs'
import type { PowerSnapshot, PowerState } from './util.mjs'

export type { PowerSnapshot, PowerState } from './util.mjs'

export async function getPowerSnapshot(): Promise<PowerSnapshot> {
  return await withPowerProbeDeadline(
    async () => {
      const host: unknown = globalThis.navigator
      if (
        !host ||
        typeof host !== 'object' ||
        !('getBattery' in host) ||
        typeof host.getBattery !== 'function'
      ) {
        return {
          __proto__: null,
          state: 'unknown',
          batteryPercent: undefined,
        } as PowerSnapshot
      }
      const battery: unknown = await host.getBattery()
      if (!battery || typeof battery !== 'object') {
        return {
          __proto__: null,
          state: 'unknown',
          batteryPercent: undefined,
        } as PowerSnapshot
      }
      const charging = 'charging' in battery ? battery.charging : undefined
      const level = 'level' in battery ? battery.level : undefined
      return {
        __proto__: null,
        state:
          typeof charging === 'boolean'
            ? charging
              ? 'ac'
              : 'battery'
            : 'unknown',
        batteryPercent:
          typeof level === 'number' &&
          Number.isFinite(level) &&
          level >= 0 &&
          level <= 1
            ? Math.round(level * 100)
            : undefined,
      } as PowerSnapshot
    },
    {
      __proto__: null,
      state: 'unknown',
      batteryPercent: undefined,
    } as PowerSnapshot,
  )
}

export async function getPowerState(): Promise<PowerState> {
  return (await getPowerSnapshot()).state
}
