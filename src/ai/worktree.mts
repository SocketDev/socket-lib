/**
 * @file Run AI agents in parallel, each in its own git worktree, and merge
 *   results back to the base branch. The fleet's CLAUDE.md "Parallel Claude
 *   sessions" rule mandates worktree isolation when multiple agents touch the
 *   same checkout. This helper enforces that contract: each item gets a fresh
 *   worktree branched from the base, the per-item function runs inside it, then
 *   the helper either fast-forward-merges the worktree branch back into the
 *   base (when changes were committed) or removes the worktree silently (when
 *   no changes happened). Concurrency: caller-controlled with a default cap of
 *   4. Per the "Programmatic Claude calls" CLAUDE.md rule, very high
 *   concurrency saturates the API rate limits; 4 is safe headroom for most
 *   accounts. The hard cap of 8 prevents accidental flag-finger disasters.
 *   Cleanup policy: see `WorktreeCleanup` in types.mts. Default 'always' —
 *   fail-or-pass, the worktree is removed.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

import { errorMessage } from '../errors/message'
import { spawnSync } from '../spawn/spawn'
import { isSpawnError } from '../spawn/errors'

import type { WorktreeCleanup } from './types.mts'

const DEFAULT_CONCURRENCY = 4
const MAX_CONCURRENCY = 8

export interface WorktreeRunOptions {
  /**
   * Base repo path (the primary checkout).
   */
  readonly baseRepo: string
  /**
   * Branch to merge results into. Default: current branch of baseRepo.
   */
  readonly branch?: string
  /**
   * Cleanup policy. Default 'always'.
   */
  readonly cleanup?: WorktreeCleanup
  /**
   * Parallel cap. Default 4, max 8.
   */
  readonly concurrency?: number
  /**
   * Prefix for worktree branch + dir names. Default 'agent-task'.
   */
  readonly namePrefix?: string
  /**
   * Where worktrees live on disk. Default: `${tmpdir}/${prefix}-<n>`.
   */
  readonly worktreeRoot?: string
}

export interface WorktreeRunContext {
  /**
   * Worktree dir on disk.
   */
  readonly cwd: string
  /**
   * Branch name created for this worktree.
   */
  readonly branch: string
  /**
   * 0-indexed item position.
   */
  readonly index: number
}

export interface WorktreeRunSettled<T> {
  readonly cleanup: 'removed' | 'kept'
  readonly error?: unknown
  readonly merged: boolean
  readonly status: 'fulfilled' | 'rejected'
  readonly value?: T | undefined
  readonly worktreePath: string
}

export function currentBranch(repo: string): string {
  return git(repo, 'symbolic-ref', '--short', 'HEAD')
}

export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    stdio: 'pipe',
    stdioString: true,
  })
  return String(result.stdout ?? '').trim()
}

export function hasCommittedChanges(
  worktree: string,
  baseBranch: string,
): boolean {
  const log = tryGit(worktree, 'log', '--oneline', `${baseBranch}..HEAD`)
  if (!log.ok) {
    return false
  }
  return log.output.trim().length > 0
}

export function hasStagedOrUnstaged(worktree: string): boolean {
  const status = tryGit(worktree, 'status', '--porcelain')
  return status.ok && status.output.trim().length > 0
}

export async function runOne<I, T>(
  item: I,
  index: number,
  worktreeBranch: string,
  worktreePath: string,
  baseRepo: string,
  branch: string,
  cleanup: WorktreeCleanup,
  fn: (item: I, ctx: WorktreeRunContext) => Promise<T>,
): Promise<WorktreeRunSettled<T>> {
  // Create worktree.
  const add = tryGit(
    baseRepo,
    'worktree',
    'add',
    '-b',
    worktreeBranch,
    worktreePath,
    branch,
  )
  if (!add.ok) {
    return {
      cleanup: 'kept',
      error: new Error(`git worktree add failed: ${add.output}`),
      merged: false,
      status: 'rejected',
      worktreePath,
    }
  }

  let value: T | undefined
  let error: unknown
  try {
    value = await fn(item, { branch: worktreeBranch, cwd: worktreePath, index })
  } catch (e) {
    error = e
  }

  const hasCommitted = hasCommittedChanges(worktreePath, branch)
  const hasUncommitted = hasStagedOrUnstaged(worktreePath)
  let merged = false
  if (error === undefined && hasCommitted) {
    const merge = tryGit(baseRepo, 'merge', '--ff-only', worktreeBranch)
    if (merge.ok) {
      merged = true
    } else {
      error = new Error(`git merge --ff-only failed: ${merge.output}`)
    }
  }

  // Cleanup decision.
  let didCleanup: 'removed' | 'kept' = 'kept'
  const shouldCleanup =
    error === undefined &&
    (cleanup === 'always' ||
      (cleanup === 'on-empty' && !hasCommitted && !hasUncommitted))

  if (shouldCleanup) {
    const remove = tryGit(baseRepo, 'worktree', 'remove', worktreePath)
    if (remove.ok) {
      didCleanup = 'removed'
      // Remove the merged/empty branch too.
      tryGit(baseRepo, 'branch', '-D', worktreeBranch)
    }
  }

  if (error !== undefined) {
    return {
      cleanup: didCleanup,
      error,
      merged,
      status: 'rejected',
      worktreePath,
    }
  }
  return {
    cleanup: didCleanup,
    merged,
    status: 'fulfilled',
    value,
    worktreePath,
  }
}

