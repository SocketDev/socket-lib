/**
 * @file Public type surface for `cacache/*` modules — the `CacheEntry` row
 *   shape returned by reads and the option bags consumed by `clear` / `get` /
 *   `put`. Pure types, no runtime side effects.
 */

export interface GetOptions {
  integrity?: string | undefined
  size?: number | undefined
  memoize?: boolean | undefined
}

export interface PutOptions {
  integrity?: string | undefined
  size?: number | undefined
  metadata?: unknown | undefined
  memoize?: boolean | undefined
}

export interface CacheEntry {
  data: Buffer
  integrity: string
  key: string
  metadata?: unknown | undefined
  path: string
  size: number
  time: number
}

export interface RemoveOptions {
  /**
   * Optional key prefix to filter removals. If provided, only keys starting
   * with this prefix will be removed. Can include wildcards (*) for pattern
   * matching.
   *
   * @example
   *   { prefix: 'socket-sdk' } // Simple prefix
   *   { prefix: 'socket-sdk:scans:abc*' } // With wildcard
   */
  prefix?: string | undefined
}
