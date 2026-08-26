/**
 * @file Tests for config/repo - the fleet-convention two-tier reader. The
 *   thing worth pinning down is that the tiers stay NAMED: a caller reads
 *   `repo` to know a repo overrode something, so a missing fleet layer must not
 *   let the repo layer slide into its place. Real directories throughout,
 *   because the layer lookup is a filesystem question.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import {
  FLEET_LAYER_DIRS,
  mergeRepoConfigArray,
  resolveRepoConfig,
} from '../../../src/config/repo.mjs'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

/**
 * A repo root holding `demo.json` in whichever of the two layer directories
 * the case supplies. An omitted key writes no file, which is how "that layer
 * is absent" is expressed.
 */
function repoRootWith(layers: {
  fleet?: string | undefined
  repo?: string | undefined
}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'config-repo-'))
  tmpDirs.push(root)
  for (const [tier, body] of Object.entries(layers)) {
    if (body === undefined) {
      continue
    }
    const dir = path.join(root, '.config', tier)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'demo.json'), body)
  }
  return root
}

interface DemoConfig extends Record<string, unknown> {
  exclude?: string[] | undefined
  name?: string | undefined
}

function resolve(root: string) {
  return resolveRepoConfig<DemoConfig>('demo', { repoRoot: root })
}

describe('FLEET_LAYER_DIRS', () => {
  it('lists the fleet default before the repo override', () => {
    expect([...FLEET_LAYER_DIRS]).toEqual(['.config/fleet', '.config/repo'])
  })
})

describe('resolveRepoConfig', () => {
  it('reads both tiers under their own names', () => {
    const root = repoRootWith({
      fleet: '{"name": "from-fleet"}',
      repo: '{"name": "from-repo"}',
    })
    expect(resolve(root)).toEqual({
      fleet: { name: 'from-fleet' },
      repo: { name: 'from-repo' },
    })
  })

  it('leaves the repo tier undefined when only the fleet layer exists', () => {
    // The tiers are read through separate single-directory calls precisely so
    // a lone layer cannot land in the wrong slot.
    const root = repoRootWith({ fleet: '{"name": "from-fleet"}' })
    expect(resolve(root)).toEqual({
      fleet: { name: 'from-fleet' },
      repo: undefined,
    })
  })

  it('leaves the fleet tier undefined when only the repo layer exists', () => {
    const root = repoRootWith({ repo: '{"name": "from-repo"}' })
    expect(resolve(root)).toEqual({
      fleet: undefined,
      repo: { name: 'from-repo' },
    })
  })

  it('reports both tiers undefined when neither file is present', () => {
    expect(resolve(repoRootWith({}))).toEqual({
      fleet: undefined,
      repo: undefined,
    })
  })

  it('treats an unparseable layer as absent rather than throwing', () => {
    // A half-written config should not take down every tool that reads it.
    const root = repoRootWith({ fleet: '{ not json', repo: '{"name": "ok"}' })
    expect(resolve(root)).toEqual({ fleet: undefined, repo: { name: 'ok' } })
  })

  it('resolves against cwd when no repoRoot is given', () => {
    const root = repoRootWith({ repo: '{"name": "from-cwd"}' })
    expect(resolveRepoConfig<DemoConfig>('demo', { cwd: root }).repo).toEqual({
      name: 'from-cwd',
    })
  })

  it('accepts no options at all', () => {
    expect(
      resolveRepoConfig<DemoConfig>('this-config-name-does-not-exist'),
    ).toEqual({ fleet: undefined, repo: undefined })
  })
})

describe('mergeRepoConfigArray', () => {
  it('puts fleet entries before repo entries', () => {
    const root = repoRootWith({
      fleet: '{"exclude": ["a", "b"]}',
      repo: '{"exclude": ["c"]}',
    })
    expect(mergeRepoConfigArray(resolve(root), 'exclude')).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('yields the surviving tier when the other is absent', () => {
    const root = repoRootWith({ repo: '{"exclude": ["c"]}' })
    expect(mergeRepoConfigArray(resolve(root), 'exclude')).toEqual(['c'])
  })

  it('yields an empty array when neither tier has the key', () => {
    const root = repoRootWith({ fleet: '{"name": "x"}' })
    expect(mergeRepoConfigArray(resolve(root), 'exclude')).toEqual([])
  })
})
