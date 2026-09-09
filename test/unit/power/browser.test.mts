import { afterEach, describe, expect, test, vi } from 'vitest'

import { getPowerSnapshot, getPowerState } from '../../../src/power/browser.mjs'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('browser power', () => {
  test.each([
    [true, 1, 'ac', 100],
    [false, 0.04, 'battery', 4],
    [false, 0, 'battery', 0],
    [false, 0.375, 'battery', 38],
    [undefined, 0.5, 'unknown', 50],
    [false, -1, 'battery', undefined],
    [true, 2, 'ac', undefined],
    [true, Number.NaN, 'ac', undefined],
    [true, Number.POSITIVE_INFINITY, 'ac', undefined],
    ['false', '0.5', 'unknown', undefined],
  ])(
    'reads charging=%s and level=%s',
    async (charging, level, state, batteryPercent) => {
      vi.stubGlobal('navigator', {
        getBattery: async () => ({ charging, level }),
      })
      expect(await getPowerSnapshot()).toEqual({ state, batteryPercent })
      expect(await getPowerState()).toBe(state)
    },
  )

  test.each([undefined, {}, { getBattery: true }])(
    'handles unsupported navigator %s',
    async navigator => {
      vi.stubGlobal('navigator', navigator)
      expect(await getPowerSnapshot()).toEqual({
        state: 'unknown',
        batteryPercent: undefined,
      })
    },
  )

  test.each([undefined, false, 'battery', {}])(
    'handles invalid manager %s',
    async battery => {
      vi.stubGlobal('navigator', { getBattery: async () => battery })
      expect(await getPowerState()).toBe('unknown')
    },
  )

  test('preserves the navigator receiver and rereads changing state', async () => {
    const battery = { charging: false, level: 0.04 }
    const navigator = {
      async getBattery() {
        expect(this).toBe(navigator)
        return battery
      },
    }
    vi.stubGlobal('navigator', navigator)
    expect(await getPowerState()).toBe('battery')
    battery.charging = true
    battery.level = 0.05
    expect(await getPowerSnapshot()).toEqual({ state: 'ac', batteryPercent: 5 })
  })

  test('handles rejected access', async () => {
    vi.stubGlobal('navigator', {
      getBattery: async () => {
        throw new Error('access denied')
      },
    })
    expect(await getPowerState()).toBe('unknown')
  })

  test('bounds a pending request and consumes its late rejection', async () => {
    vi.useFakeTimers()
    const pending = Promise.withResolvers<unknown>()
    vi.stubGlobal('navigator', { getBattery: () => pending.promise })
    const result = getPowerSnapshot()
    await vi.advanceTimersByTimeAsync(2000)
    expect(await result).toEqual({
      state: 'unknown',
      batteryPercent: undefined,
    })
    pending.reject(new Error('late rejection'))
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
