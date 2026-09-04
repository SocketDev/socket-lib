/**
 * @file Format detection and dispatch for the lockfiles that share the
 *   `"lockfileVersion"` key. bun.lock and vlt-lock.json both carry it, so
 *   sniffing must rule them out before falling through to npm.
 */

import { describe, expect, test } from 'vitest'

import {
  jsParseLockfile,
  sniffLockfileFormat,
} from '../../src/eco/manifest/parse-lockfile.mts'

const BUN = `{
  "lockfileVersion": 1,
  "configVersion": 0,
  "workspaces": { "": { "name": "x" } },
  "packages": {
    "lodash": ["lodash@4.18.1", "", {}, "sha512-abc=="],
  }
}`

const VLT = JSON.stringify({
  lockfileVersion: 1,
  options: {},
  nodes: {
    'registry~~lodash@4.17.21': [0, undefined, 'sha512-abc==', undefined],
  },
  edges: { 'file·. lodash': 'prod ^4.17.21 registry~~lodash@4.17.21' },
})

const NPM = JSON.stringify({
  name: 'x',
  lockfileVersion: 3,
  packages: {
    '': { name: 'x' },
    'node_modules/lodash': { version: '4.18.1' },
  },
})

describe('sniffLockfileFormat', () => {
  test('bun wins over npm on the shared lockfileVersion key', () => {
    expect(sniffLockfileFormat(BUN)).toBe('bun')
  })

  test('vlt wins over npm on the shared lockfileVersion key', () => {
    expect(sniffLockfileFormat(VLT)).toBe('vlt')
  })

  test('npm still sniffs as npm', () => {
    expect(sniffLockfileFormat(NPM)).toBe('npm')
  })

  test('yarn and pnpm are unaffected', () => {
    expect(sniffLockfileFormat('# yarn lockfile v1\n')).toBe('yarn')
    expect(sniffLockfileFormat('lockfileVersion: 9.0\n')).toBe('pnpm')
  })

  test('unknown content sniffs as undefined', () => {
    expect(sniffLockfileFormat('nothing here')).toBeUndefined()
  })
})

describe('jsParseLockfile dispatch', () => {
  test('routes bun content to the bun parser', () => {
    const result = jsParseLockfile(BUN, 'npm')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]!.name).toBe('lodash')
    expect(result.packages[0]!.version).toBe('4.18.1')
  })

  test('routes vlt content to the vlt parser', () => {
    const result = jsParseLockfile(VLT, 'npm')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]!.name).toBe('lodash')
    expect(result.packages[0]!.version).toBe('4.17.21')
  })

  test('an explicit format overrides the sniff', () => {
    expect(jsParseLockfile(BUN, 'npm', 'bun').packages).toHaveLength(1)
  })
})
