/*
 * @file Decide whether a paused rebase is safe to continue.
 *
 *   The failure this exists to stop, observed live: an interactive rebase in a
 *   shared checkout stopped mid-run with 8,006 files staged for deletion while
 *   the commit it was applying touched 2. Running `git rebase --continue` there
 *   would have recorded the wipe. Nothing caught it, because every existing
 *   deletion gate keys on `git commit`, and `--continue` commits through git's
 *   own machinery without ever spelling that word.
 *
 *   Two independent signals, either of which condemns the state:
 *
 *   - VOLUME. Deletions at or past the floor are a wipe on their own, the same
 *     threshold the commit-time gate uses. Kept equal to it on purpose: one
 *     number for "this many deletions is never routine", not two that drift.
 *   - DISPROPORTION. The stopped commit's own diff is the honest expectation
 *     for how many files should move. Deletions far past it mean the index
 *     holds something the commit never asked for, which is the exact 2-vs-8006
 *     shape. This catches a corrupt state well below the volume floor.
 *
 *   Deliberately NOT a judgment about rebasing. A rebase that legitimately
 *   drops many files still trips this, and that is the intended cost: the
 *   operator confirms once, rather than every actor after them inheriting a
 *   landmine. Untracking is already discriminated upstream by
 *   `benign-untracking.mts`, so a `git rm --cached` sweep does not reach here.
 */

import { commandsFor } from '../_shared/shell-command.mts'

/**
 * Deletions that are never routine, matching the commit-time gate's floor in
 * `.git-hooks/_shared/staged-gates.mts` so the two cannot drift apart.
 */
export const DELETE_FLOOR = 50

/**
 * How far past the stopped commit's own file count the staged deletions may
 * run before the index is holding something the commit did not ask for.
 */
export const DISPROPORTION_FACTOR = 20

/**
 * The smallest deletion count worth judging by disproportion. Below this a
 * small commit touching one file legitimately deletes a handful around it.
 */
export const DISPROPORTION_FLOOR = 10

export interface PausedRebase {
  /**
   * Files staged for deletion right now.
   */
  stagedDeletions: number
  /**
   * Files the commit the rebase stopped on touches, or undefined when it could
   * not be read. Undefined disables the disproportion signal, never the volume
   * one, so an unreadable commit degrades to the weaker check rather than to
   * silence.
   */
  stoppedCommitFiles?: number | undefined
}

/**
 * Why continuing this rebase would record a wipe, or undefined when the staged
 * state is proportionate to the commit being applied.
 *
 * Pure, so the thresholds are testable without a repository.
 */
export function corruptRebaseReason(state: PausedRebase): string | undefined {
  const { stagedDeletions, stoppedCommitFiles } = state
  if (stagedDeletions >= DELETE_FLOOR) {
    return `${stagedDeletions} files staged for deletion (at or past the ${DELETE_FLOOR} floor)`
  }
  if (
    stoppedCommitFiles !== undefined &&
    stagedDeletions >= DISPROPORTION_FLOOR &&
    stagedDeletions > stoppedCommitFiles * DISPROPORTION_FACTOR
  ) {
    return `${stagedDeletions} files staged for deletion while the commit being applied touches ${stoppedCommitFiles}`
  }
  return undefined
}

/**
 * The subcommand a `git rebase` invocation is performing, or undefined when the
 * command is not a rebase continuation.
 *
 * Only `--continue` and `--skip` record a commit from the current index, so
 * they are the shapes this guard judges. `--abort` is the recovery path and is
 * always allowed; starting a rebase stages nothing yet. Parsed with the shared
 * shell AST rather than a pattern, so a chained or quoted invocation reads the
 * same as a bare one.
 */
export function rebaseContinuation(
  command: string,
): 'continue' | 'skip' | undefined {
  const gitCommands = commandsFor(command, 'git')
  for (let i = 0, { length } = gitCommands; i < length; i += 1) {
    const { args } = gitCommands[i]!
    if (!args.includes('rebase')) {
      continue
    }
    if (args.includes('--continue')) {
      return 'continue'
    }
    if (args.includes('--skip')) {
      return 'skip'
    }
  }
  return undefined
}
