import { SEC } from '../constants/units.mjs'

export type PowerState = 'ac' | 'battery' | 'unknown'

export type PowerSnapshot = {
  state: PowerState
  batteryPercent: number | undefined
}

export const POWER_PROBE_TIMEOUT_MS = 2 * SEC
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
