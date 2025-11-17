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
 */
/*@__NO_SIDE_EFFECTS__*/
export function getJestWorkerId(): string {
  return envAsString(getEnvValue('JEST_WORKER_ID'))
}

/**
 * VITEST environment variable.
 * Set when running tests with Vitest.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getVitest(): boolean {
  return envAsBoolean(getEnvValue('VITEST'))
}

/**
 * Check if code is running in a test environment.
 * Checks NODE_ENV, VITEST, and JEST_WORKER_ID.
 */
/*@__NO_SIDE_EFFECTS__*/
export function isTest(): boolean {
  const nodeEnv = envAsString(getNodeEnv())
  return nodeEnv === 'test' || getVitest() || !!getJestWorkerId()
}
