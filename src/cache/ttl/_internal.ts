/**
 * @file Private internals shared by the `cache/ttl/*` stores — the TTL /
 *   prefix / memo-cap defaults, the clock-skew-aware expiry predicate, the
 *   wildcard key matcher, and the LRU insertion-order setter. One owner so the
 *   node store (`./store`, cacache-backed) and the browser store
 *   (`./browser`, adapter-backed) cannot drift on expiry or matching
 *   semantics. Pure helpers over primordials only — no `node:*`, no
 *   `process`, so both stores stay importable from browser bundles.
 */

import { DateNow } from '../../primordials/date'
import { RegExpCtor, RegExpPrototypeTest } from '../../primordials/regexp'
import {
  StringPrototypeReplaceAll,
  StringPrototypeStartsWith,
} from '../../primordials/string'

import type { TtlCacheEntry } from './types'

export const DEFAULT_MEMO_MAX_SIZE = 1000

export const DEFAULT_PREFIX = 'ttl-cache'

// 5 minutes.
export const DEFAULT_TTL_MS = 5 * 60 * 1000

// Entries whose expiresAt sits more than this far past the expected expiry
// horizon (now + ttl) are treated as expired — clock skew or corruption.
const MAX_FUTURE_SKEW_MS = 10_000

/**
 * Create a matcher for a key pattern (with wildcard support) against FULL
 * (prefixed) cache keys. Without a wildcard the pattern is a plain prefix
 * match; with wildcards the pattern is anchored both ends so `foo*bar`
 * matches exactly `foo<anything>bar`.
 */
export function createKeyMatcher(
  prefix: string,
  pattern: string,
): (fullKey: string) => boolean {
  const fullPattern = `${prefix}:${pattern}`

  if (!pattern.includes('*')) {
    // Simple prefix matching (fast path).
    return (fullKey: string) => StringPrototypeStartsWith(fullKey, fullPattern)
  }

  // Wildcard matching with regex. Escape regex metacharacters, then widen
  // each `*` to `.*`.
  const escaped = StringPrototypeReplaceAll(
    fullPattern,
    /[.+?^${}()|[\]\\]/g,
    '\\$&',
  )
  const regexPattern = StringPrototypeReplaceAll(escaped, '*', '.*')
  const regex = new RegExpCtor(`^${regexPattern}$`)
  return (fullKey: string) => RegExpPrototypeTest(regex, fullKey)
}

/**
 * Check if an entry is expired for the given ttl. Also detects clock skew by
 * treating a suspiciously far-future `expiresAt` (more than 10 seconds past
 * the expected `now + ttl` horizon) as expired.
 */
export function isExpiredEntry(
  entry: TtlCacheEntry<unknown>,
  ttl: number,
): boolean {
  const now = DateNow()
  if (entry.expiresAt > now + ttl + MAX_FUTURE_SKEW_MS) {
    return true
  }
  return now > entry.expiresAt
}

/**
 * Set an entry in a memo Map capped at `maxSize`, using the Map's
 * insertion-order semantics as the LRU list: an existing key is deleted first
 * so the re-insert moves it to the tail, and when the cap is hit the oldest
 * entry (first key in iteration order) is evicted.
 */
export function lruSet(
  map: Map<string, TtlCacheEntry<unknown>>,
  maxSize: number,
  key: string,
  entry: TtlCacheEntry<unknown>,
): void {
  if (map.has(key)) {
    map.delete(key)
  } else if (map.size >= maxSize) {
    const oldest = map.keys().next().value
    // The size>=maxSize guard guarantees a defined first key; the undefined
    // branch is defensive.
    /* c8 ignore start - defensive unreachable branch */
    if (oldest === undefined) {
      return
    }
    /* c8 ignore stop */
    map.delete(oldest)
  }
  map.set(key, entry)
}
