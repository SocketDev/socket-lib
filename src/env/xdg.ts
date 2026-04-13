/**
 * @fileoverview XDG Base Directory Specification environment variable getters.
 * Provides access to XDG user directories on Unix systems.
 */

import { getEnvValue } from './rewire'

/**
 * XDG_CACHE_HOME environment variable.
 * XDG Base Directory specification cache directory.
 *
 * @returns The XDG cache directory path, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getXdgCacheHome } from '@socketsecurity/lib/env/xdg'
 *
 * const cacheDir = getXdgCacheHome()
 * // e.g. '/tmp/.cache' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getXdgCacheHome(): string | undefined {
  return getEnvValue('XDG_CACHE_HOME')
}

/**
 * XDG_CONFIG_HOME environment variable.
 * XDG Base Directory specification config directory.
 *
 * @returns The XDG config directory path, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getXdgConfigHome } from '@socketsecurity/lib/env/xdg'
 *
 * const configDir = getXdgConfigHome()
 * // e.g. '/tmp/.config' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getXdgConfigHome(): string | undefined {
  return getEnvValue('XDG_CONFIG_HOME')
}

/**
 * XDG_DATA_HOME environment variable.
 * Points to the user's data directory on Unix systems.
 *
 * @returns The XDG data directory path, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getXdgDataHome } from '@socketsecurity/lib/env/xdg'
 *
 * const dataDir = getXdgDataHome()
 * // e.g. '/tmp/.local/share' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getXdgDataHome(): string | undefined {
  return getEnvValue('XDG_DATA_HOME')
}
