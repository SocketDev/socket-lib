/**
 * @file Unit tests for the ai/worktree surface the runOne and tryGit shards do
 *   not reach: the git read helpers, and spawnAiAgentsInWorktrees' option
 *   defaults, concurrency clamp, and per-item fan-out. Every spec runs against
 *   a real throwaway checkout under the OS temp dir.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

import {
  currentBranch,
  git,
  hasCommittedChanges,
  hasStagedOrUnstaged,
  spawnAiAgentsInWorktrees,
} from '../../../src/ai/worktree.mjs'
import { sh } from '../util/cross-platform-sh.mts'

let tmpRoot: string
let repo: string

function initRepo(dir: string): void {
  sh(dir, 'git init -b main -q')
  sh(dir, 'git config user.email "test@example.com"')
  sh(dir, 'git config user.name "Test"')
  sh(dir, 'git commit --allow-empty -q -m "initial"')
}

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-worktree-fanout-test-'))
  repo = path.join(tmpRoot, 'repo')
  mkdirSync(repo, { recursive: true })
  initRepo(repo)
})

afterEach(async () => {
  await safeDelete(tmpRoot)
})

describe.sequential('ai/worktree — git read helpers', () => {
  test('git returns trimmed stdout', () => {
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  test('git returns an empty string when the command writes nothing', () => {
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  test('currentBranch names the checked-out branch', () => {
    expect(currentBranch(repo)).toBe('main')
  })

  test('hasStagedOrUnstaged is false on a clean checkout', () => {
    expect(hasStagedOrUnstaged(repo)).toBe(false)
  })

  test('hasStagedOrUnstaged sees an untracked file', () => {
    writeFileSync(path.join(repo, 'scratch.txt'), 'scratch\n')
    expect(hasStagedOrUnstaged(repo)).toBe(true)
  })

  test('hasStagedOrUnstaged is false when the path is not a checkout', () => {
    // tryGit fails, and a failed probe must read as "nothing pending" rather
    // than throwing into the caller's fan-out.
    expect(hasStagedOrUnstaged(path.join(tmpRoot, 'not-a-repo'))).toBe(false)
  })

  test('hasCommittedChanges is false when HEAD matches the base', () => {
    expect(hasCommittedChanges(repo, 'main')).toBe(false)
  })

  test('hasCommittedChanges sees a commit ahead of the base', () => {
    sh(repo, 'git checkout -q -b feature')
    sh(repo, 'git commit --allow-empty -q -m "ahead"')
    expect(hasCommittedChanges(repo, 'main')).toBe(true)
  })

  test('hasCommittedChanges is false when the log probe fails', () => {
    expect(hasCommittedChanges(repo, 'no-such-branch')).toBe(false)
  })
})

describe.sequential('ai/worktree — spawnAiAgentsInWorktrees', () => {
  test('refuses a baseRepo that is not a git checkout', async () => {
    const bare = path.join(tmpRoot, 'plain-dir')
    mkdirSync(bare, { recursive: true })

    await expect(
      spawnAiAgentsInWorktrees(['one'], async () => 'ok', { baseRepo: bare }),
    ).rejects.toThrow(/not a git checkout/)
  })

  test('returns one settled entry per item, in input order', async () => {
    const seen: string[] = []
    const settled = await spawnAiAgentsInWorktrees(
      ['first', 'second'],
      async item => {
        seen.push(item)
        return item.toUpperCase()
      },
      {
        baseRepo: repo,
        concurrency: 1,
        namePrefix: 'fanout-order',
        worktreeRoot: path.join(tmpRoot, 'wt-order'),
      },
    )

    expect(settled).toHaveLength(2)
    expect(settled[0]?.status).toBe('fulfilled')
    expect(settled[1]?.status).toBe('fulfilled')
    expect(seen).toStrictEqual(['first', 'second'])
  })

  test('one item rejecting leaves its sibling fulfilled', async () => {
    const settled = await spawnAiAgentsInWorktrees(
      ['good', 'bad'],
      async item => {
        if (item === 'bad') {
          throw new Error('boom')
        }
        return item
      },
      {
        baseRepo: repo,
        concurrency: 2,
        namePrefix: 'fanout-mixed',
        worktreeRoot: path.join(tmpRoot, 'wt-mixed'),
      },
    )

    expect(settled[0]?.status).toBe('fulfilled')
    expect(settled[1]?.status).toBe('rejected')
  })

  test('an empty item list settles empty without touching git', async () => {
    const settled = await spawnAiAgentsInWorktrees([], async () => 'never', {
      baseRepo: repo,
      worktreeRoot: path.join(tmpRoot, 'wt-empty'),
    })

    expect(settled).toStrictEqual([])
  })

  test('a concurrency above the cap still runs every item', async () => {
    // The clamp is MathMax(1, min(requested, MAX_CONCURRENCY)), so an absurd
    // request must neither spawn that many workers nor drop an item.
    const settled = await spawnAiAgentsInWorktrees(
      ['a', 'b', 'c'],
      async item => item,
      {
        baseRepo: repo,
        concurrency: 9999,
        namePrefix: 'fanout-cap',
        worktreeRoot: path.join(tmpRoot, 'wt-cap'),
      },
    )

    expect(settled).toHaveLength(3)
    expect(settled.every(entry => entry.status === 'fulfilled')).toBe(true)
  })

  test('a concurrency below one is raised to one', async () => {
    const settled = await spawnAiAgentsInWorktrees(['solo'], async i => i, {
      baseRepo: repo,
      concurrency: 0,
      namePrefix: 'fanout-floor',
      worktreeRoot: path.join(tmpRoot, 'wt-floor'),
    })

    expect(settled).toHaveLength(1)
    expect(settled[0]?.status).toBe('fulfilled')
  })

  test('the branch defaults to the base repo current branch', async () => {
    // No `branch` option, so currentBranch(baseRepo) supplies it. A wrong
    // default surfaces as a failed worktree add, never as a silent pass.
    const settled = await spawnAiAgentsInWorktrees(['x'], async i => i, {
      baseRepo: repo,
      namePrefix: 'fanout-branch',
      worktreeRoot: path.join(tmpRoot, 'wt-branch'),
    })

    expect(settled[0]?.status).toBe('fulfilled')
  })
})
