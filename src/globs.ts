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
import { fromAsync } from './promises'

import type * as fastGlobType from './external/fast-glob'
import type picomatchType from './external/picomatch'

import {
  ArrayCtor,
  ArrayIsArray,
  JSONStringify,
  MapCtor,
  ObjectKeys,
  StringPrototypeCharCodeAt,
  StringPrototypeStartsWith,
} from './primordials'

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
let _fs: typeof import('node:fs') | undefined
let _fsPromises: typeof import('node:fs/promises') | undefined
let _path: typeof import('node:path') | undefined
let _picomatch: typeof picomatchType | undefined
// `path.matchesGlob` was added in Node v22.5.0 / v20.17.0 (Stable).
// Engines is >=22, so it's missing only on 22.0.x – 22.4.x.
// `_matchesGlob` is the resolved native function (or `undefined` if
// absent or not yet probed). `_matchesGlobProbed` distinguishes the
// two cases so a missing native is detected only once.
let _matchesGlob: ((p: string, pattern: string) => boolean) | undefined
let _matchesGlobProbed = false

/**
 * Lazily load the fs module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load the fs/promises module to avoid Webpack errors.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFsPromises() {
  if (_fsPromises === undefined) {
    _fsPromises = /*@__PURE__*/ require('node:fs/promises')
  }
  return _fsPromises as typeof import('node:fs/promises')
}

/**
 * Lazily load the path module to avoid Webpack errors.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Resolve `path.matchesGlob` (or `undefined` if the runtime predates it).
 * Probes once and caches the result for every subsequent call.
 *
 * Exported for unit tests; not part of the public API.
 *
 * @internal
 */
/*@__NO_SIDE_EFFECTS__*/
export function getMatchesGlob():
  | ((p: string, pattern: string) => boolean)
  | undefined {
  if (!_matchesGlobProbed) {
    const fn = (
      getPath() as typeof import('node:path') & {
        matchesGlob?: unknown
      }
    ).matchesGlob
    if (typeof fn === 'function') {
      _matchesGlob = fn as (p: string, pattern: string) => boolean
    }
    _matchesGlobProbed = true
  }
  return _matchesGlob
}

// Builtin glob support. Engines is >=22 so:
//   `fs.glob` / `fs.globSync` / `fs.promises.glob` — added v22.0.0
//     (Stable). Always present. Supports { cwd, exclude,
//     withFileTypes }. Lacks fast-glob's `absolute`, `onlyFiles`,
//     `dot`, `caseSensitiveMatch`, `followSymbolicLinks`, etc., so we
//     only delegate when the caller passes no unsupported options.
//
//   `path.matchesGlob(path, pattern)` — added v22.5.0 / v20.17.0
//     (Stable). Not present on Node 22.0.x – 22.4.x, so feature-detect
//     at the call site. Single string pattern only; no negation, no
//     dot/nocase options. Used only for the trivial single-pattern,
//     no-options matcher case.

const MATCHER_CACHE_MAX_SIZE = 100
// LRU cache. We exploit Map's insertion-order iteration so eviction is O(1):
// delete the first key. On read, delete + set moves the entry to the back,
// keeping the cache in recency order.
const matcherCache = new MapCtor<string, (path: string) => boolean>()

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

