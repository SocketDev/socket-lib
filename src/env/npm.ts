/**
 * @fileoverview NPM environment variable getters.
 * Provides access to NPM and package manager environment variables.
 */

import { getEnvValue } from './rewire'

/**
 * npm_config_registry environment variable.
 * NPM registry URL configured by package managers.
 *
 * @returns The configured NPM registry URL, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getNpmConfigRegistry } from '@socketsecurity/lib/env/npm'
 *
 * const registry = getNpmConfigRegistry()
 * // e.g. 'https://registry.npmjs.org/' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNpmConfigRegistry(): string | undefined {
  return getEnvValue('npm_config_registry')
}

/**
 * npm_config_user_agent environment variable.
 * User agent string set by npm/pnpm/yarn package managers.
 *
 * @returns The package manager user agent string, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getNpmConfigUserAgent } from '@socketsecurity/lib/env/npm'
 *
 * const ua = getNpmConfigUserAgent()
 * // e.g. 'pnpm/9.0.0 npm/? node/v20.0.0 darwin arm64'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNpmConfigUserAgent(): string | undefined {
  return getEnvValue('npm_config_user_agent')
}

/**
 * npm_lifecycle_event environment variable.
 * The name of the npm lifecycle event that's currently running.
 *
 * @returns The current lifecycle event name, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getNpmLifecycleEvent } from '@socketsecurity/lib/env/npm'
 *
 * const event = getNpmLifecycleEvent()
 * // e.g. 'install', 'postinstall', or 'test'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNpmLifecycleEvent(): string | undefined {
  return getEnvValue('npm_lifecycle_event')
}

/**
 * NPM_REGISTRY environment variable.
 * NPM registry URL override.
 *
 * @returns The NPM registry URL override, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getNpmRegistry } from '@socketsecurity/lib/env/npm'
 *
 * const registry = getNpmRegistry()
 * // e.g. 'https://registry.npmjs.org/' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNpmRegistry(): string | undefined {
  return getEnvValue('NPM_REGISTRY')
}

/**
 * NPM_TOKEN environment variable.
 * Authentication token for NPM registry access.
 *
 * @returns The NPM auth token, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getNpmToken } from '@socketsecurity/lib/env/npm'
 *
 * const token = getNpmToken()
 * // e.g. 'npm_abc123...' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNpmToken(): string | undefined {
  return getEnvValue('NPM_TOKEN')
}
