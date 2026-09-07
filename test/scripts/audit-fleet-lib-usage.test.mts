/**
 * @file Specs for scripts/repo/audit-fleet-lib-usage — the fleet-usage scan
 *   that decides which public leaves the published build compiles out. Covers
 *   the two ways a leaf the fleet needs can wrongly read as unused: a consumer
 *   living in the gitignored fleet payload, and a primitive published ahead of
 *   its first consumer.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'
import { describe, expect, it } from 'vitest'

import {
  auditFleetLibUsage,
  FLEET_PAYLOAD_PATHSPECS,
  keptLeafEntries,
  keptLeaves,
  missingRosterRepos,
  redundantKeptLeaves,
  sourceFiles,
} from '../../scripts/repo/audit-fleet-lib-usage.mts'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

// A throwaway git repo that gitignores its fleet payload, the way every thin
// fleet member does.
function makeThinMemberFixture(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'audit-fleet-usage-'))
  spawnSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' })
  writeFileSync(path.join(dir, '.gitignore'), '/scripts/fleet/\n', 'utf8')
  writeFileSync(path.join(dir, 'tracked-consumer.mts'), 'export const a = 1\n')
  mkdirSync(path.join(dir, 'scripts', 'fleet'), { recursive: true })
  writeFileSync(
    path.join(dir, 'scripts', 'fleet', 'release-pipeline.mts'),
    "import { parseArgs } from '@socketsecurity/lib-stable/exe/argv/parse'\n",
  )
  return dir
}

describe('sourceFiles', () => {
  it('sees a consumer in the gitignored fleet payload', () => {
    const dir = makeThinMemberFixture()
    const files = sourceFiles(dir)
    expect(files).toContain('scripts/fleet/release-pipeline.mts')
  })

  it('still sees an ordinary unignored consumer', () => {
    const dir = makeThinMemberFixture()
    expect(sourceFiles(dir)).toContain('tracked-consumer.mts')
  })

  it('reports each file once', () => {
    const dir = makeThinMemberFixture()
    const files = sourceFiles(dir)
    expect(files.length).toBe(new Set(files).size)
  })

  it('names every fleet payload directory a thin member gitignores', () => {
    expect(FLEET_PAYLOAD_PATHSPECS).toContain('scripts/fleet/')
    expect(FLEET_PAYLOAD_PATHSPECS).toContain('.claude/hooks/fleet/')
  })
})

describe('keptLeaves', () => {
  const repoRoot = path.join(import.meta.dirname, '..', '..')

  it('holds the yaml editor out of the stub list', () => {
    expect(keptLeaves(repoRoot).has('yaml/edit')).toBe(true)
  })

  it('gives every kept leaf a reason naming what it waits for', () => {
    const entries = keptLeafEntries(repoRoot)
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.reason.length).toBeGreaterThan(20)
    }
  })

  it('returns nothing when the repo has no keep list', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'audit-no-keep-'))
    expect(keptLeafEntries(dir)).toEqual([])
    expect(keptLeaves(dir).size).toBe(0)
  })

  it('reports a kept leaf a real consumer now imports as redundant', () => {
    expect(redundantKeptLeaves(repoRoot, new Set(['yaml/edit']))).toEqual([
      'yaml/edit',
    ])
  })

  it('reports nothing redundant while no consumer imports a kept leaf', () => {
    expect(redundantKeptLeaves(repoRoot, new Set(['abort/signal']))).toEqual([])
  })
})

describe('fleet usage from a linked worktree', () => {
  it('scans primary siblings using the worktree roster and exports', () => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), 'fleet-linked-audit-'))
    const primary = path.join(fixture, 'projects', 'example-lib')
    const worktree = path.join(fixture, 'scratch', 'example-branch')
    const consumer = path.join(fixture, 'projects', 'example-consumer')

    function gitFixture(cwd: string, args: string[]): void {
      const result = spawnSync('git', args, { cwd, stdio: 'pipe' })
      expect(result.status).toBe(0)
    }

    try {
      mkdirSync(primary, { recursive: true })
      gitFixture(primary, ['init', '--quiet'])
      writeFileSync(path.join(primary, 'package.json'), '{}')
      gitFixture(primary, ['add', 'package.json'])
      gitFixture(primary, [
        '-c',
        'user.name=Example User',
        '-c',
        'user.email=example-user@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--quiet',
        '-m',
        'test: create audit fixture',
      ])
      gitFixture(primary, ['worktree', 'add', '--quiet', '--detach', worktree])
      mkdirSync(consumer, { recursive: true })
      gitFixture(consumer, ['init', '--quiet'])
      writeFileSync(
        path.join(consumer, 'consumer.mts'),
        "import { exampleValue } from '@socketsecurity/lib/example/used'",
      )
      const rosterDir = path.join(
        worktree,
        '.claude/skills/fleet/cascading-fleet/lib',
      )
      mkdirSync(rosterDir, { recursive: true })
      writeFileSync(
        path.join(rosterDir, 'fleet-repos.json'),
        JSON.stringify({
          repos: [{ name: 'example-consumer' }, { name: 'missing-consumer' }],
        }),
      )
      writeFileSync(
        path.join(worktree, 'package.json'),
        JSON.stringify({
          exports: {
            './example/used': './used.js',
            './example/unused': './unused.js',
          },
        }),
      )

      expect(missingRosterRepos(worktree)).toEqual(['missing-consumer'])
      const report = auditFleetLibUsage(worktree)
      expect(report.reposScanned).toEqual(['example-consumer'])
      expect(report.leaves['example/used']?.named).toEqual(['exampleValue'])
      expect(report.unusedLeaves).toEqual(['example/unused'])
    } finally {
      safeDeleteSync(fixture)
    }
  })
})