// ─────────────────────────────────────────────────────────────────────
// Trailing-slash workaround for fast-glob ignore patterns
// ─────────────────────────────────────────────────────────────────────
//
// TL;DR: when you pass `ignore: ['**/dist/']` to fast-glob, the `dist`
// directory still gets walked. Strip the trailing slash before passing
// it to fast-glob and the ignore actually takes effect.
//
// Why this exists
// ───────────────
// The gitignore convention is to write directory entries with a
// trailing slash: `dist/`, `node_modules/`, `coverage/`. Tools that
// translate gitignore lines into glob patterns (including socket-cli's
// `globWithGitIgnore` helper, npm-packlist, etc.) preserve that slash —
// you'd expect the pattern to mean "this is a directory to ignore."
//
// fast-glob has TWO independent filters that decide whether a file
// shows up in results, and they handle the trailing slash differently:
//
//   1. The DEEP filter decides whether to walk INTO a candidate
//      directory at all. This is the one that matters for performance:
//      if the deep filter says "skip dist", fast-glob never reads
//      300k entries inside it. The deep filter compiles
//      `**/dist/` into a regex that requires a trailing slash on the
//      input, but it tests `entryPath = 'dist'` (no slash, because
//      readdir entries don't include one). So the regex doesn't match,
//      the deep filter doesn't see it as a hit, and fast-glob walks in
//      anyway — wasting an entire `readdir` of the subtree.
//      → see fast-glob's `src/providers/filters/deep.ts`.
//
//   2. The ENTRY filter decides whether each individual entry returned
//      from the walk should appear in results. As of v4 the entry
//      filter retries with a trailing slash appended for directory
//      entries, so it correctly ignores `dist/b.json` once it's been
//      enumerated.
//      → see fast-glob's `src/providers/filters/entry.ts` lines
//        ~110–125 (the "// A pattern with a trailling slash can be
//        used for directory matching." block).
//
// Net effect: a `dist/` ignore pattern correctly removes `dist`
// contents from the RESULT array, but only AFTER fast-glob has walked
// the entire subtree. On a 300k-file `dist/` under tight memory
// (`--max-old-space-size=128`) this is the difference between
// "instant" and "OOM kill". socket-cli's `globWithGitIgnore` ran into
// exactly this; see the bug-hunt narrative at
// https://github.com/SocketDev/socket-cli/pull/1288.
//
// fast-glob upstream is undermaintained: v3.3.3 was cut Jan 2025, no
// v3.4.0 cut yet, and issue
// https://github.com/mrmlnc/fast-glob/issues/437 ("Directory globs
// with and without trailing slash in ignore patterns have different
// results") closed without a fix. v4 is unreleased and only fixes the
// entry filter, not the deep filter — so stripping the trailing slash
// at our call sites stays the correct workaround for the foreseeable
// future.
//
// Why a workaround instead of a fork
// ──────────────────────────────────
// Stripping the trailing slash makes the pattern shape `**/dist`,
// which both the deep and entry filters interpret correctly: the deep
// filter's regex matches `entryPath = 'dist'` and skips the walk
// entirely. Same end result as the gitignore-style pattern was
// supposed to express, just with the form fast-glob actually honors.

// charCode 47 is `/`. Reading it that way avoids a per-call string
// allocation for the literal — primordials-friendly, no behavior
// change vs. `pattern.endsWith('/')`. StringPrototypeCharCodeAt is
// the uncurried form so the prototype method can't be hijacked by
// a user-mutated `String.prototype.charCodeAt`.
function stripTrailingSlash(pattern: string): string {
  if (
    pattern.length > 1 &&
    StringPrototypeCharCodeAt(pattern, pattern.length - 1) === 47 /*'/'*/
  ) {
    return pattern.slice(0, -1)
  }
  return pattern
}

