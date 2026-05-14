/**
 * @fileoverview Feature-flag check — `isPerfEnabled()` returns true
 * when `DEBUG=perf` is set in the environment. Every recording entry
 * (timer / checkpoint / memory) bails out cheaply when this is false.
 */

import { getEnvValue } from '../env/rewire'

/**
 * Check if performance tracking is enabled.
 *
 * Reads `DEBUG` through `getEnvValue` so tests can mock the value via
 * `setEnv('DEBUG', 'perf')` from `@socketsecurity/lib/env/rewire`
 * without mutating `process.env`.
 */
export function isPerfEnabled(): boolean {
  return getEnvValue('DEBUG')?.includes('perf') || false
}
