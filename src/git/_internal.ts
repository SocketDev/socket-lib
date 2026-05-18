/**
 * @file Cross-leaf diff machinery for `git/*`. Owns the LRU+TTL git-diff cache,
 *   the spawn-args builder, the porcelain-output parser, and the async/sync
 *   `innerDiff` runners. Public-surface leaves (`changed.ts`, `staged.ts`,
 *   `unstaged.ts`) call into these helpers; nothing else should.
 */

import { whichSync } from '../bin/which'
import { debugNs } from '../debug/output'
import { getGlobMatcher } from '../globs/matcher'
import { normalizePath } from '../paths/normalize'
import { ArrayIsArray } from '../primordials/array'
import { BufferIsBuffer } from '../primordials/buffer'
import { JSONStringify } from '../primordials/json'
import { MapCtor } from '../primordials/map-set'
import { ObjectKeys } from '../primordials/object'
import { StringPrototypeSubstring } from '../primordials/string'
import { spawn, spawnSync } from '../spawn/spawn'
import { stripAnsi } from '../ansi/strip'
import { findGitRoot, getCachedRealpath, getCwd, getPath } from './repo'

import type { GitDiffOptions } from './types'

export type SpawnArgs = [string, string[], Record<string, unknown>]

export interface GitDiffSpawnArgs {
  all: SpawnArgs
  unstaged: SpawnArgs
  staged: SpawnArgs
}

// LRU cache for git diff results with TTL. We exploit Map's insertion-order
// iteration so eviction is O(1): delete the first key. Touching on read
// (delete + set) keeps the most-recently-used entry at the back. TTL keeps
// long-running tools (watch mode, devserver) from serving stale results
// after the working tree changes.
export type GitDiffCacheEntry = {
  readonly expiresAt: number
  readonly result: string[]
}
export const gitDiffCache = new MapCtor<string, GitDiffCacheEntry>()
export const GIT_CACHE_MAX_SIZE = 100
// 2s — long enough to dedup rapid in-process callers, short enough that
// edits made by the user feel reflected on the next call.
export const GIT_CACHE_TTL_MS = 2_000

// Cached git binary path to avoid repeated PATH searches.
let _gitPath: string | undefined

export function getCachedGitDiff(key: string): string[] | undefined {
  const entry = gitDiffCache.get(key)
  if (!entry) {
    return undefined
  }
  if (Date.now() >= entry.expiresAt) {
    gitDiffCache.delete(key)
    return undefined
  }
  // Re-insert to mark as most-recently-used.
  gitDiffCache.delete(key)
  gitDiffCache.set(key, entry)
  return entry.result
}

/**
 * Get spawn arguments for different git diff operations.
 *
 * Prepares argument arrays for `spawn()`/`spawnSync()` calls that retrieve: -
 * `all`: All changed files (staged, unstaged, untracked) via `git status
 * --porcelain` - `unstaged`: Unstaged modifications via `git diff --name-only`
 * - `staged`: Staged changes via `git diff --cached --name-only`
 *
 * Automatically resolves symlinks in the provided `cwd` and enables shell mode
 * on Windows for proper command execution.
 *
 * @param cwd - Working directory for git operations, defaults to
 *   `process.cwd()`.
 *
 * @returns Object containing spawn arguments for all, unstaged, and staged
 *   operations.
 */
export function getGitDiffSpawnArgs(
  cwd?: string | undefined,
): GitDiffSpawnArgs {
  const resolvedCwd = cwd ? getCachedRealpath(cwd) : getCwd()
  return {
    all: [
      getGitPath(),
      ['status', '--porcelain'],
      {
        cwd: resolvedCwd,
      },
    ],
    unstaged: [
      getGitPath(),
      ['diff', '--name-only'],
      {
        cwd: resolvedCwd,
      },
    ],
    staged: [
      getGitPath(),
      ['diff', '--cached', '--name-only'],
      {
        cwd: resolvedCwd,
      },
    ],
  }
}

/**
 * Get the git executable path.
 *
 * Resolves the git binary path via PATH on first call and caches it. Falls back
 * to 'git' if not found in PATH.
 *
 * @example
 *   ;```typescript
 *   const git = getGitPath()
 *   // => '/usr/bin/git' or 'git' if not found
 *   ```
 *
 * @returns The git executable path (resolved from PATH on first call).
 */
