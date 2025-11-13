/**
 * @fileoverview XDG Base Directory Specification environment variable getters.
 * Provides access to XDG user directories on Unix systems.
 */

import { getEnvValue } from '#env/rewire'

/**
 * XDG_CACHE_HOME environment variable.
 * XDG Base Directory specification cache directory.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getXdgCacheHome(): string | undefined {
  return getEnvValue('XDG_CACHE_HOME')
}

/**
 * XDG_CONFIG_HOME environment variable.
 * XDG Base Directory specification config directory.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getXdgConfigHome(): string | undefined {
  return getEnvValue('XDG_CONFIG_HOME')
}

/**
 * XDG_DATA_HOME environment variable.
 * Points to the user's data directory on Unix systems.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getXdgDataHome(): string | undefined {
  return getEnvValue('XDG_DATA_HOME')
}
