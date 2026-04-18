/**
 * @fileoverview Environment variable parsing and conversion utilities.
 * Provides type-safe conversion functions for boolean, number, and string values.
 */

const NumberCtor = Number
// IMPORTANT: Do not use destructuring here - use direct assignment instead.
// tsgo has a bug that incorrectly transpiles destructured exports, resulting in
// `exports.SomeName = void 0;` which causes runtime errors.
// See: https://github.com/SocketDev/socket-packageurl-js/issues/3
const NumberIsFinite = Number.isFinite
const NumberIsNaN = Number.isNaN
const NumberParseInt = Number.parseInt
const StringCtor = String

// Common environment variables that have case sensitivity issues on Windows.
// These are checked with case-insensitive matching when exact matches fail.
const caseInsensitiveKeys = new Set([
  'APPDATA',
  'COMSPEC',
  'HOME',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'PROGRAMFILES',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
])

/**
 * Create a case-insensitive environment variable Proxy for Windows compatibility.
 * On Windows, environment variables are case-insensitive (PATH vs Path vs path).
 * This Proxy provides consistent access regardless of case, with priority given
 * to exact matches, then case-insensitive matches for known vars.
 *
 * **Use Cases:**
 * - Cross-platform test environments needing consistent env var access
 * - Windows compatibility when passing env to child processes
 * - Merging environment overrides while preserving case-insensitive lookups
 *
 * **Performance Note:**
 * Proxy operations have runtime overhead. Only use when Windows case-insensitive
 * access is required. For most use cases, process.env directly is sufficient.
 *
 * @param base - Base environment object (usually process.env)
 * @param overrides - Optional overrides to merge
 * @returns Proxy that handles case-insensitive env var access
 *
 * @example
 * // Create a Proxy with overrides
 * const env = createEnvProxy(process.env, { NODE_ENV: 'test' })
 * console.log(env.PATH)  // Works with any case: PATH, Path, path
 * console.log(env.NODE_ENV)  // 'test'
 *
 * @example
 * // Pass to child process spawn
 * import { createEnvProxy } from '@socketsecurity/lib/env'
 * import { spawn } from '@socketsecurity/lib/spawn'
 *
 * spawn('node', ['script.js'], {
 *   env: createEnvProxy(process.env, { NODE_ENV: 'test' })
 * })
 */
