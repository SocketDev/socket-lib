/**
 * @file Worktree enumeration over `git worktree list --porcelain`. Git is the
 *   only authority on what a worktree is: a caller must never infer one from a
 *   sibling directory, a name prefix, or any other filesystem heuristic, and
 *   must never delete a directory git does not list.
 *   Paths are realpath-resolved on both sides before comparison. Git reports a
 *   worktree by its resolved path, so on macOS a worktree created under
 *   `os.tmpdir()` (`/var/folders/...`) comes back as `/private/var/folders/...`
 *   and naive string equality silently misses it.
 */

import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import { normalizePath } from '../paths/normalize.mjs'
import { getOsTmpDir } from '../paths/socket.mjs'
import { gitSpawn, gitSync } from './exec.mjs'
import { getCachedRealpath, getCwd } from './repo.mjs'

/**
 * One entry from `git worktree list --porcelain`.
 */
export interface GitWorktree {
  /**
   * True when the worktree is bare.
   */
  readonly bare: boolean
  /**
   * The branch the worktree has checked out, without the `refs/heads/` prefix.
   * Undefined for a detached HEAD.
   */
  readonly branch: string | undefined
  /**
   * True when HEAD is detached.
   */
  readonly detached: boolean
  /**
   * The commit HEAD points at, or undefined for a bare worktree.
   */
  readonly head: string | undefined
  /**
   * True when the worktree is locked. A locked worktree is off-limits to any
   * automated removal.
   */
  readonly locked: boolean
  /**
   * The lock reason git recorded, when it recorded one.
   */
  readonly lockReason: string | undefined
  /**
   * True when this is the main worktree rather than a linked one. Removing the
   * main worktree is never valid.
   */
  readonly main: boolean
  /**
   * Absolute, realpath-resolved, forward-slash-normalized path.
   */
  readonly path: string
  /**
   * True when git considers the worktree prunable, meaning its directory is
   * gone but the administrative record survives.
   */
  readonly prunable: boolean
  /**
   * The prunable reason git recorded, when it recorded one.
   */
  readonly prunableReason: string | undefined
}

/**
 * Create a unique scratch directory for a worktree under the OS temp dir, and
 * return it in the form git reports.
 *
 * The system temp dir is the right home for a throwaway worktree on macOS,
 * Linux and Windows alike. Placing one beside its repository instead puts a
 * live checkout where a directory-scanning tool reads it as a sibling project.
 *
 * `mkdtemp` picks the suffix, so two concurrent callers asking for the same
 * label never collide. The caller then runs `git worktree add` into the result.
 *
 * @example
 *   ;```typescript
 *   const dir = createGitWorktreeTmpDir('socket-worktrees', 'review-pr-42')
 *   await gitSpawn(['worktree', 'add', '--detach', dir, 'HEAD'], { cwd: repo })
 *   ```
 *
 * @param namespace - Directory under the temp dir that groups a tool's
 *   worktrees, so a sweeper has one place to look.
 * @param label - Short slug describing the task, for readability only. It is
 *   sanitized, so it can never steer the path out of the namespace.
 *
 * @returns The created directory, realpath-resolved and normalized.
 */
export function createGitWorktreeTmpDir(
  namespace: string,
  label: string,
): string {
  const fs = getNodeFs()
  const path = getNodePath()
  const home = getGitWorktreeTmpDir(namespace)
  const slug = sanitizeWorktreeLabel(label)
  return resolveWorktreePath(fs.mkdtempSync(path.join(home, `${slug}-`)))
}

/**
 * Find the worktree git lists at `worktreePath`, or undefined when git does not
 * list one there.
 *
 * This is the check to make before removing anything. A directory git does not
 * list is not a worktree, whatever its name or location suggests, and deleting
 * it would be deleting an arbitrary directory.
 *
 * @example
 *   ;```typescript
 *   const found = await findGitWorktree('/path/to/repo', candidateDir)
 *   if (!found) {
 *     throw new Error('refusing to remove a directory git does not list')
 *   }
 *   ```
 *
 * @param repoRoot - Any path inside the repository.
 * @param worktreePath - The candidate directory.
 *
 * @returns Promise resolving to the entry, or undefined.
 */
export async function findGitWorktree(
  repoRoot: string,
  worktreePath: string,
): Promise<GitWorktree | undefined> {
  const wanted = resolveWorktreePath(worktreePath)
  const worktrees = await listGitWorktrees(repoRoot)
  return worktrees.find(entry => entry.path === wanted)
}

/**
 * Get the temp-dir home holding a tool's scratch worktrees, creating it on
 * first use.
 *
 * Creation has to precede the resolve: an absent directory has no realpath, and
 * on macOS that would hand back the unresolved `/var/folders/...` spelling that
 * never matches git's output.
 *
 * @param namespace - Directory under the temp dir that groups a tool's
 *   worktrees. Sanitized, so it stays one level under the temp dir.
 *
 * @returns The home directory, realpath-resolved and normalized.
 */
export function getGitWorktreeTmpDir(namespace: string): string {
  const fs = getNodeFs()
  const path = getNodePath()
  const home = path.join(getOsTmpDir(), sanitizeWorktreeLabel(namespace))
  fs.mkdirSync(home, { recursive: true })
  return resolveWorktreePath(home)
}

/**
 * Check whether `worktreePath` is a linked worktree that automated cleanup may
 * remove: git lists it, it is not the main worktree, and it is not locked.
 *
 * @param repoRoot - Any path inside the repository.
 * @param worktreePath - The candidate directory.
 *
 * @returns Promise resolving to true only when all three hold.
 */
