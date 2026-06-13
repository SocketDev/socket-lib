/**
 * @file Unit tests for src/fleet/repo-config — resolveRepoConfig (read the
 *   fleet + repo tiers of a `.config` entry) and mergeRepoConfigArray (the
 *   common concat merge).
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  mergeRepoConfigArray,
  resolveRepoConfig,
} from '../../../src/fleet/repo-config'

import { runWithTempDir } from '../util/temp-file-helper'

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