export function createEnvProxy(
  base: NodeJS.ProcessEnv,
  overrides?: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  function lookupEnvValue(prop: string): string | undefined {
    // Priority 1: Check overrides for exact match.
    if (overrides && prop in overrides) {
      return overrides[prop]
    }

    // Priority 2: Check base for exact match.
    if (prop in base) {
      return base[prop]
    }

    // Priority 3: Case-insensitive lookup for known keys.
    const upperProp = prop.toUpperCase()
    if (caseInsensitiveKeys.has(upperProp)) {
      // Check overrides with case variations.
      if (overrides) {
        const key = findCaseInsensitiveEnvKey(overrides, upperProp)
        if (key !== undefined) {
          return overrides[key]
        }
      }
      // Check base with case variations.
      const key = findCaseInsensitiveEnvKey(base, upperProp)
      if (key !== undefined) {
        return base[key]
      }
    }

    return undefined
  }

  return new Proxy({} as NodeJS.ProcessEnv, {
    get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined
      }
      return lookupEnvValue(prop)
    },

    ownKeys(_target) {
      const keys = new Set<string>([
        ...Object.keys(base),
        ...(overrides ? Object.keys(overrides) : []),
      ])
      return [...keys]
    },

    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined
      }

      // Use the same lookup logic as get().
      const value = lookupEnvValue(prop)
      return value !== undefined
        ? {
            enumerable: true,
            configurable: true,
            writable: true,
            value,
          }
        : undefined
    },

    has(_target, prop) {
      if (typeof prop !== 'string') {
        return false
      }

      // Check overrides.
      if (overrides && prop in overrides) {
        return true
      }

      // Check base.
      if (prop in base) {
        return true
      }

      // Case-insensitive check.
      const upperProp = prop.toUpperCase()
      if (caseInsensitiveKeys.has(upperProp)) {
        if (
          overrides &&
          findCaseInsensitiveEnvKey(overrides, upperProp) !== undefined
        ) {
          return true
        }
        if (findCaseInsensitiveEnvKey(base, upperProp) !== undefined) {
          return true
        }
      }

      return false
    },

    set(_target, prop, value) {
      if (typeof prop === 'string' && overrides) {
        overrides[prop] = value
        return true
      }
      return false
    },
  }) as NodeJS.ProcessEnv
}

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
 * Convert an environment variable value to a boolean.
 *
 * Back-compat overload: passing a bare boolean as the second argument is
 * equivalent to `{ defaultValue: B }`.
 *
 * @param value - The value to convert
 * @param defaultValueOrOptions - Default (boolean) or options object
 * @returns `true` if value is '1', 'true', or 'yes' (case-insensitive), `false` otherwise
 *
 * @example
 * ```typescript
 * import { envAsBoolean } from '@socketsecurity/lib/env'
 *
 * envAsBoolean('true')                     // true
 * envAsBoolean('1')                        // true
 * envAsBoolean('yes')                      // true
 * envAsBoolean('  true  ')                 // true (trimmed)
 * envAsBoolean('  true  ', { trim: false }) // false (strict)
 * envAsBoolean(undefined)                  // false
 * envAsBoolean(undefined, true)            // true (legacy positional default)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsBoolean(
  value: unknown,
  defaultValueOrOptions: boolean | EnvAsBooleanOptions | undefined = false,
): boolean {
  const opts: EnvAsBooleanOptions =
    typeof defaultValueOrOptions === 'boolean'
      ? { defaultValue: defaultValueOrOptions }
      : (defaultValueOrOptions ?? {})
  const { defaultValue = false, trim = true } = opts
  if (typeof value === 'string') {
    const candidate = trim ? value.trim() : value
    if (!candidate) {
      return !!defaultValue
    }
    const lower = candidate.toLowerCase()
    return lower === '1' || lower === 'true' || lower === 'yes'
  }
  if (value === null || value === undefined) {
    return !!defaultValue
  }
  return !!value
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
 * Convert an environment variable value to a number.
 *
 * Back-compat overload: passing a bare number as the second argument is
 * equivalent to `{ defaultValue: N }`.
 *
 * @param value - The value to convert
 * @param defaultValueOrOptions - Default (number) or options object
 * @returns The parsed number, or the default value if parsing fails
 *
 * @example
 * ```typescript
 * import { envAsNumber } from '@socketsecurity/lib/env'
 *
 * envAsNumber('3000')              // 3000 (int mode)
 * envAsNumber('3.14', { mode: 'float' }) // 3.14
 * envAsNumber('abc')               // 0
 * envAsNumber(undefined, 42)       // 42 (legacy positional default)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsNumber(
  value: unknown,
  defaultValueOrOptions: number | EnvAsNumberOptions | undefined = 0,
): number {
  const opts: EnvAsNumberOptions =
    typeof defaultValueOrOptions === 'number'
      ? { defaultValue: defaultValueOrOptions }
      : (defaultValueOrOptions ?? {})
  const { allowInfinity = false, defaultValue = 0, mode = 'int' } = opts

  // Fast-paths for the strict `string | undefined` shape (helpers semantics).
  if (value === undefined || value === null) {
    return defaultValue
  }
  if (typeof value === 'string') {
    if (!value) {
      return defaultValue
    }
    const num = mode === 'float' ? NumberCtor(value) : NumberParseInt(value, 10)
    if (NumberIsNaN(num)) {
      return defaultValue
    }
    if (!NumberIsFinite(num)) {
      return allowInfinity ? num : defaultValue
    }
    return num || 0
  }

  // Broad (unknown) path — coerce via String() then parse.
  const numOrNaN =
    mode === 'float'
      ? NumberCtor(String(value))
      : NumberParseInt(String(value), 10)
  const numMayBeNegZero = NumberIsFinite(numOrNaN)
    ? numOrNaN
    : NumberCtor(defaultValue)
  // Ensure -0 is treated as 0.
  return numMayBeNegZero || 0
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

/**
 * Convert an environment variable value to a string.
 *
 * Back-compat overload: passing a bare string as the second argument is
 * equivalent to `{ defaultValue: S }`.
 *
 * @param value - The value to convert
 * @param defaultValueOrOptions - Default (string) or options object
 * @returns The string value, or the default value
 *
 * @example
 * ```typescript
 * import { envAsString } from '@socketsecurity/lib/env'
 *
 * envAsString('  hello  ')                    // 'hello' (trimmed)
 * envAsString('  hello  ', { trim: false })   // '  hello  '
 * envAsString(undefined)                      // ''
 * envAsString(null, 'n/a')                    // 'n/a' (legacy positional)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsString(
  value: unknown,
  defaultValueOrOptions: string | EnvAsStringOptions | undefined = '',
): string {
  // Accept bare string OR any non-options value as positional default for
  // legacy compat (`envAsString(null, 123)` coerces to '123'). Options form
  // is detected by plain-object shape with known keys.
  const isOptionsObject =
    typeof defaultValueOrOptions === 'object' &&
    defaultValueOrOptions !== null &&
    !Array.isArray(defaultValueOrOptions) &&
    ('defaultValue' in defaultValueOrOptions || 'trim' in defaultValueOrOptions)
  const opts: EnvAsStringOptions = isOptionsObject
    ? (defaultValueOrOptions as EnvAsStringOptions)
    : {
        defaultValue:
          defaultValueOrOptions === undefined
            ? ''
            : typeof defaultValueOrOptions === 'string'
              ? defaultValueOrOptions
              : StringCtor(defaultValueOrOptions),
      }
  const { defaultValue = '', trim = true } = opts

  if (value === undefined || value === null) {
    return defaultValue === '' || !trim
      ? defaultValue
      : StringCtor(defaultValue).trim()
  }
  if (typeof value === 'string') {
    return trim ? value.trim() : value
  }
  const str = StringCtor(value)
  return trim ? str.trim() : str
}

/**
 * Find a case-insensitive environment variable key match.
 * Searches for an environment variable key that matches the given uppercase name,
 * using optimized fast-path checks to minimize expensive toUpperCase() calls.
 *
 * **Use Cases:**
 * - Finding PATH when env object has "Path" or "path"
 * - Cross-platform env var access where case may vary
 * - Custom case-insensitive env lookups
 *
 * **Performance:**
 * - Fast path: Checks length first (O(1)) before toUpperCase (expensive)
 * - Only converts to uppercase when length matches
 * - Early exit on first match
 *
 * @param env - Environment object or env-like record to search
 * @param upperEnvVarName - Uppercase environment variable name to find (e.g., 'PATH')
 * @returns The actual key from env that matches (e.g., 'Path'), or undefined
 *
 * @example
 * // Find PATH regardless of case
 * const envObj = { Path: 'C:\\Windows', NODE_ENV: 'test' }
 * const key = findCaseInsensitiveEnvKey(envObj, 'PATH')
 * console.log(key)  // 'Path'
 * console.log(envObj[key])  // 'C:\\Windows'
 *
 * @example
 * // Not found returns undefined
 * const key = findCaseInsensitiveEnvKey({}, 'MISSING')
 * console.log(key)  // undefined
 */
export function findCaseInsensitiveEnvKey(
  env: Record<string, string | undefined>,
  upperEnvVarName: string,
): string | undefined {
  const targetLength = upperEnvVarName.length
  for (const key of Object.keys(env)) {
    // Fast path: bail early if lengths don't match.
    if (key.length !== targetLength) {
      continue
    }
    // Only call toUpperCase if length matches.
    if (key.toUpperCase() === upperEnvVarName) {
      return key
    }
  }
  return undefined
}
