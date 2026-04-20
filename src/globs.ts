/**
 * @fileoverview Glob pattern matching utilities with default ignore patterns.
 * Provides file filtering and glob matcher functions for npm-like behavior.
 */

import { objectFreeze as ObjectFreeze } from './objects'
import {
  LICENSE_GLOB,
  LICENSE_GLOB_RECURSIVE,
  LICENSE_ORIGINAL_GLOB_RECURSIVE,
} from './paths/globs'

import type * as fastGlobType from './external/fast-glob'
import type picomatchType from './external/picomatch'

// Type definitions
type Pattern = string

interface FastGlobOptions {
  absolute?: boolean
  baseNameMatch?: boolean
  braceExpansion?: boolean
  caseSensitiveMatch?: boolean
  concurrency?: number
  cwd?: string
  deep?: number
  dot?: boolean
  extglob?: boolean
  followSymbolicLinks?: boolean
  fs?: unknown
  globstar?: boolean
  ignore?: string[]
  ignoreFiles?: string[]
  markDirectories?: boolean
  objectMode?: boolean
  onlyDirectories?: boolean
  onlyFiles?: boolean
  stats?: boolean
  suppressErrors?: boolean
  throwErrorOnBrokenSymbolicLink?: boolean
  unique?: boolean
}

export interface GlobOptions extends FastGlobOptions {
  ignoreOriginals?: boolean
  recursive?: boolean
}

export type { Pattern, FastGlobOptions }

let _fastGlob: typeof fastGlobType | undefined
let _picomatch: typeof picomatchType | undefined

const MATCHER_CACHE_MAX_SIZE = 100
// LRU cache. We exploit Map's insertion-order iteration so eviction is O(1):
// delete the first key. On read, delete + set moves the entry to the back,
// keeping the cache in recency order.
const matcherCache = new Map<string, (path: string) => boolean>()

export const defaultIgnore = ObjectFreeze([
  // Most of these ignored files can be included specifically if included in the
  // files globs. Exceptions to this are:
  // https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files
  // These can NOT be included.
  // https://github.com/npm/npm-packlist/blob/v10.0.0/lib/index.js#L280
  '**/.git',
  '**/.npmrc',
  // '**/bun.lockb?',
  '**/node_modules',
  // '**/package-lock.json',
  // '**/pnpm-lock.ya?ml',
  // '**/yarn.lock',
  // Include npm-packlist defaults:
  // https://github.com/npm/npm-packlist/blob/v10.0.0/lib/index.js#L15-L38
  '**/.DS_Store',
  '**/.gitignore',
  '**/.hg',
  '**/.lock-wscript',
  '**/.npmignore',
  '**/.svn',
  '**/.wafpickle-*',
  '**/.*.swp',
  '**/._*/**',
  '**/archived-packages/**',
  '**/build/config.gypi',
  '**/CVS',
  '**/npm-debug.log',
  '**/*.orig',
  // Inline generic socket-registry .gitignore entries.
  '**/.env',
  '**/.eslintcache',
  '**/.nvm',
  '**/.tap',
  '**/.vscode',
  '**/*.tsbuildinfo',
  '**/Thumbs.db',
  // Inline additional ignores.
  '**/bower_components',
])

/*@__NO_SIDE_EFFECTS__*/
function getFastGlob() {
  if (_fastGlob === undefined) {
    _fastGlob = /*@__PURE__*/ require('./external/fast-glob.js')
  }
  return _fastGlob!
}

/*@__NO_SIDE_EFFECTS__*/
function getPicomatch() {
  if (_picomatch === undefined) {
    _picomatch = /*@__PURE__*/ require('./external/picomatch.js')
  }
  return _picomatch!
}

