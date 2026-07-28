/**
 * @file Tests for config/layers — the layered config reader and the array
 *   merge.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  mergeConfigArray,
  readConfigLayers,
} from '../../../src/config/layers.ts'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

const tmpDirs: string[] = []

afterAll(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir, { force: true })
  }
})

/**
 * A root holding `<dir>/<file>` for each entry, so a test can lay out exactly
 * the layers it cares about. A `undefined` body writes no file at all, which is
 * how the "layer is absent" cases are expressed.
 */
function makeLayerRoot(
  files: Record<string, string | undefined>,
  fileName = 'demo.json',
): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'config-layers-'))
  tmpDirs.push(root)
  for (const [dir, body] of Object.entries(files)) {
    if (body === undefined) {
      continue
    }
    mkdirSync(path.join(root, dir), { recursive: true })
    writeFileSync(path.join(root, dir, fileName), body)
  }
  return root
}

describe('mergeConfigArray', () => {
  it('concatenates the key across layers in precedence order', () => {
    const layers = [{ exclude: ['a'] }, { exclude: ['b', 'c'] }]
    expect(mergeConfigArray(layers, 'exclude')).toEqual(['a', 'b', 'c'])
  })

  it('skips undefined layers and layers missing the key', () => {
    const layers = [{ exclude: ['a'] }, undefined, {}, { exclude: ['d'] }]
    expect(mergeConfigArray(layers, 'exclude')).toEqual(['a', 'd'])
  })

  it('ignores a non-array value for the key', () => {
    // A layer that sets the key to a scalar contributes nothing rather than
    // throwing — config reads are best-effort throughout this module.
    const layers = [{ exclude: 'not-an-array' }, { exclude: ['kept'] }]
    expect(mergeConfigArray(layers, 'exclude')).toEqual(['kept'])
  })

  it('returns an empty array when no layer carries it', () => {
    expect(mergeConfigArray([], 'exclude')).toEqual([])
    expect(mergeConfigArray([{ other: [1] }], 'exclude')).toEqual([])
  })

  it('preserves duplicates — merging is concat, not union', () => {
    const layers = [{ exclude: ['dup'] }, { exclude: ['dup'] }]
    expect(mergeConfigArray(layers, 'exclude')).toEqual(['dup', 'dup'])
  })
})

describe('readConfigLayers', () => {
  it('returns each existing layer in dirs order, lowest precedence first', () => {
    const root = makeLayerRoot({
      base: '{"value":1}',
      local: '{"value":3}',
      team: '{"value":2}',
    })
    const layers = readConfigLayers<{ value: number }>('demo', {
      dirs: ['base', 'team', 'local'],
      rootDir: root,
    })
    expect(layers.map(l => l.value)).toEqual([1, 2, 3])
  })

  it('skips a layer whose file does not exist', () => {
    const root = makeLayerRoot({ base: '{"value":1}', local: undefined })
    const layers = readConfigLayers<{ value: number }>('demo', {
      dirs: ['base', 'local'],
      rootDir: root,
    })
    expect(layers).toEqual([{ value: 1 }])
  })

  it('skips unparseable JSON instead of throwing', () => {
    // Best-effort by contract: a malformed layer must not take down a caller
    // that only wanted the layers it could read.
    const root = makeLayerRoot({ base: '{"value":1}', broken: '{ not json' })
    const layers = readConfigLayers<{ value: number }>('demo', {
      dirs: ['broken', 'base'],
      rootDir: root,
    })
    expect(layers).toEqual([{ value: 1 }])
  })

  it('returns an empty array when no layer exists', () => {
    const root = makeLayerRoot({})
    expect(
      readConfigLayers('demo', { dirs: ['absent'], rootDir: root }),
    ).toEqual([])
  })

  it('honors a custom extension', () => {
    const root = makeLayerRoot({ base: '{"value":7}' }, 'demo.config.json')
    const layers = readConfigLayers<{ value: number }>('demo', {
      dirs: ['base'],
      ext: '.config.json',
      rootDir: root,
    })
    expect(layers).toEqual([{ value: 7 }])
  })

  it('reads a nested layer dir', () => {
    const root = makeLayerRoot({ '.config/repo': '{"value":9}' })
    const layers = readConfigLayers<{ value: number }>('demo', {
      dirs: ['.config/repo'],
      rootDir: root,
    })
    expect(layers).toEqual([{ value: 9 }])
  })

  it('resolves layer dirs against rootDir, not the process cwd', () => {
    // rootDir short-circuits git-root discovery, so the same relative dir name
    // reads a different file per root.
    const a = makeLayerRoot({ base: '{"value":"a"}' })
    const b = makeLayerRoot({ base: '{"value":"b"}' })
    expect(
      readConfigLayers<{ value: string }>('demo', {
        dirs: ['base'],
        rootDir: a,
      }),
    ).toEqual([{ value: 'a' }])
    expect(
      readConfigLayers<{ value: string }>('demo', {
        dirs: ['base'],
        rootDir: b,
      }),
    ).toEqual([{ value: 'b' }])
  })

  it('falls back to cwd-derived discovery when rootDir is omitted', () => {
    // No rootDir: the reader discovers a root from `cwd`. The temp dir is not a
    // git repo, so discovery yields the dir itself and the layer still reads.
    const root = makeLayerRoot({ base: '{"value":42}' })
    const layers = readConfigLayers<{ value: number }>('demo', {
      cwd: root,
      dirs: ['base'],
    })
    expect(layers).toEqual([{ value: 42 }])
  })
})
