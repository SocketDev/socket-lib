#!/usr/bin/env node
// Claude Code PreToolUse hook — corrupt-rebase-guard.
//
// Blocks `git rebase --continue` / `--skip` when the paused rebase's index
// holds a wipe. Observed live: a rebase stopped in a shared checkout with
// 8,006 files staged for deletion while the commit it was applying touched 2.
// Continuing would have recorded that onto the branch.
//
// Why the deletion gates that already exist did not catch it: every one of
// them keys on `git commit`. `--continue` records a commit through git's own
// machinery and never spells that word, so it walked straight past
// mass-delete-guard and the .git-hooks staged gate. The hole was the command
// name, not the detection.
//
// The judgment lives in `rebase-shape.mts` (pure, unit-tested). This file only
// gathers the two counts: staged deletions now, and the file count of the
// commit the rebase stopped on. `--abort` is never blocked — it is the
// recovery path out of exactly the state this guard reports.

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { bashGuard, block, defineHook, runHook } from '../_shared/guard.mts'
import { spawnTimeoutMs } from '../_shared/spawn-timeout.mts'
import { verdictLine } from '../_shared/verdict.mts'
import { corruptRebaseReason, rebaseContinuation } from './rebase-shape.mts'

/**
 * Budget for each git read below. These are local plumbing calls against an
 * index git already has open, so a slow answer means something is wrong rather
 * than something is big; the guard fails open instead of hanging the tool call.
 */
const GIT_READ_TIMEOUT_MS = 5000

function gitLines(args: readonly string[]): string[] {
  try {
    const result = spawnSync('git', [...args], {
      stdio: 'pipe',
      stdioString: true,
      timeout: spawnTimeoutMs(GIT_READ_TIMEOUT_MS),
    })
    if (result.status !== 0 || typeof result.stdout !== 'string') {
      return []
    }
    return result.stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Files staged for deletion right now.
 */
export function stagedDeletionCount(): number {
  return gitLines(['diff', '--cached', '--diff-filter=D', '--name-only']).length
}

/**
 * How many files the commit the rebase stopped on touches, or undefined when
 * no rebase is paused or the sha cannot be read.
 *
 * Undefined is meaningful: it disables the disproportion signal rather than
 * the whole guard, so an unreadable commit degrades to the volume check.
 * `REBASE_HEAD` is git's own name for the stopped commit and resolves the same
 * under a rebase-merge or a rebase-apply layout, so no state directory is read
 * by hand.
 */
export function stoppedCommitFileCount(): number | undefined {
  const stopped = gitLines([
    'rev-parse',
    '--verify',
    '--quiet',
    'REBASE_HEAD',
  ])[0]
  if (!stopped) {
    return undefined
  }
  return gitLines(['--no-pager', 'show', '--name-only', '--format=', stopped])
    .length
}

export const check = bashGuard((command, payload) => {
  if (!rebaseContinuation(command)) {
    return undefined
  }
  const stagedDeletions = stagedDeletionCount()
  if (!stagedDeletions) {
    return undefined
  }
  const reason = corruptRebaseReason({
    stagedDeletions,
    stoppedCommitFiles: stoppedCommitFileCount(),
  })
  if (!reason) {
    return undefined
  }

  void payload

  return block(
    verdictLine(
      'block',
      'corrupt-rebase-guard',
      `continuing this rebase would record a wipe — ${reason}. \`git rebase --abort\` returns the branch to where it started with every commit intact; read the state first with \`git status\` and \`git diff --cached --diff-filter=D --name-only | wc -l\`\n`,
    ),
  )
})

export const hook = defineHook({
  bypass: ['corrupt-rebase'],
  check,
  event: 'PreToolUse',
  matcher: ['Bash'],
  type: 'guard',
})

void runHook(hook, import.meta.url)
