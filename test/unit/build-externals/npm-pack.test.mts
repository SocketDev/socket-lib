/**
 * @file Independent loading and stable identities of npm utility exports.
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { expect, test } from 'vitest'

test('loads only requested npm utilities and retains their identities', () => {
  const require = createRequire(import.meta.url)
  const arborist = require.resolve('@npmcli/arborist/lib/arborist/index.js')
  const pacote = require.resolve('pacote/lib/index.js')
  expect(Object.hasOwn(require.cache, arborist)).toBe(false)
  expect(Object.hasOwn(require.cache, pacote)).toBe(false)

  const bundle: unknown = require('../../../src/external/npm-pack.js')
  assert.ok(bundle !== null && typeof bundle === 'object')
  expect(Object.hasOwn(require.cache, arborist)).toBe(false)
  expect(Object.hasOwn(require.cache, pacote)).toBe(false)
  expect(Object.keys(bundle)).toEqual([
    'Arborist',
    'cacache',
    'libnpmpack',
    'makeFetchHappen',
    'normalizePackageData',
    'npmPackageArg',
    'pacote',
    'semver',
    'validateNpmPackageName',
  ])

  assert.ok('validateNpmPackageName' in bundle)
  const validate = bundle.validateNpmPackageName
  assert.ok(typeof validate === 'function')
  expect(validate('@example/package')).toEqual({
    validForNewPackages: true,
    validForOldPackages: true,
  })
  expect(bundle.validateNpmPackageName).toBe(validate)
  expect(Object.hasOwn(require.cache, arborist)).toBe(false)
  expect(Object.hasOwn(require.cache, pacote)).toBe(false)

  assert.ok('npmPackageArg' in bundle)
  const parse = bundle.npmPackageArg
  assert.ok(typeof parse === 'function')
  expect(parse('@example/package@1.2.3')).toMatchObject({
    name: '@example/package',
    type: 'version',
    fetchSpec: '1.2.3',
  })
  expect(bundle.npmPackageArg).toBe(parse)
  expect(Object.hasOwn(require.cache, arborist)).toBe(false)
  expect(Object.hasOwn(require.cache, pacote)).toBe(false)

  const names = Object.keys(bundle)
  for (let index = 0, { length } = names; index < length; index += 1) {
    const name = names[index]!
    const descriptor = Object.getOwnPropertyDescriptor(bundle, name)
    assert.ok(descriptor)
    const value = Reflect.get(bundle, name)
    expect(value).toBeDefined()
    expect(Reflect.get(bundle, name)).toBe(value)
    expect(Object.getOwnPropertyDescriptor(bundle, name)).toMatchObject({
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    })
  }
  expect(Object.hasOwn(require.cache, arborist)).toBe(true)
  expect(Object.hasOwn(require.cache, pacote)).toBe(true)
})
