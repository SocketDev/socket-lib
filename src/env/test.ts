/**
 * @fileoverview Test environment variable getters and detection.
 * Provides access to test framework environment variables and utilities.
 */

import { envAsBoolean, envAsString } from './helpers'
import { getNodeEnv } from './node-env'
import { getEnvValue } from './rewire'

/**
 * JEST_WORKER_ID environment variable.
 * Set when running tests with Jest.
 *
 * @returns The Jest worker ID string, or empty string if not set
 *
 * @example
 * ```typescript
 * import { getJestWorkerId } from '@socketsecurity/lib/env/test'
 *
 * const workerId = getJestWorkerId()
 * // e.g. '1' when running in Jest, or ''
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getJestWorkerId(): string {
  return envAsString(getEnvValue('JEST_WORKER_ID'))
}

/**
 * VITEST environment variable.
 * Set when running tests with Vitest.
 *
 * @returns `true` if running in Vitest, `false` otherwise
 *
 * @example
 * ```typescript
 * import { getVitest } from '@socketsecurity/lib/env/test'
 *
 * if (getVitest()) {
 *   console.log('Running in Vitest')
 * }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getVitest(): boolean {
  return envAsBoolean(getEnvValue('VITEST'))
}

/**
 * Check if code is running in a test environment.
 * Checks NODE_ENV, VITEST, and JEST_WORKER_ID.
 *
 * @returns `true` if running in a test environment, `false` otherwise
 *
 * @example
 * ```typescript
 * import { isTest } from '@socketsecurity/lib/env/test'
 *
 * if (isTest()) {
 *   console.log('Running in test environment')
 * }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isTest(): boolean {
  const nodeEnv = envAsString(getNodeEnv())
  return nodeEnv === 'test' || getVitest() || !!getJestWorkerId()
}
