/**
 * @file Unit tests for the `vlt-lock.json` parser. Shapes follow vltpkg's own
 *   lockfile README: nodes are tuples keyed by a tilde-joined DepID.
 */

import { describe, expect, test } from 'vitest'

import {
  jsParseVltLock,
  parseVltDepId,
  splitNameVersion,
} from '../../src/eco/npm/vlt/lockfile/parse.mts'

const LOCK = JSON.stringify({
  lockfileVersion: 1,
  options: {},
  nodes: {
    'registry~~lodash@4.17.21': [
      0,
      undefined,
      'sha512-lodash==',
      'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
    ],
    'registry~~@scope/pkg@1.2.3': [2, undefined, 'sha512-scoped==', undefined],
    'registry~~opt@1.0.0': [1, 'opt', undefined, undefined],
    'git~github:a/b~main': [0, 'b', undefined, undefined],
  },
  edges: {
    'file·. lodash': 'prod ^4.17.21 registry~~lodash@4.17.21',
  },
})

describe('parseVltDepId', () => {
  test.each([
    ['registry~~lodash@4.17.21', 'registry', '', 'lodash@4.17.21'],
    ['registry~vlt~y@latest', 'registry', 'vlt', 'y@latest'],
    ['git~github:a/b~main', 'git', 'github:a/b', 'main'],
  ])('splits %s', (id, type, scope, detail) => {
    expect(parseVltDepId(id)).toEqual({ type, scope, detail })
  })

  test('keeps a detail containing a tilde whole', () => {
    expect(parseVltDepId('git~github:a/b~feat~x')?.detail).toBe('feat~x')
  })

  test('returns undefined for a non-DepID', () => {
    expect(parseVltDepId('lodash')).toBeUndefined()
  })
})

describe('splitNameVersion', () => {
  test.each([
    ['lodash@4.17.21', 'lodash', '4.17.21'],
    ['@scope/pkg@1.2.3', '@scope/pkg', '1.2.3'],
  ])('splits %s on the last @', (input, name, version) => {
    expect(splitNameVersion(input)).toEqual({ name, version })
  })
})

describe('jsParseVltLock', () => {
  test('parses every node', () => {
    const result = jsParseVltLock(LOCK)
    expect(result.type).toBe('lockfile')
    expect(result.ecosystem).toBe('npm')
    expect(result.packages).toHaveLength(4)
  })

  test('recovers name and version from the DepID when the column is null', () => {
    const result = jsParseVltLock(LOCK)
    const lodash = result.packages.find(p => p.name === 'lodash')!
    expect(lodash.version).toBe('4.17.21')
    expect(lodash.integrity).toBe('sha512-lodash==')
    expect(lodash.resolved).toContain('lodash-4.17.21.tgz')
  })

  test('handles a scoped name, whose own @ must not split it', () => {
    const result = jsParseVltLock(LOCK)
    const scoped = result.packages.find(p => p.name === '@scope/pkg')!
    expect(scoped.version).toBe('1.2.3')
  })

  test('decodes the dev and optional flag bits', () => {
    const result = jsParseVltLock(LOCK)
    expect(result.packages.find(p => p.name === '@scope/pkg')!.isDev).toBe(true)
    expect(result.packages.find(p => p.name === 'opt')!.isOptional).toBe(true)
    expect(result.packages.find(p => p.name === 'lodash')!.isDev).toBe(false)
  })

  test('a git node carries vcsUrl and vcsCommit instead of a version', () => {
    const result = jsParseVltLock(LOCK)
    const git = result.packages.find(p => p.name === 'b')!
    expect(git.vcsUrl).toBe('github:a/b')
    expect(git.vcsCommit).toBe('main')
    expect(git.version).toBe('')
  })

  test('unparseable content yields an empty lockfile, not a throw', () => {
    const result = jsParseVltLock('{ nope')
    expect(result.packages).toHaveLength(0)
  })

  test('skips a node that is not a tuple', () => {
    const lock = JSON.stringify({
      lockfileVersion: 1,
      nodes: { 'registry~~lodash@4.17.21': { name: 'lodash' } },
    })
    expect(jsParseVltLock(lock).packages).toHaveLength(0)
  })

  test('skips a node whose name is in neither the column nor the id', () => {
    // A key that is not a DepID leaves nothing to recover the name from.
    const lock = JSON.stringify({
      lockfileVersion: 1,
      nodes: { 'not-a-dep-id': [0, undefined, undefined, undefined] },
    })
    expect(jsParseVltLock(lock).packages).toHaveLength(0)
  })

  test('defaults the lock version when the file omits it', () => {
    expect(jsParseVltLock(JSON.stringify({ nodes: {} })).lockVersion).toBe('1')
  })
})

describe("jsParseVltLock's name index", () => {
  function indexOf(lock: string): Record<string, number | number[]> {
    const result = jsParseVltLock(lock) as unknown as {
      _index: Record<string, number | number[]>
    }
    return result._index
  }

  test('points a single entry at its position', () => {
    const lock = JSON.stringify({
      nodes: {
        'registry~~lodash@4.17.21': [0, undefined, undefined, undefined],
      },
    })
    expect(indexOf(lock)['lodash']).toBe(0)
  })

  test('collects both positions when a name appears twice', () => {
    // Two versions of one package is the ordinary case, not an error.
    const lock = JSON.stringify({
      nodes: {
        'registry~~lodash@4.17.21': [0, undefined, undefined, undefined],
        'registry~~lodash@3.10.1': [0, undefined, undefined, undefined],
      },
    })
    expect(indexOf(lock)['lodash']).toEqual([0, 1])
  })

  test('keeps growing the list past the second duplicate', () => {
    const lock = JSON.stringify({
      nodes: {
        'registry~~lodash@4.17.21': [0, undefined, undefined, undefined],
        'registry~~lodash@3.10.1': [0, undefined, undefined, undefined],
        'registry~~lodash@2.4.2': [0, undefined, undefined, undefined],
      },
    })
    expect(indexOf(lock)['lodash']).toEqual([0, 1, 2])
  })
})