export async function isRemovableGitWorktree(
  repoRoot: string,
  worktreePath: string,
): Promise<boolean> {
  const found = await findGitWorktree(repoRoot, worktreePath)
  return found !== undefined && !found.main && !found.locked
}

/**
 * List every worktree git knows about for `repoRoot`.
 *
 * @example
 *   ;```typescript
 *   const worktrees = await listGitWorktrees('/path/to/repo')
 *   // => [{ main: true, path: '/path/to/repo', branch: 'main', ... }]
 *   ```
 *
 * @param repoRoot - Any path inside the repository. Defaults to the cwd.
 *
 * @returns Promise resolving to the worktree list, empty when git fails.
 */
export async function listGitWorktrees(
  repoRoot: string = getCwd(),
): Promise<readonly GitWorktree[]> {
  const result = await gitSpawn(['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
  })
  if (result.code !== 0) {
    return []
  }
  return parseGitWorktreePorcelain(stdoutText(result.stdout))
}

/**
 * List every worktree synchronously, for a hook or guard that cannot await.
 *
 * @param repoRoot - Any path inside the repository. Defaults to the cwd.
 *
 * @returns The worktree list, empty when git fails.
 */
export function listGitWorktreesSync(
  repoRoot: string = getCwd(),
): readonly GitWorktree[] {
  const result = gitSync(['worktree', 'list', '--porcelain'], { cwd: repoRoot })
  if (result.status !== 0) {
    return []
  }
  return parseGitWorktreePorcelain(stdoutText(result.stdout))
}

/**
 * Parse the output of `git worktree list --porcelain`.
 *
 * Exported so a caller that already holds the porcelain text does not shell out
 * a second time, and so the parse is unit-testable without a repository. The
 * first stanza git emits is always the main worktree.
 *
 * @param porcelain - Raw stdout from `git worktree list --porcelain`.
 *
 * @returns One entry per worktree, in git's own order.
 */
export function parseGitWorktreePorcelain(
  porcelain: string,
): readonly GitWorktree[] {
  const out: GitWorktree[] = []
  const lines = porcelain.split(/\r?\n/)
  let current: Record<string, string | boolean> | undefined
  const flush = () => {
    if (!current) {
      return
    }
    const worktreePath = current['worktree']
    if (typeof worktreePath === 'string' && worktreePath) {
      const branchRef = current['branch']
      const locked = current['locked']
      const prunable = current['prunable']
      out.push({
        bare: current['bare'] === true,
        branch:
          typeof branchRef === 'string'
            ? branchRef.replace(/^refs\/heads\//, '')
            : undefined,
        detached: current['detached'] === true,
        head: typeof current['HEAD'] === 'string' ? current['HEAD'] : undefined,
        locked: locked !== undefined,
        lockReason: typeof locked === 'string' && locked ? locked : undefined,
        main: out.length === 0,
        path: resolveWorktreePath(worktreePath),
        prunable: prunable !== undefined,
        prunableReason:
          typeof prunable === 'string' && prunable ? prunable : undefined,
      })
    }
    current = undefined
  }
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    if (!line) {
      flush()
      continue
    }
    current ??= Object.create(null) as Record<string, string | boolean>
    // A valueless attribute: `bare`, `detached`, or a reasonless
    // `locked`/`prunable`.
    const space = line.indexOf(' ')
    if (space === -1) {
      current[line] = true
      continue
    }
    current[line.slice(0, space)] = line.slice(space + 1)
  }
  flush()
  return out
}

/**
 * Resolve and normalize a worktree path so it compares equal to what git
 * reports.
 *
 * @param worktreePath - Any absolute or relative worktree path.
 *
 * @returns The comparable form of the path.
 */
export function resolveWorktreePath(worktreePath: string): string {
  const path = getNodePath()
  const abs = path.resolve(worktreePath)
  try {
    return normalizePath(getCachedRealpath(abs))
  } catch {
    // getCachedRealpath rethrows ENOENT/ENOTDIR, which is right for resolving a
    // cwd and wrong here: a prunable worktree's directory is gone by
    // definition, so a missing path is the normal case and normalizing without
    // resolving still compares correctly against git's record.
    return normalizePath(abs)
  }
}

/**
 * Reduce a caller-supplied label to a single safe path segment.
 *
 * Every character outside `[A-Za-z0-9._-]` collapses to one dash, so a
 * separator or a `..` segment cannot steer a path out of its parent. The
 * leading and trailing dots and dashes that leaves are then trimmed, so a label
 * of pure separators reduces to nothing rather than to `-`, and an empty result
 * falls back to `task`.
 *
 * @param label - Any caller-supplied string.
 *
 * @returns A non-empty, single-segment slug of at most 40 characters.
 */
export function sanitizeWorktreeLabel(label: string): string {
  return (
    label
      // Any run of characters outside the safe set becomes one dash.
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      // Then trim a leading OR trailing run of dots and dashes, which is what
      // the collapse above leaves behind for a `../` prefix.
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 40) || 'task'
  )
}

/**
 * Decode git stdout, which arrives as a Buffer when the caller asked for no
 * encoding.
 *
 * @param stdout - Raw stdout from a git spawn.
 *
 * @returns The text, empty when git produced none.
 */
export function stdoutText(stdout: string | Buffer | undefined): string {
  if (typeof stdout === 'string') {
    return stdout
  }
  return stdout ? stdout.toString('utf8') : ''
}
