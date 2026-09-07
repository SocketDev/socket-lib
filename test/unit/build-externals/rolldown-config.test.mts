import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'

import {
  createForceNodeModulesPlugin,
  createStubPlugin,
} from '../../../scripts/repo/build-externals/rolldown-config.mts'
import type { Plugin } from 'rolldown'

function resolveWithPlugin(
  plugin: Plugin,
  source: string,
  importer?: string | undefined,
): unknown {
  const resolve = plugin.resolveId
  assert.ok(typeof resolve === 'function')
  return Reflect.apply(resolve, {}, [source, importer])
}

describe('external bundle resolver records', () => {
  it('resolves installed packages without inherited result properties', () => {
    const result = resolveWithPlugin(
      createForceNodeModulesPlugin(),
      'cacache',
      '/example/entry.mjs',
    )
    expect(result).toMatchObject({
      external: false,
      id: expect.stringContaining('node_modules'),
    })
    expect(Object.getPrototypeOf(result)).toBeNull()
  })

  it('leaves nested dependency and unrelated package resolution alone', () => {
    const plugin = createForceNodeModulesPlugin()
    expect(
      resolveWithPlugin(
        plugin,
        'cacache',
        '/example/node_modules/package/index.mjs',
      ),
    ).toBeUndefined()
    expect(
      resolveWithPlugin(plugin, 'example-unmapped', '/example/entry.mjs'),
    ).toBeUndefined()
  })

  it('loads matched stub content through an isolated resolution record', () => {
    const plugin = createStubPlugin({ '^example-library$': 'empty.cjs' })
    const result = resolveWithPlugin(
      plugin,
      'example-library',
      '/example/entry.mjs',
    )
    assert.ok(typeof result === 'object' && result !== null && 'id' in result)
    expect(Object.getPrototypeOf(result)).toBeNull()
    const load = plugin.load
    assert.ok(typeof load === 'function')
    expect(Reflect.apply(load, {}, [result.id])).toEqual(expect.any(String))
    expect(Reflect.apply(load, {}, ['/example/unmatched.mjs'])).toBeUndefined()
  })

  it('applies importer restrictions before substituting a stub', () => {
    const plugin = createStubPlugin({
      '^example-library$': [/allowed/, 'empty.cjs'],
    })
    expect(
      resolveWithPlugin(plugin, 'example-library', '/example/blocked.mjs'),
    ).toBeUndefined()
    expect(resolveWithPlugin(plugin, 'example-library')).toBeUndefined()
    expect(
      resolveWithPlugin(plugin, 'example-library', '/example/allowed.mjs'),
    ).toHaveProperty('id')
  })
})
