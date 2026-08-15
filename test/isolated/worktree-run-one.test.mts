/**
 * @file Isolated tests for ai/worktree's runOne — one item's whole worktree
 *   lifecycle: add → run → merge → clean up. Split from worktree.test.mts to
 *   keep both files under the size cap. Real git throughout: the decisions
 *   runOne makes (merged? cleaned up?) are readable only from git's actual
 *   state, and the add/merge/remove cycles run through blocking spawnSync,
 *   which is why this sits in the isolated tier.
 */

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { git, runOne } from '../../src/ai/worktree.mjs'
import { sh } from '../unit/util/cross-platform-sh.mts'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

let tmpRoot: string
let repo: string

function initRepo(dir: string): void {
  sh(dir, 'git init -b main -q')
  sh(dir, 'git config user.email "test@example.com"')
  sh(dir, 'git config user.name "Test"')
  sh(dir, 'git commit --allow-empty -q -m "initial"')
}

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-worktree-runone-'))
  repo = path.join(tmpRoot, 'repo')
  mkdirSync(repo, { recursive: true })
  initRepo(repo)
})

afterEach(() => {
  safeDeleteSync(tmpRoot)
})

describe.sequential('runOne', () => {
  // runOne owns one item's whole worktree lifecycle: add → run → merge →
  // clean up. Each arm is driven against a real repo, since the decisions it
  // makes (merged? cleaned up?) are readable only from git's actual state.

  function worktreeFor(name: string): string {
    return path.join(tmpRoot, name)
  }

  test('merges a worktree whose callback committed, and reports it', async () => {
    const wt = worktreeFor('wt-merge')
    const settled = await runOne(
      'item',
      0,
      'agent/merge',
      wt,
      repo,
      'main',
      'always',
      async (_item, ctx) => {
        writeFileSync(path.join(ctx.cwd, 'added.txt'), 'content')
        sh(ctx.cwd, 'git add added.txt')
        sh(ctx.cwd, 'git commit -q -m "feat: add a file"')
        return 'done'
      },
    )
    expect(settled.status).toBe('fulfilled')
    expect(settled.value).toBe('done')
    expect(settled.merged).toBe(true)
    // The commit is on the base repo's main after the ff-only merge.
    expect(git(repo, 'log', '--oneline', '-1')).toContain('add a file')
  })

  test('passes the item, index, branch and cwd to the callback', async () => {
    const wt = worktreeFor('wt-ctx')
    let seen: Record<string, unknown> = {}
    await runOne(
      { id: 7 },
      3,
      'agent/ctx',
      wt,
      repo,
      'main',
      'always',
      async (item, ctx) => {
        seen = { branch: ctx.branch, cwd: ctx.cwd, index: ctx.index, item }
        return undefined
      },
    )
    expect(seen['item']).toEqual({ id: 7 })
    expect(seen['index']).toBe(3)
    expect(seen['branch']).toBe('agent/ctx')
    expect(seen['cwd']).toBe(wt)
  })

  test('rejects without merging when the callback throws', async () => {
    const wt = worktreeFor('wt-throw')
    const boom = new Error('callback exploded')
    const settled = await runOne(
      'item',
      0,
      'agent/throw',
      wt,
      repo,
      'main',
      'always',
      async () => {
        throw boom
      },
    )
    expect(settled.status).toBe('rejected')
    expect(settled.error).toBe(boom)
    expect(settled.merged).toBe(false)
    // A failed run is KEPT so the operator can inspect it.
    expect(settled.cleanup).toBe('kept')
  })

  test('rejects when the worktree cannot be created', async () => {
    // The base branch does not exist, so `git worktree add` fails before the
    // callback ever runs.
    let called = false
    const settled = await runOne(
      'item',
      0,
      'agent/no-base',
      worktreeFor('wt-nobase'),
      repo,
      'no-such-branch',
      'always',
      async () => {
        called = true
        return 'unreachable'
      },
    )
    expect(settled.status).toBe('rejected')
    expect(String(settled.error)).toMatch(/git worktree add failed/)
    expect(called).toBe(false)
  })

  test('reports an error when the ff-only merge is rejected', async () => {
    // Base moves ahead while the worktree commits, so the histories diverge and
    // `merge --ff-only` refuses. The run is not merged and carries the error.
    const wt = worktreeFor('wt-diverge')
    const settled = await runOne(
      'item',
      0,
      'agent/diverge',
      wt,
      repo,
      'main',
      'never',
      async (_item, ctx) => {
        writeFileSync(path.join(ctx.cwd, 'branch.txt'), 'from worktree')
        sh(ctx.cwd, 'git add branch.txt')
        sh(ctx.cwd, 'git commit -q -m "feat: worktree side"')
        // Diverge the base AFTER the worktree committed.
        writeFileSync(path.join(repo, 'base.txt'), 'from base')
        sh(repo, 'git add base.txt')
        sh(repo, 'git commit -q -m "feat: base side"')
        return 'done'
      },
    )
    expect(settled.merged).toBe(false)
    expect(settled.status).toBe('rejected')
    expect(String(settled.error)).toMatch(/git merge --ff-only failed/)
  })

  test('cleanup "always" removes the worktree after a clean run', async () => {
    const wt = worktreeFor('wt-always')
    const settled = await runOne(
      'item',
      0,
      'agent/always',
      wt,
      repo,
      'main',
      'always',
      async () => 'ok',
    )
    expect(settled.cleanup).toBe('removed')
    expect(existsSync(wt)).toBe(false)
  })

  test('cleanup "on-empty" removes a worktree that produced nothing', async () => {
    const wt = worktreeFor('wt-empty')
    const settled = await runOne(
      'item',
      0,
      'agent/empty',
      wt,
      repo,
      'main',
      'on-empty',
      async () => 'ok',
    )
    expect(settled.cleanup).toBe('removed')
    expect(existsSync(wt)).toBe(false)
  })

  test('cleanup "on-empty" keeps a worktree with uncommitted work', async () => {
    // Uncommitted changes are the operator's, so an on-empty pass leaves them.
    const wt = worktreeFor('wt-dirty')
    const settled = await runOne(
      'item',
      0,
      'agent/dirty',
      wt,
      repo,
      'main',
      'on-empty',
      async (_item, ctx) => {
        writeFileSync(path.join(ctx.cwd, 'scratch.txt'), 'wip')
        return 'ok'
      },
    )
    expect(settled.cleanup).toBe('kept')
    expect(existsSync(wt)).toBe(true)
  })

  test('cleanup "never" keeps the worktree even on a clean run', async () => {
    const wt = worktreeFor('wt-never')
    const settled = await runOne(
      'item',
      0,
      'agent/never',
      wt,
      repo,
      'main',
      'never',
      async () => 'ok',
    )
    expect(settled.cleanup).toBe('kept')
    expect(existsSync(wt)).toBe(true)
  })
})
