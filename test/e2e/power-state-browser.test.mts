import path from 'node:path'
import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

import { tolerantTimeout } from '../_shared/fleet/lib/timing.mts'
import {
  bundleForWeb,
  bundleForWebWithEsbuild,
  fixtureDir,
} from './browser-bundling.mts'

describe('power state browser package resolution', () => {
  it.each([
    { name: 'webpack', bundle: bundleForWeb },
    { name: 'esbuild', bundle: bundleForWebWithEsbuild },
  ])(
    '$name imports the shipped helper without Node globals',
    async ({ name, bundle }) => {
      const result = await bundle({
        entry: path.join(fixtureDir, 'entry-power-state.mjs'),
        filename: `power-state-${name}.js`,
        library: 'powerStateBrowser',
      })
      expect(result.errors).toBeUndefined()
      const sandbox = {
        AbortController,
        clearTimeout,
        setTimeout,
      }
      const context = vm.createContext(sandbox)
      vm.runInContext(result.source, context)
      const observed: unknown = await vm.runInContext(
        'powerStateBrowser.run()',
        context,
      )
      expect(observed).toEqual({
        state: 'unknown',
        snapshot: { state: 'unknown', batteryPercent: undefined },
      })
      Object.assign(sandbox, {
        navigator: {
          getBattery: async () => ({ charging: false, level: 0.04 }),
        },
      })
      const battery: unknown = await vm.runInContext(
        'powerStateBrowser.run()',
        context,
      )
      expect(battery).toEqual({
        state: 'battery',
        snapshot: { state: 'battery', batteryPercent: 4 },
      })
    },
    tolerantTimeout(30_000),
  )
})
