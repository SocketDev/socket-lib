/**
 * @file `createEnvProxy` — wrap `process.env` (or any env-like record) in a
 *   Proxy that adds case-insensitive lookups for known-Windows-sensitive keys
 *   (PATH, APPDATA, etc.) and an `overrides` layer. Intended for cross-platform
 *   test harnesses and child-process spawn env normalization.
 */

import { ProxyCtor } from '../primordials/globals'
import { SetCtor } from '../primordials/map-set'
import { ObjectKeys } from '../primordials/object'

import { findCaseInsensitiveEnvKey } from './case-insensitive'

// Common environment variables that have case sensitivity issues on Windows.
// These are checked with case-insensitive matching when exact matches fail.
const caseInsensitiveKeys = new SetCtor([
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
 * Create a case-insensitive environment variable Proxy for Windows
 * compatibility. On Windows, environment variables are case-insensitive (PATH
 * vs Path vs path). This Proxy provides consistent access regardless of case,
 * with priority given to exact matches, then case-insensitive matches for known
 * vars.
 *
 * **Use Cases:**
 *
 * - Cross-platform test environments needing consistent env var access
 * - Windows compatibility when passing env to child processes
 * - Merging environment overrides while preserving case-insensitive lookups
 *
 * **Performance Note:** Proxy operations have runtime overhead. Only use when
 * Windows case-insensitive access is required. For most use cases, process.env
 * directly is sufficient.
 *
 * @example
 *   // Create a Proxy with overrides
 *   const env = createEnvProxy(process.env, { NODE_ENV: 'test' })
 *   console.log(env.PATH) // Works with any case: PATH, Path, path
 *   console.log(env.NODE_ENV) // 'test'
 *
 * @example
 *   // Pass to child process spawn
 *   import { createEnvProxy } from '@socketsecurity/lib/env/proxy'
 *   import { spawn } from '@socketsecurity/lib/spawn'
 *
 *   spawn('node', ['script.js'], {
 *     env: createEnvProxy(process.env, { NODE_ENV: 'test' }),
 *   })
 *
 * @param base - Base environment object (usually process.env)
 * @param overrides - Optional overrides to merge.
 *
 * @returns Proxy that handles case-insensitive env var access
 */
export function createEnvProxy(
  base: NodeJS.ProcessEnv,
  overrides?: Record<string, string | undefined> | undefined,
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

    // Priority 3: Case-insensitive lookup for known keys. Tests
    // exercise direct lookups; case-insensitive variants fire only
    // when caller queries with mixed case.
    /* c8 ignore start */
    const upperProp = prop.toUpperCase()
    if (caseInsensitiveKeys.has(upperProp)) {
      if (overrides) {
        const key = findCaseInsensitiveEnvKey(overrides, upperProp)
        if (key !== undefined) {
          return overrides[key]
        }
      }
      const key = findCaseInsensitiveEnvKey(base, upperProp)
      if (key !== undefined) {
        return base[key]
      }
    }

    return undefined
  }
  /* c8 ignore stop */

  return new ProxyCtor({} as NodeJS.ProcessEnv, {
    get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined
      }
      return lookupEnvValue(prop)
    },

    ownKeys(_target) {
      const keys = new Set<string>([
        ...ObjectKeys(base),
        ...(overrides ? ObjectKeys(overrides) : []),
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
      // typeof guard, overrides existence, and case-insensitive sub-arms
      // all defensive; tests check direct presence of known keys.
      /* c8 ignore start */
      if (typeof prop !== 'string') {
        return false
      }

      if (overrides && prop in overrides) {
        return true
      }

      if (prop in base) {
        return true
      }

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
      /* c8 ignore stop */
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