export function getGitPath(): string {
  // Lazy-init second-call + 'git' fallback when which fails.
  /* c8 ignore start */
  if (_gitPath === undefined) {
    const resolved = whichSync('git', { nothrow: true })
    _gitPath = typeof resolved === 'string' ? resolved : 'git'
  }
  /* c8 ignore stop */
  return _gitPath
}

/**
 * Execute git diff command asynchronously and parse results.
 *
 * Internal helper for async git operations. Handles caching, command execution,
 * and result parsing. Returns empty array on git command failure.
 *
 * @param args - Spawn arguments tuple `[command, args, options]`.
 * @param options - Git diff options for caching and parsing.
 *
 * @returns Promise resolving to array of file paths.
 */
export async function innerDiff(
  args: SpawnArgs,
  options?: GitDiffOptions | undefined,
): Promise<string[]> {
  const { cache = true, ...parseOptions } = { __proto__: null, ...options }
  const cacheKey = cache ? stableKey({ args, parseOptions }) : undefined
  if (cache && cacheKey) {
    const result = getCachedGitDiff(cacheKey)
    if (result) {
      return result
    }
  }
  let result: string[]
  try {
    // Use stdioString: false to get raw Buffer, then convert ourselves to preserve exact output.
    const spawnResult = await spawn(args[0], args[1], {
      ...args[2],
      stdioString: false,
    })
    const stdout = BufferIsBuffer!(spawnResult.stdout)
      ? spawnResult.stdout.toString('utf8')
      : // String fallback only fires if spawn returns non-Buffer stdout.
        /* c8 ignore next */
        String(spawnResult.stdout)
    // Extract spawn cwd from args to pass to parser. Defensive type
    // guard; tests pass string cwd.
    /* c8 ignore start */
    const spawnCwd =
      typeof args[2]['cwd'] === 'string' ? args[2]['cwd'] : undefined
    /* c8 ignore stop */
    result = parseGitDiffStdout(stdout, parseOptions, spawnCwd)
  } catch (e) {
    // Git command failed. This is expected if:
    // - Not in a git repository
    // - Git is not installed
    // - Permission issues accessing .git directory
    // Log warning in debug mode for troubleshooting.
    debugNs(
      'git',
      `Git command failed (${args[0]} ${args[1].join(' ')}): ${(e as Error).message}`,
    )
    return []
  }
  if (cache && cacheKey) {
    setCachedGitDiff(cacheKey, result)
  }
  return result
}

/**
 * Execute git diff command synchronously and parse results.
 *
 * Internal helper for sync git operations. Handles caching, command execution,
 * and result parsing. Returns empty array on git command failure.
 *
 * @param args - Spawn arguments tuple `[command, args, options]`.
 * @param options - Git diff options for caching and parsing.
 *
 * @returns Array of file paths.
 */
export function innerDiffSync(
  args: SpawnArgs,
  options?: GitDiffOptions | undefined,
): string[] {
  const { cache = true, ...parseOptions } = { __proto__: null, ...options }
  const cacheKey = cache ? stableKey({ args, parseOptions }) : undefined
  if (cache && cacheKey) {
    const result = getCachedGitDiff(cacheKey)
    if (result) {
      return result
    }
  }
  let result: string[]
  try {
    // Use stdioString: false to get raw Buffer, then convert ourselves to preserve exact output.
    const spawnResult = spawnSync(args[0], args[1], {
      ...args[2],
      stdioString: false,
    })
    const stdout = BufferIsBuffer!(spawnResult.stdout)
      ? spawnResult.stdout.toString('utf8')
      : // String fallback only fires if spawn returns non-Buffer stdout.
        /* c8 ignore next */
        String(spawnResult.stdout)
    // Extract spawn cwd from args to pass to parser. Defensive type
    // guard; tests pass string cwd.
    /* c8 ignore start */
    const spawnCwd =
      typeof args[2]['cwd'] === 'string' ? args[2]['cwd'] : undefined
    /* c8 ignore stop */
    result = parseGitDiffStdout(stdout, parseOptions, spawnCwd)
  } catch (e) {
    // Git command failed. This is expected if:
    // - Not in a git repository
    // - Git is not installed
    // - Permission issues accessing .git directory
    // Log warning in debug mode for troubleshooting.
    debugNs(
      'git',
      `Git command failed (${args[0]} ${args[1].join(' ')}): ${(e as Error).message}`,
    )
    return []
  }
  if (cache && cacheKey) {
    setCachedGitDiff(cacheKey, result)
  }
  return result
}

