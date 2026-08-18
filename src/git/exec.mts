/**
 * @file Centralized git command runner. Every fleet script that spawns git
 *   goes through here so the spawn source, output encoding, timeout defaults,
 *   and index.lock handling are consistent. The git binary is resolved once via
 *   getGitPath; a GitLockError is thrown when the shared index is locked by
 *   another git process, so a caller can retry or switch to an isolated index
 *   (withIsolatedIndex) rather than fail open. Non-zero exits are NOT thrown:
 *   git uses non-zero for ordinary conditions a caller routes on (no matches, a
 *   dirty tree), so the caller checks .status / .code the same as raw
 *   spawnSync. The index.lock detection is the one deviation, because a lock
 *   error is transient and recoverable, and a silent swallow (the cascade
 *   reporting "clean" when it could not check) is the false-green the
 *   code-first-then-ai rule exists to stop.
 */

import { spawn, spawnSync } from '../process/spawn/child.mjs'
import { getGitPath } from './shared.mjs'
import { getCwd } from './repo.mjs'

import type { SpawnSyncReturns } from '../process/spawn/types.mjs'

// The default timeout for a git command. Generous because git operations on
// large repos (status, diff, log) can take seconds; tight enough that a hung
// git does not block a script indefinitely.
export const GIT_DEFAULT_TIMEOUT_MS = 30_000

// The substring that identifies an index.lock contention in git stderr.
const INDEX_LOCK_PATTERN = 'index.lock'

/**
 * Error thrown when a git command fails because the shared index is locked by
 * another git process. A caller can catch GitLockError to retry or switch to
 * withIsolatedIndex. The cmd + args are carried so a retry loop can log the
 * exact command that contended.
 */
export class GitLockError extends Error {
  readonly cmd: string
  readonly args: readonly string[]
  constructor(cmd: string, args: readonly string[], message: string) {
    super(message)
    this.name = 'GitLockError'
    this.cmd = cmd
    this.args = args
  }
}

/**
 * Options shared by the sync and async git runners. Mirrors the subset of
 * spawn options the fleet git call sites use: cwd, env, timeout, and
 * stdioString. The sync runner adds input, a sync-only spawn option. Async
 * spawn has no stdin write in the same sense, so input stays off the shared
 * bag.
 */
export interface GitExecOptions {
  cwd?: string | undefined
  env?: NodeJS.ProcessEnv | undefined
  timeout?: number | undefined
  stdioString?: boolean | undefined
}

/**
 * Options for the sync git runner. Extends GitExecOptions with input, a
 * sync-only spawn option.
 */
export interface GitSyncOptions extends GitExecOptions {
  input?: string | NodeJS.ArrayBufferView | undefined
}

/**
 * The result shape returned by gitSync: the lib spawnSync return with string or
 * Buffer stdio depending on the stdioString option. A caller narrows with
 * Buffer.isBuffer(result.stdout) when stdioString is false.
 */
export type GitSyncResult = SpawnSyncReturns<string | Buffer>

/**
 * The result shape returned by gitSpawn: the lib async spawn return with string
 * or Buffer stdio depending on the stdioString option.
 */
export interface GitSpawnResult {
  cmd: string
  args: string[] | readonly string[]
  code: number
  signal: NodeJS.Signals | null
  stdout: string | Buffer
  stderr: string | Buffer
}

/**
 * Check git stderr for an index.lock contention and throw GitLockError when
 * found. The cmd + args are carried so a retry loop can log the exact command
 * that contended.
 */
export function detectLockError(
  cmd: string,
  args: readonly string[],
  stderr: string | Buffer,
): void {
  if (stderrText(stderr).includes(INDEX_LOCK_PATTERN)) {
    throw new GitLockError(
      cmd,
      args,
      `The git index is locked by another process. Where: git ${args.join(' ')}. Saw: ${INDEX_LOCK_PATTERN} in stderr. Fix: retry after the other git process finishes, or use withIsolatedIndex to bypass the shared index lock.`,
    )
  }
}

/**
 * Run a git command asynchronously with consistent defaults. The git binary is
 * resolved via getGitPath; cwd defaults to the current working directory;
 * timeout defaults to GIT_DEFAULT_TIMEOUT_MS; stdioString defaults to true
 * (string output). A GitLockError is thrown when the shared index is locked.
 * Non-zero exits are resolved, not rejected: the caller checks .code.
 *
 * @example
 *   const { code, stdout } = await gitSpawn(['rev-parse', 'HEAD'])
 */
export async function gitSpawn(
  args: readonly string[],
  options?: GitExecOptions | undefined,
): Promise<GitSpawnResult> {
  const { cwd, env, timeout, stdioString } = Object.assign(
    Object.create(null),
    options,
  )
  const git = getGitPath()
  const result = await spawn(git, [...args], {
    cwd: cwd ?? getCwd(),
    env,
    timeout: timeout ?? GIT_DEFAULT_TIMEOUT_MS,
    stdioString: stdioString ?? true,
  })
  detectLockError(git, args, result.stderr)
  return result
}

/**
 * Run a git command synchronously with consistent defaults. The git binary is
 * resolved via getGitPath; cwd defaults to the current working directory;
 * timeout defaults to GIT_DEFAULT_TIMEOUT_MS; stdioString defaults to true
 * (string output). A GitLockError is thrown when the shared index is locked.
 * Non-zero exits are returned, not thrown: the caller checks .status.
 *
 * @example
 *   const r = gitSync(['status', '--porcelain'])
 *   if (r.status === 0) { ... r.stdout ... }
 */
export function gitSync(
  args: readonly string[],
  options?: GitSyncOptions | undefined,
): GitSyncResult {
  const { cwd, env, timeout, input, stdioString } = Object.assign(
    Object.create(null),
    options,
  )
  const git = getGitPath()
  const result = spawnSync(git, [...args], {
    cwd: cwd ?? getCwd(),
    env,
    timeout: timeout ?? GIT_DEFAULT_TIMEOUT_MS,
    input,
    stdioString: stdioString ?? true,
  })
  detectLockError(git, args, result.stderr)
  return result
}

/**
 * Convert a stderr value (string or Buffer) to text for substring matching.
 */
export function stderrText(stderr: string | Buffer): string {
  return typeof stderr === 'string' ? stderr : stderr.toString('utf8')
}
