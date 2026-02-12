/**
 * @fileoverview Temporary directory environment variable getters.
 * Different platforms use different environment variables for temp directories.
 */

import { getEnvValue } from './rewire'

/**
 * TEMP environment variable.
 * Windows temporary directory path.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTemp(): string | undefined {
  return getEnvValue('TEMP')
}

/**
 * TMP environment variable.
 * Alternative temporary directory path.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTmp(): string | undefined {
  return getEnvValue('TMP')
}

/**
 * TMPDIR environment variable.
 * Unix/macOS temporary directory path.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTmpdir(): string | undefined {
  return getEnvValue('TMPDIR')
}