/**
 * Parse git diff stdout output into file path array.
 *
 * Internal helper that processes raw git command output by: 1. Finding git
 * repository root from spawn cwd 2. Stripping ANSI codes and splitting into
 * lines 3. Parsing porcelain format status codes if requested 4. Normalizing
 * and optionally making paths absolute 5. Filtering paths based on cwd and glob
 * options.
 *
 * Git always returns paths relative to the repository root, regardless of where
 * the command was executed. This function handles the path resolution correctly
 * by finding the repo root and adjusting paths accordingly.
 *
 * @param stdout - Raw stdout from git command.
 * @param options - Git diff options for path processing.
 * @param spawnCwd - Working directory where git command was executed.
 *
 * @returns Array of processed file paths.
 */
export function parseGitDiffStdout(
  stdout: string,
  options?: GitDiffOptions | undefined,
  spawnCwd?: string | undefined,
): string[] {
  // spawnCwd-passed arm fires only when caller specifies cwd.
  /* c8 ignore next */
  const defaultRoot = spawnCwd ? findGitRoot(spawnCwd) : getCwd()
  const {
    absolute = false,
    cwd: cwdOption = defaultRoot,
    porcelain = false,
    ...matcherOptions
  } = { __proto__: null, ...options }
  const path = getPath()
  // Resolve cwd to handle symlinks (using cache for performance).
  const cwd =
    cwdOption === defaultRoot ? defaultRoot : getCachedRealpath(cwdOption)
  const rootPath = defaultRoot
  // Split into lines without trimming to preserve leading spaces in porcelain format.
  // Handle both LF (POSIX) and CRLF (Windows) — git on Windows emits CRLF by default.
  let rawFiles = stdout
    ? stripAnsi(stdout)
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(line => line)
    : []
  // Parse porcelain format: strip status codes.
  // Git status --porcelain format is: XY filename
  // where X and Y are single characters and there's a space before the filename.
  if (porcelain) {
    rawFiles = rawFiles.map(line => {
      // Short-line fallback fires only on malformed porcelain output.
      /* c8 ignore next */
      return line.length > 3 ? StringPrototypeSubstring(line, 3) : line
    })
  }
  const files = absolute
    ? rawFiles.map(relPath => normalizePath(path.join(rootPath, relPath)))
    : rawFiles.map(relPath => normalizePath(relPath))
  if (cwd === rootPath) {
    return files
  }
  const relPath = normalizePath(path.relative(rootPath, cwd))
  const matcher = getGlobMatcher([`${relPath}/**`], {
    ...(matcherOptions as {
      dot?: boolean
      ignore?: string[]
      nocase?: boolean
    }),
    absolute,
    cwd: rootPath,
  } as {
    absolute?: boolean
    cwd?: string
    dot?: boolean
    ignore?: string[]
    nocase?: boolean
  })
  const filtered: string[] = []
  for (const filepath of files) {
    if (matcher(filepath)) {
      filtered.push(filepath)
    }
  }
  return filtered
}

export function setCachedGitDiff(key: string, result: string[]): void {
  // LRU eviction triggers at GIT_CACHE_MAX_SIZE; not reachable from
  // typical test runs which exercise <10 distinct queries.
  /* c8 ignore start */
  if (gitDiffCache.size >= GIT_CACHE_MAX_SIZE) {
    const oldest = gitDiffCache.keys().next().value
    if (oldest !== undefined) {
      gitDiffCache.delete(oldest)
    }
  }
  /* c8 ignore stop */
  gitDiffCache.set(key, { expiresAt: Date.now() + GIT_CACHE_TTL_MS, result })
}

/**
 * Build a stable cache key that is insensitive to object-property insertion
 * order, so callers passing the same options with different shapes hit the same
 * cache slot.
 */
export function stableKey(value: unknown): string {
  return JSONStringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !ArrayIsArray(val)) {
      const sorted: Record<string, unknown> = {}
      for (const k of ObjectKeys(val as object).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k]
      }
      return sorted
    }
    return val
  })
}
