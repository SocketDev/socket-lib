/**
 * @file Deferred loading and callable defaults for the fetch adapter.
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { expect, test } from 'vitest'

test('loads npm utilities only when creating a fetcher', () => {
  const require = createRequire(import.meta.url)
  const bundle = require.resolve('../../../src/external/npm-pack.js')
  expect(Object.hasOwn(require.cache, bundle)).toBe(false)

  const adapter: unknown = require('../../../src/external/make-fetch-happen.js')
  expect(Object.hasOwn(require.cache, bundle)).toBe(false)
  assert.ok(adapter !== null && typeof adapter === 'object')
  assert.ok('defaults' in adapter && typeof adapter.defaults === 'function')

  const fetcher: unknown = adapter.defaults({ cache: 'force-cache' })
  expect(typeof fetcher).toBe('function')
  const loaded = require.cache[bundle]
  expect(loaded).toBeDefined()
  adapter.defaults({ cache: 'no-store' })
  expect(require.cache[bundle]).toBe(loaded)
})
