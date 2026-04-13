/**
 * @fileoverview Temporary directory environment variable getters.
 * Different platforms use different environment variables for temp directories.
 */

import { getEnvValue } from './rewire'

/**
 * TEMP environment variable.
 * Windows temporary directory path.
 *
 * @returns The Windows temp directory path, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getTemp } from '@socketsecurity/lib/env/temp-dir'
 *
 * const temp = getTemp()
 * // e.g. 'C:\\Windows\\Temp' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTemp(): string | undefined {
  return getEnvValue('TEMP')
}

/**
 * TMP environment variable.
 * Alternative temporary directory path.
 *
 * @returns The alternative temp directory path, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getTmp } from '@socketsecurity/lib/env/temp-dir'
 *
 * const tmp = getTmp()
 * // e.g. '/tmp' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTmp(): string | undefined {
  return getEnvValue('TMP')
}

/**
 * TMPDIR environment variable.
 * Unix/macOS temporary directory path.
 *
 * @returns The Unix/macOS temp directory path, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getTmpdir } from '@socketsecurity/lib/env/temp-dir'
 *
 * const tmpdir = getTmpdir()
 * // e.g. '/tmp' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTmpdir(): string | undefined {
  return getEnvValue('TMPDIR')
}
