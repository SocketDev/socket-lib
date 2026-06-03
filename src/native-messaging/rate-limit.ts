/**
 * @file Token-bucket rate limit for the Chrome native-messaging host.
 *
 *   Why this exists:
 *
 *     A Chrome extension that has been hijacked (XSS in a content script, a
 *     compromised CDN dependency) can call `chrome.runtime.connectNative()`
 *     in a tight loop. Without a rate limit, the attacker can request our
 *     `get-api-token` message thousands of times a second — useful for
 *     scraping tokens from a multi-account user, or for keeping the bearer
 *     "fresh" in the page's memory after the user navigates away.
 *
 *     The bucket gives each origin (`chrome-extension://<id>/`, passed by
 *     Chrome as `process.argv[2]`) a budget. Burst is allowed; sustained
 *     hammering is denied with `{ error: 'rate limited' }`. A typing-fast
 *     human never sees the limit; a botted extension hits it on its second
 *     line of attack.
 *
 *   Why in-memory:
 *
 *     The NM host is a per-Chrome-launch subprocess — restarting Chrome
 *     restarts the bucket. That's exactly what we want: an attacker who
 *     can force Chrome to relaunch has bigger problems than rate-limiting.
 *
 *   Shape patterned after pilcrow's `ratelimit/limit.go` — minimal,
 *   in-memory, LRU-evicts at `maxKeys`. The fleet's `socket-lib` already
 *   has a TTL-cache module but it's overkill for this one use case;
 *   a 50-line bucket is easier to audit.
 */

import { ErrorCtor } from '../primordials/error'

export interface TokenBucketOptions {
  /**
   * How many tokens fit in a single bucket. The first `capacity` requests
   * from an origin pass without blocking; the (capacity + 1)th request only
   * passes if at least one refill interval has elapsed since the last
   * refill checkpoint.
   */
  capacity: number
  /**
   * How many milliseconds it takes for one token to refill. With
   * `capacity: 60` and `refillIntervalMs: 1000`, an origin gets up to 60
   * requests of burst plus a steady-state 1 req/s.
   */
  refillIntervalMs: number
  /**
   * Maximum number of distinct keys (origins) to track at once. When the
   * map fills, the least-recently-touched key is evicted. Caps memory
   * against an attacker that varies the key on every request.
   */
  maxKeys: number
}

interface BucketEntry {
  tokens: number
  lastRefillAt: number
  // Linked-list pointers for LRU eviction. `null` at the ends.
  newer: BucketEntry | undefined
  older: BucketEntry | undefined
  key: string
}

export class TokenBucketLimiter {
  readonly #capacity: number
  readonly #refillIntervalMs: number
  readonly #maxKeys: number
  readonly #buckets = new Map<string, BucketEntry>()
  #newest: BucketEntry | undefined = undefined
  #oldest: BucketEntry | undefined = undefined

  constructor(options: TokenBucketOptions) {
    if (options.capacity < 1) {
      throw new ErrorCtor('capacity must be >= 1')
    }
    if (options.refillIntervalMs <= 0) {
      throw new ErrorCtor('refillIntervalMs must be > 0')
    }
    if (options.maxKeys < 1) {
      throw new ErrorCtor('maxKeys must be >= 1')
    }
    this.#capacity = options.capacity
    this.#refillIntervalMs = options.refillIntervalMs
    this.#maxKeys = options.maxKeys
  }

  /**
   * Try to consume one token for `key`. Returns `true` when the request
   * is allowed; `false` when the bucket is empty and not enough time has
   * elapsed to refill.
   *
   * `now` is injectable so tests can advance the virtual clock without
   * sleeping. In production callers pass `Date.now()` (the default).
   */
  consume(key: string, now: number = Date.now()): boolean {
    let entry = this.#buckets.get(key)
    if (entry === undefined) {
      entry = this.#createEntry(key, now)
      return entry.tokens >= 0
    }
    // Refill based on elapsed time since the last bookkeeping moment.
    const elapsed = now - entry.lastRefillAt
    if (elapsed > 0) {
      const refill = Math.floor(elapsed / this.#refillIntervalMs)
      if (refill > 0) {
        entry.tokens = Math.min(this.#capacity, entry.tokens + refill)
        entry.lastRefillAt += refill * this.#refillIntervalMs
      }
    }
    this.#touch(entry)
    if (entry.tokens <= 0) {
      return false
    }
    entry.tokens -= 1
    return true
  }

  /**
   * Test-only inspector. Returns the current token count for `key`, or
   * `undefined` if `key` has never been seen.
   */
  peek(key: string): number | undefined {
    return this.#buckets.get(key)?.tokens
  }

  /**
   * Test-only inspector. Returns the current number of tracked keys.
   */
  size(): number {
    return this.#buckets.size
  }

  #createEntry(key: string, now: number): BucketEntry {
    // Evict the oldest if we're at capacity.
    if (this.#buckets.size >= this.#maxKeys && this.#oldest) {
      const evicted = this.#oldest
      this.#buckets.delete(evicted.key)
      this.#oldest = evicted.newer
      if (this.#oldest) {
        this.#oldest.older = undefined
      } else {
        this.#newest = undefined
      }
    }
    const entry: BucketEntry = {
      key,
      // Spend one token immediately for this admit.
      tokens: this.#capacity - 1,
      lastRefillAt: now,
      newer: undefined,
      older: this.#newest,
    }
    if (this.#newest) {
      this.#newest.newer = entry
    } else {
      this.#oldest = entry
    }
    this.#newest = entry
    this.#buckets.set(key, entry)
    return entry
  }

  // Move `entry` to the newest position in the LRU chain so it's
  // last-to-evict. Called on every consume so active origins stay hot.
  #touch(entry: BucketEntry): void {
    if (this.#newest === entry) {
      return
    }
    // Unlink from current position.
    if (entry.older) {
      entry.older.newer = entry.newer
    } else {
      this.#oldest = entry.newer
    }
    if (entry.newer) {
      entry.newer.older = entry.older
    }
    // Re-link at the newest end.
    entry.older = this.#newest
    entry.newer = undefined
    if (this.#newest) {
      this.#newest.newer = entry
    }
    this.#newest = entry
  }
}
