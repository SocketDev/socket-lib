/**
 * @file `getGlobMatcher` — picomatch-backed sync predicate with an LRU-memoized
 *   matcher cache. `getMatchesGlob` exposes Node 22+'s native
 *   `path.matchesGlob` for the rare case where the caller wants strict
 *   (`nocase: false`, `dot: false`) matching.
 */

import { ArrayIsArray } from '../primordials/array'
import { JSONStringify } from '../primordials/json'
import { ObjectKeys } from '../primordials/object'
import { StringPrototypeStartsWith } from '../primordials/string'

import { MATCHER_CACHE_MAX_SIZE, getPicomatch, matcherCache } from './_internal'

import type { Pattern } from './types'

// `path.matchesGlob` was added in Node v22.5.0 / v20.17.0 (Stable).
// Engines is >=22, so it's missing only on 22.0.x – 22.4.x.
// `_matchesGlob` caches the resolved native function; `_matchesGlobProbed`
// distinguishes "not yet probed" from "probed but absent".
let _matchesGlob: ((p: string, pattern: string) => boolean) | undefined
let _matchesGlobProbed = false

/**
 * Return a glob-matcher function, memoized by pattern + options.
 *
 * The returned function is a fast synchronous predicate built on picomatch.
 * Results are memoized — calling `getGlobMatcher(['*.ts'])` a thousand times in
 * a loop returns the same compiled matcher each time, so callers do not need to
 * hoist it themselves.
 *
 * The cache is LRU with a cap of 100 entries. Cache keys fold together the
 * (sorted) pattern list and (sorted) option set, so arguments that differ only
 * in ordering share a matcher.
 *
 * Default options: `dot: true`, `nocase: true`. Patterns starting with `!`
 * become ignore patterns.
 *
 * @example
 *   ;```typescript
 *   const isMatch = getGlobMatcher('*.ts')
 *   isMatch('index.ts') // true
 *   isMatch('index.js') // false
 *
 *   const isSource = getGlobMatcher(['src/**', '!**\/*.test.ts'])
 *   ```
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

  // LRU eviction triggers at 100 entries; not reachable from typical
  // test runs.
  /* c8 ignore start */
  if (matcherCache.size >= MATCHER_CACHE_MAX_SIZE) {
    const oldest = matcherCache.keys().next().value
    if (oldest !== undefined) {
      matcherCache.delete(oldest)
    }
  }
  /* c8 ignore stop */

  // Narrow `path.matchesGlob` fast-path. picomatch's defaults
  // (`dot: true`, `nocase: true`) silently differ from
  // `path.matchesGlob`'s behavior (case-sensitive, no dot match), so
  // taking the fast-path under those defaults silently changes
  // observable behavior — that's how the previous draft of this
  // file regressed the case-insensitive default and the dot-match
  // contract. Activate ONLY when the caller has explicitly opted
  // out of both defaults (`nocase: false` AND `dot: false`),
  // signaling "I want strict, case-sensitive, no-dotfile-match" —
  // which is exactly what `path.matchesGlob` provides. No caller in
  // the fleet does this today, but the path is correct + auditable.
  let matcher: ((path: string) => boolean) | undefined
  /* c8 ignore start */
  if (
    patterns.length === 1 &&
    !StringPrototypeStartsWith(patterns[0]!, '!') &&
    options !== undefined &&
    options.nocase === false &&
    options.dot === false &&
    (options.ignore === undefined || options.ignore.length === 0)
  ) {
    const matchesGlob = getMatchesGlob()
    if (matchesGlob !== undefined) {
      const pattern = patterns[0]!
      matcher = (p: string) => matchesGlob(p, pattern)
    }
  }
  /* c8 ignore stop */
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

    // External picomatch call
    /* c8 ignore start */
    const picomatch = getPicomatch()
    matcher = picomatch(
      positivePatterns.length > 0 ? positivePatterns : patterns,
      matchOptions,
    ) as (path: string) => boolean
    /* c8 ignore stop */
  }

  matcherCache.set(key, matcher)
  return matcher
}

/**
 * Resolve `path.matchesGlob` (or `undefined` if the runtime predates it).
 * Probes once and caches the result for every subsequent call.
 *
 * Used by `getGlobMatcher`'s narrow fast-path — see the conditions spelled out
 * at the call site. Exported for unit tests.
 *
 * @internal
 */
/*@__NO_SIDE_EFFECTS__*/
export function getMatchesGlob():
  | ((p: string, pattern: string) => boolean)
  | undefined {
  if (!_matchesGlobProbed) {
    const fn = /*@__PURE__*/ (
      require('node:path') as typeof import('node:path') & {
        matchesGlob?: unknown
      }
    ).matchesGlob
    // path.matchesGlob is present on Node 22+; missing-fn arm fires
    // only on older runtimes.
    /* c8 ignore start */
    if (typeof fn === 'function') {
      _matchesGlob = fn as (p: string, pattern: string) => boolean
    }
    /* c8 ignore stop */
    _matchesGlobProbed = true
  }
  return _matchesGlob
}
