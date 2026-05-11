/**
 * @fileoverview Public type surface for the cross-cutting `env/*`
 * leaves split out of the legacy single-file `env.ts` — option bags
 * consumed by `envAsBoolean` / `envAsNumber` / `envAsString`. The
 * pre-existing concern-specific leaves in this directory (ci, debug,
 * github, …) keep their own ad-hoc types. Pure types, no runtime
 * side effects.
 */

/**
 * Options for `envAsBoolean`.
 */
export interface EnvAsBooleanOptions {
  /** Default when value is null/undefined. @default false */
  defaultValue?: boolean | undefined
  /**
   * Whether to trim whitespace from string values before matching. When
   * `false`, `'  true  '` is NOT recognised as truthy — only exact matches.
   * @default true
   */
  trim?: boolean | undefined
}

/**
 * Options for `envAsNumber`.
 */
export interface EnvAsNumberOptions {
  /**
   * Whether to return `±Infinity` when input parses to infinity. When
   * `false` (default), infinities and NaN are coerced to `defaultValue`.
   * @default false
   */
  allowInfinity?: boolean | undefined
  /** Default when value is not a finite number. @default 0 */
  defaultValue?: number | undefined
  /**
   * Parse mode. `'int'` (default) uses `parseInt(_, 10)` — integer only.
   * `'float'` uses `Number()` — decimals preserved.
   * @default 'int'
   */
  mode?: 'int' | 'float' | undefined
}

/**
 * Options for `envAsString`.
 */
export interface EnvAsStringOptions {
  /** Default when value is null/undefined. @default '' */
  defaultValue?: string | undefined
  /**
   * Whether to trim whitespace from string values. `true` (default) trims.
   * Set `false` to preserve whitespace (helpers.envAsString semantics).
   * @default true
   */
  trim?: boolean | undefined
}
