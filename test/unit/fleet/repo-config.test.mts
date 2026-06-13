/**
 * @file Unit tests for src/fleet/repo-config — readConfigLayers (the generic
 *   N-layer reader), mergeConfigArray (concat across any layers),
 *   resolveRepoConfig (the fleet fleet+repo wrapper) and mergeRepoConfigArray.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  mergeConfigArray,
  mergeRepoConfigArray,
  readConfigLayers,
  resolveRepoConfig,
} from '../../../src/fleet/repo-config'

import { runWithTempDir } from '../util/temp-file-helper'

async function writeLayer(
  root: string,
  dir: string,
  name: string,
  data: unknown,
  ext = '.json',
): Promise<void> {
  const full = path.join(root, dir)
  await fs.mkdir(full, { recursive: true })
  await fs.writeFile(
    path.join(full, `${name}${ext}`),
    JSON.stringify(data),
    'utf8',
  )
}

async function writeTier(
  root: string,
  tier: 'fleet' | 'repo',
  name: string,
  data: unknown,
): Promise<void> {
  const dir = path.join(root, '.config', tier)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, `${name}.json`),
    JSON.stringify(data),
    'utf8',
  )
}

describe('resolveRepoConfig', () => {
  it('reads both tiers when both files exist', async () => {
    await runWithTempDir(async root => {
      await writeTier(root, 'fleet', 'vitest', { nonIsolated: ['a'] })
      await writeTier(root, 'repo', 'vitest', { nonIsolated: ['b'] })

      const tiers = resolveRepoConfig<{ nonIsolated: string[] }>('vitest', {
        repoRoot: root,
      })
      expect(tiers.fleet).toEqual({ nonIsolated: ['a'] })
      expect(tiers.repo).toEqual({ nonIsolated: ['b'] })
    }, 'repo-config-both-')
  })

  it('returns undefined for a missing tier', async () => {
    await runWithTempDir(async root => {
      await writeTier(root, 'fleet', 'vitest', { nonIsolated: ['a'] })

      const tiers = resolveRepoConfig<{ nonIsolated: string[] }>('vitest', {
        repoRoot: root,
      })
      expect(tiers.fleet).toEqual({ nonIsolated: ['a'] })
      expect(tiers.repo).toBeUndefined()
    }, 'repo-config-missing-')
  })

  it('returns undefined for both tiers when neither file exists', async () => {
    await runWithTempDir(async root => {
      const tiers = resolveRepoConfig('absent', { repoRoot: root })
      expect(tiers.fleet).toBeUndefined()
      expect(tiers.repo).toBeUndefined()
    }, 'repo-config-none-')
  })

  it('treats an unparseable file as undefined (never throws)', async () => {
    await runWithTempDir(async root => {
      const dir = path.join(root, '.config', 'fleet')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'broken.json'), '{ not json', 'utf8')

      const tiers = resolveRepoConfig('broken', { repoRoot: root })
      expect(tiers.fleet).toBeUndefined()
    }, 'repo-config-broken-')
  })
})

describe('mergeRepoConfigArray', () => {
  it('concatenates fleet entries then repo entries', async () => {
    await runWithTempDir(async root => {
      await writeTier(root, 'fleet', 'vitest', { nonIsolated: ['a', 'b'] })
      await writeTier(root, 'repo', 'vitest', { nonIsolated: ['c'] })

      const tiers = resolveRepoConfig<{ nonIsolated: string[] }>('vitest', {
        repoRoot: root,
      })
      expect(mergeRepoConfigArray(tiers, 'nonIsolated')).toEqual([
        'a',
        'b',
        'c',
      ])
    }, 'repo-config-merge-')
  })

  it('returns [] when neither tier has the array', async () => {
    const tiers = { fleet: undefined, repo: undefined }
    expect(mergeRepoConfigArray(tiers, 'whatever' as never)).toEqual([])
  })

  it('ignores a non-array value for the key', async () => {
    const tiers = {
      fleet: { k: 'not-an-array' },
      repo: { k: ['x'] },
    }
    expect(mergeRepoConfigArray(tiers, 'k')).toEqual(['x'])
  })
})

describe('readConfigLayers', () => {
  it('reads N arbitrary layer dirs in precedence order', async () => {
    await runWithTempDir(async root => {
      await writeLayer(root, '.config/base', 'app', { v: 1 })
      await writeLayer(root, '.config/team', 'app', { v: 2 })
      await writeLayer(root, '.config/local', 'app', { v: 3 })

      const layers = readConfigLayers<{ v: number }>('app', {
        dirs: ['.config/base', '.config/team', '.config/local'],
        rootDir: root,
      })
      expect(layers).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])
    }, 'read-layers-order-')
  })

  it('skips absent layers, preserving order of present ones', async () => {
    await runWithTempDir(async root => {
      await writeLayer(root, '.config/base', 'app', { v: 1 })
      // no team layer
      await writeLayer(root, '.config/local', 'app', { v: 3 })

      const layers = readConfigLayers<{ v: number }>('app', {
        dirs: ['.config/base', '.config/team', '.config/local'],
        rootDir: root,
      })
      expect(layers).toEqual([{ v: 1 }, { v: 3 }])
    }, 'read-layers-gap-')
  })

  it('honors a custom extension', async () => {
    await runWithTempDir(async root => {
      await writeLayer(root, 'cfg', 'thing', { ok: true }, '.config.json')

      const layers = readConfigLayers<{ ok: boolean }>('thing', {
        dirs: ['cfg'],
        rootDir: root,
        ext: '.config.json',
      })
      expect(layers).toEqual([{ ok: true }])
    }, 'read-layers-ext-')
  })

  it('returns [] when no layer exists', async () => {
    await runWithTempDir(async root => {
      const layers = readConfigLayers('absent', {
        dirs: ['.config/base', '.config/local'],
        rootDir: root,
      })
      expect(layers).toEqual([])
    }, 'read-layers-none-')
  })
})

describe('mergeConfigArray', () => {
  it('concatenates an array key across N layers in order', () => {
    const layers = [{ k: ['a'] }, { k: ['b', 'c'] }, { k: ['d'] }]
    expect(mergeConfigArray(layers, 'k')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('skips undefined layers and non-array values', () => {
    const layers = [undefined, { k: 'nope' }, { k: ['x'] }] as Array<
      { k: unknown } | undefined
    >
    expect(mergeConfigArray(layers, 'k')).toEqual(['x'])
  })

  it('returns [] for an empty layer list', () => {
    expect(mergeConfigArray([], 'k' as never)).toEqual([])
  })
})