/**
 * Run `fn` for each item in parallel, each invocation isolated in its own git
 * worktree. Results are merged back into the base branch with `git merge
 * --ff-only`; non-FF merges are reported as failures and the worktree is
 * preserved (regardless of cleanup policy).
 *
 * @example
 *   ;```ts
 *   import { spawnAiAgentsInWorktrees } from '@socketsecurity/lib/ai/worktree'
 *   import { spawnAiAgent } from '@socketsecurity/lib/ai/spawn'
 *   import { EDIT_ONLY_PROFILE } from '@socketsecurity/lib/ai/profiles'
 *
 *   const repos = ['socket-addon', 'socket-btm', 'socket-lib']
 *   const settled = await spawnAiAgentsInWorktrees(
 *     repos,
 *     async ({ cwd }) => {
 *       return await spawnAiAgent({
 *         ...EDIT_ONLY_PROFILE,
 *         prompt: 'Run the cleanup task',
 *         cwd,
 *       })
 *     },
 *     {
 *       baseRepo: '/Users/<user>/projects/socket-wheelhouse',
 *       concurrency: 3,
 *       cleanup: 'on-empty',
 *     },
 *   )
 *   ```
 */
export async function spawnAiAgentsInWorktrees<I, T>(
  items: readonly I[],
  fn: (item: I, ctx: WorktreeRunContext) => Promise<T>,
  options: WorktreeRunOptions,
): Promise<ReadonlyArray<WorktreeRunSettled<T>>> {
  const cleanup = options.cleanup ?? 'always'
  const namePrefix = options.namePrefix ?? 'agent-task'
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, MAX_CONCURRENCY),
  )
  const baseRepo = options.baseRepo
  if (!existsSync(path.join(baseRepo, '.git'))) {
    throw new Error(
      `spawnAiAgentsInWorktrees: baseRepo is not a git checkout: ${baseRepo}`,
    )
  }
  const branch = options.branch ?? currentBranch(baseRepo)
  const worktreeRoot =
    options.worktreeRoot ??
    path.join(
      process.platform === 'win32' ? (process.env['TEMP'] ?? '.') : '/tmp',
      `${namePrefix}-${Date.now()}`,
    )

  const settled: Array<WorktreeRunSettled<T>> = []

  // Cap concurrency with a small slot pool. Promise.allSettled-shape
  // results: one item's failure doesn't abort siblings.
  let cursor = 0
  async function worker(): Promise<void> {
    for (;;) {
      const idx = cursor
      cursor += 1
      if (idx >= items.length) {
        return
      }
      const item = items[idx] as I
      const worktreeBranch = `${namePrefix}-${idx}-${Date.now()}`
      const worktreePath = path.join(worktreeRoot, `${namePrefix}-${idx}`)
      const result: WorktreeRunSettled<T> = await runOne(
        item,
        idx,
        worktreeBranch,
        worktreePath,
        baseRepo,
        branch,
        cleanup,
        fn,
      )
      settled[idx] = result
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return settled
}

export function tryGit(
  cwd: string,
  ...args: string[]
): { ok: boolean; output: string } {
  try {
    const output = git(cwd, ...args)
    return { ok: true, output }
  } catch (e) {
    if (isSpawnError(e)) {
      return { ok: false, output: String(e.stderr ?? e.stdout ?? '') }
    }
    return { ok: false, output: errorMessage(e) }
  }
}