/**
 * Return a glob-matcher function, memoized by pattern + options.
 *
 * The returned function is a fast synchronous predicate built on picomatch.
 * Results are memoized — calling `getGlobMatcher(['*.ts'])` a thousand times
 * in a loop returns the same compiled matcher each time, so callers do not
 * need to hoist it themselves.
 *
 * The cache is LRU with a cap of 100 entries. Cache keys fold together the
 * (sorted) pattern list and (sorted) option set, so arguments that differ
 * only in ordering share a matcher.
 *
 * Default options: `dot: true`, `nocase: true`. Patterns starting with `!`
 * become ignore patterns.
 *
 * @example
 * ```typescript
 * const isMatch = getGlobMatcher('*.ts')
 * isMatch('index.ts')  // true
 * isMatch('index.js')  // false
 *
 * // With negation
 * const isSource = getGlobMatcher(['src/**', '!**\/*.test.ts'])
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGlobMatcher(
  glob: Pattern | Pattern[],
  options?: { dot?: boolean; nocase?: boolean; ignore?: string[] },
): (path: string) => boolean {
  const patterns = Array.isArray(glob) ? glob : [glob]
  // Create stable cache key by sorting patterns and option keys.
  // Option values that are arrays (e.g. `ignore: ['a', 'b']`) get sorted
  // element-wise so `['a', 'b']` and `['b', 'a']` hit the same entry —
  // otherwise equivalent matchers re-compile and evict each other under
  // the 100-entry cap.
  const sortedPatterns = [...patterns].sort()
  const sortedOptions = options
    ? Object.keys(options)
        .sort()
        .map(k => {
          const value = options[k as keyof typeof options]
          const normalized = Array.isArray(value) ? [...value].sort() : value
          return `${k}:${JSON.stringify(normalized)}`
        })
        .join(',')
    : ''
  const key = `${sortedPatterns.join('|')}:${sortedOptions}`
  const existing = matcherCache.get(key)
  if (existing) {
    // Re-insert to mark as most-recently-used.
    matcherCache.delete(key)
    matcherCache.set(key, existing)
    return existing
  }

  // Evict oldest entry if cache is full (Map iteration order = insertion order).
  if (matcherCache.size >= MATCHER_CACHE_MAX_SIZE) {
    const oldest = matcherCache.keys().next().value
    if (oldest !== undefined) {
      matcherCache.delete(oldest)
    }
  }

  // Separate positive and negative patterns.
  const positivePatterns = patterns.filter(p => !p.startsWith('!'))
  const negativePatterns = patterns
    .filter(p => p.startsWith('!'))
    .map(p => p.slice(1))

  // Use ignore option for negation patterns.
  const matchOptions = {
    dot: true,
    nocase: true,
    ...options,
    ...(negativePatterns.length > 0 ? { ignore: negativePatterns } : {}),
  }

  /* c8 ignore next 5 - External picomatch call */
  const picomatch = getPicomatch()
  const matcher = picomatch(
    positivePatterns.length > 0 ? positivePatterns : patterns,
    matchOptions,
  ) as (path: string) => boolean

  matcherCache.set(key, matcher)
  return matcher
}

/**
 * Asynchronously find files matching glob patterns.
 * Wrapper around fast-glob.
 *
 * @example
 * ```typescript
 * const files = await glob('src/*.ts', { cwd: '/tmp/project' })
 * console.log(files) // ['src/index.ts', 'src/utils.ts']
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function glob(
  patterns: Pattern | Pattern[],
  options?: FastGlobOptions,
): Promise<string[]> {
  /* c8 ignore next - External fast-glob call */
  const fastGlob = getFastGlob()
  return fastGlob.glob(patterns, options as import('fast-glob').Options)
}

/**
 * Create a stream of license file paths matching glob patterns.
 *
 * @example
 * ```typescript
 * const stream = globStreamLicenses('/tmp/my-package')
 * for await (const licensePath of stream) {
 *   console.log(licensePath)
 * }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function globStreamLicenses(
  dirname: string,
  options?: GlobOptions,
): NodeJS.ReadableStream {
  const {
    ignore: ignoreOpt,
    ignoreOriginals,
    recursive,
    ...globOptions
  } = { __proto__: null, ...options } as GlobOptions
  const ignore = [
    ...(Array.isArray(ignoreOpt) ? ignoreOpt : defaultIgnore),
    '**/*.{cjs,cts,js,json,mjs,mts,ts}',
  ]
  if (ignoreOriginals) {
    ignore.push(LICENSE_ORIGINAL_GLOB_RECURSIVE)
  }
  /* c8 ignore start - External fast-glob call */
  const fastGlob = getFastGlob()
  return fastGlob.globStream(
    [recursive ? LICENSE_GLOB_RECURSIVE : LICENSE_GLOB],
    {
      __proto__: null,
      absolute: true,
      caseSensitiveMatch: false,
      cwd: dirname,
      ...globOptions,
      ...(ignore ? { ignore } : {}),
    } as import('fast-glob').Options,
  )
  /* c8 ignore stop */
}

/**
 * Synchronously find files matching glob patterns.
 * Wrapper around fast-glob.sync.
 *
 * @example
 * ```typescript
 * const files = globSync('*.json', { cwd: '/tmp/project' })
 * console.log(files) // ['package.json', 'tsconfig.json']
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function globSync(
  patterns: Pattern | Pattern[],
  options?: FastGlobOptions,
): string[] {
  /* c8 ignore next - External fast-glob call */
  const fastGlob = getFastGlob()
  return fastGlob.globSync(patterns, options as import('fast-glob').Options)
}