// Normalize a user-provided ignore array by running every entry
// through stripTrailingSlash. Returns undefined when `ignore` is not
// an array so callers can skip merging the option entirely.
//
// Uses a pre-sized for-loop instead of `.map`: socket-lib uses
// primordials (the prototype `Array.prototype.map` can be intercepted
// or replaced by user code at module load), and a hand-rolled loop is
// also marginally faster — no callback indirection, no growth of the
// result array.
function normalizeIgnorePatterns(ignore: unknown): string[] | undefined {
  if (!ArrayIsArray(ignore)) {
    return undefined
  }
  const source = ignore as string[]
  const { length } = source
  const normalized = new ArrayCtor(length) as string[]
  for (let i = 0; i < length; i++) {
    normalized[i] = stripTrailingSlash(source[i]!)
  }
  return normalized
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
  const patterns = ArrayIsArray(glob) ? glob : [glob]
  // Create stable cache key by sorting patterns and option keys.
  // Option values that are arrays (e.g. `ignore: ['a', 'b']`) get sorted
  // element-wise so `['a', 'b']` and `['b', 'a']` hit the same entry —
  // otherwise equivalent matchers re-compile and evict each other under
  // the 100-entry cap.
  const sortedPatterns = [...patterns].sort()
  const sortedOptions = options
    ? ObjectKeys(options)
        .sort()
        .map(k => {
          const value = options[k as keyof typeof options]
          const normalized = ArrayIsArray(value) ? [...value].sort() : value
          return `${k}:${JSONStringify(normalized)}`
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

  // Fast path: single non-negated pattern, no ignore, no options that
  // change semantics → use Node's builtin `path.matchesGlob`. Added in
  // v22.5.0 / v20.17.0 (Stable). Skips loading picomatch entirely.
  // Bail out if the caller asks for `dot: false` or `nocase: false`,
  // since matchesGlob doesn't expose those toggles. `matchesGlob` is
  // missing on 22.0.x – 22.4.x, so feature-detect.
  let matcher: ((path: string) => boolean) | undefined
  if (
    patterns.length === 1 &&
    !StringPrototypeStartsWith(patterns[0]!, '!') &&
    (!options ||
      ((options.ignore === undefined || options.ignore.length === 0) &&
        options.dot !== false &&
        options.nocase !== false))
  ) {
    const matchesGlob = getMatchesGlob()
    if (matchesGlob !== undefined) {
      const pattern = patterns[0]!
      matcher = (p: string) => matchesGlob(p, pattern)
    }
  }
  if (matcher === undefined) {
    // Separate positive and negative patterns.
    const positivePatterns = patterns.filter(
      p => !StringPrototypeStartsWith(p, '!'),
    )
    const negativePatterns = patterns
      .filter(p => StringPrototypeStartsWith(p, '!'))
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
    matcher = picomatch(
      positivePatterns.length > 0 ? positivePatterns : patterns,
      matchOptions,
    ) as (path: string) => boolean
  }

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
/**
 * Whether the caller's option bag is fully expressible with
 * `node:fs.glob` (`cwd` + `exclude`). Any other option means we must
 * fall back to fast-glob, which exposes the wider surface.
 *
 * Exported for unit tests; not part of the public API.
 *
 * @internal
 */
export function canUseNodeFsGlob(
  options: FastGlobOptions | undefined,
): boolean {
  if (!options) {
    return true
  }
  for (const key of ObjectKeys(options)) {
    if (key !== 'cwd' && key !== 'ignore') {
      return false
    }
  }
  return true
}

/*@__NO_SIDE_EFFECTS__*/
export function glob(
  patterns: Pattern | Pattern[],
  options?: FastGlobOptions,
): Promise<string[]> {
  // Strip trailing slashes from ignore patterns before fast-glob sees
  // them; otherwise `dist/` from a .gitignore-derived list silently
  // walks the whole subtree. See the stripTrailingSlash header above.
  const normalizedIgnore = normalizeIgnorePatterns(options?.ignore)
  // Prefer node:fs/promises.glob (added v22.0.0, Stable) when the
  // option surface lines up. Avoids loading fast-glob entirely.
  if (canUseNodeFsGlob(options)) {
    return fromAsync(
      getFsPromises().glob(patterns as string | readonly string[], {
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(normalizedIgnore ? { exclude: normalizedIgnore } : {}),
      }),
    )
  }
  /* c8 ignore next - External fast-glob call */
  const fastGlob = getFastGlob()
  return fastGlob.glob(patterns, {
    ...(options as import('fast-glob').Options),
    ...(normalizedIgnore ? { ignore: normalizedIgnore } : {}),
  })
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
  // Caller-supplied ignore arrays may contain gitignore-style
  // directory patterns (`dist/`); normalize them. Our defaultIgnore
  // entries are already trailing-slash-free, so we can use them
  // as-is. See stripTrailingSlash header above for why this matters.
  const baseIgnore = ArrayIsArray(ignoreOpt)
    ? normalizeIgnorePatterns(ignoreOpt)!
    : (defaultIgnore as readonly string[] as string[])
  const ignore: string[] = [...baseIgnore, '**/*.{cjs,cts,js,json,mjs,mts,ts}']
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
  // Strip trailing slashes from ignore patterns; same workaround as
  // the async `glob` above, see stripTrailingSlash header.
  const normalizedIgnore = normalizeIgnorePatterns(options?.ignore)
  // Prefer node:fs.globSync (added v22.0.0, Stable) when the option
  // surface lines up. Avoids loading fast-glob entirely.
  if (canUseNodeFsGlob(options)) {
    return [
      ...getFs().globSync(patterns as string | readonly string[], {
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(normalizedIgnore ? { exclude: normalizedIgnore } : {}),
      }),
    ] as string[]
  }
  /* c8 ignore next - External fast-glob call */
  const fastGlob = getFastGlob()
  return fastGlob.globSync(patterns, {
    ...(options as import('fast-glob').Options),
    ...(normalizedIgnore ? { ignore: normalizedIgnore } : {}),
  })
}
