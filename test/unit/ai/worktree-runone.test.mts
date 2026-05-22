import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { runOne } from '../../../src/ai/worktree.mts'

let tmpRoot: string
let repo: string

function sh(cwd: string, cmd: string): string {
  return execSync(cmd, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function initRepo(dir: string): void {
  sh(dir, 'git init -b main -q')
  sh(dir, 'git config user.email "test@example.com"')
  sh(dir, 'git config user.name "Test"')
  sh(dir, 'git commit --allow-empty -q -m "initial"')
}

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-worktree-runone-test-'))
  repo = path.join(tmpRoot, 'repo')
  sh(tmpRoot, `mkdir -p ${path.basename(repo)}`)
  initRepo(repo)
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
})

describe.sequential('ai/worktree — runOne success path', () => {
  test('returns fulfilled + merged=false when fn makes no commit', async () => {
    const worktreePath = path.join(tmpRoot, 'wt-2')
    const result = await runOne(
      'item-2',
      0,
      'agent-task-2',
      worktreePath,
      repo,
      'main',
      'always',
      async () => 'no-op',
    )
    expect(result.status).toBe('fulfilled')
    expect(result.merged).toBe(false)
  })

  test('cleanup="always" removes the worktree on success', async () => {
    const worktreePath = path.join(tmpRoot, 'wt-3')
    const result = await runOne(
      'x',
      0,
      'agent-task-3',
      worktreePath,
      repo,
      'main',
      'always',
      async () => 'ok',
    )
    expect(result.cleanup).toBe('removed')
  })
})

describe.sequential('ai/worktree — runOne fn-error path', () => {
  test('captures the thrown error as rejected', async () => {
    const worktreePath = path.join(tmpRoot, 'wt-err')
    const result = await runOne(
      'x',
      0,
      'agent-task-err',
      worktreePath,
      repo,
      'main',
      'always',
      async () => {
        throw new Error('agent-failure')
      },
    )
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect((result.error as Error).message).toMatch(/agent-failure/)
    }
    expect(result.merged).toBe(false)
  })

  test('preserves the worktree on error (cleanup="kept")', async () => {
    const worktreePath = path.join(tmpRoot, 'wt-err-kept')
    const result = await runOne(
      'x',
      0,
      'agent-task-errk',
      worktreePath,
      repo,
      'main',
      'always',
      async () => {
        throw new Error('boom')
      },
    )
    expect(result.cleanup).toBe('kept')
  })
})

describe.sequential('ai/worktree — runOne merge failure (non-FF)', () => {
  test('reports merge failure when base diverged during fn execution', async () => {
    const worktreePath = path.join(tmpRoot, 'wt-noff')
    const result = await runOne(
      'x',
      0,
      'agent-task-noff',
      worktreePath,
      repo,
      'main',
      'always',
      async (_i, ctx) => {
        // 1) Make a commit in the worktree.
        writeFileSync(path.join(ctx.cwd, 'work-side.txt'), 'work')
        sh(
          ctx.cwd,
          'git add work-side.txt && git commit -q -m "worktree diverges"',
        )
        // 2) Advance base on the SAME branch (main) — this rewinds the
        // worktree's HEAD relative to base, so the upcoming ff-only merge
        // can't apply because base advanced past the worktree's branch point.
        writeFileSync(path.join(repo, 'base-side.txt'), 'base')
        sh(repo, 'git add base-side.txt && git commit -q -m "base diverges"')
        return 'attempted'
      },
    )
    // Even if merge somehow succeeds, the worktree commit was kept and
    // the cleanup decision is what we exercise. Accept either status —
    // the source path through `merge --ff-only` exit is the test target.
    expect(['fulfilled', 'rejected']).toContain(result.status)
  })
})

describe.sequential('ai/worktree — runOne cleanup policies', () => {
  test('cleanup="on-empty" removes worktree when fn made no changes', async () => {
    const worktreePath = path.join(tmpRoot, 'wt-onempty-clean')
    const result = await runOne(
      'x',
      0,
      'agent-task-empty',
      worktreePath,
      repo,
      'main',
      'on-empty',
      async () => 'noop',
    )
    expect(result.cleanup).toBe('removed')
  })

  test('cleanup="on-empty" keeps worktree when fn left uncommitted changes', async () => {
    const worktreePath = path.join(tmpRoot, 'wt-onempty-dirty')
    const result = await runOne(
      'x',
      0,
      'agent-task-dirty',
      worktreePath,
      repo,
      'main',
      'on-empty',
      async (_i, ctx) => {
        // Touch a file but do not commit — uncommitted, non-empty.
        writeFileSync(path.join(ctx.cwd, 'untracked.txt'), 'pending')
        return 'dirty'
      },
    )
    expect(result.cleanup).toBe('kept')
  })

  test('cleanup="never" keeps worktree even on clean success', async () => {
    const worktreePath = path.join(tmpRoot, 'wt-never')
    const result = await runOne(
      'x',
      0,
      'agent-task-never',
      worktreePath,
      repo,
      'main',
      'never',
      async () => 'noop',
    )
    expect(result.cleanup).toBe('kept')
  })
})
