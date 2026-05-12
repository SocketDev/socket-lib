/**
 * @fileoverview Feature-flag check — `isPerfEnabled()` returns true
 * when `DEBUG=perf` is set in the environment. Every recording entry
 * (timer / checkpoint / memory) bails out cheaply when this is false.
 */

import process from 'node:process'

/**
 * Check if performance tracking is enabled.
 */
export function isPerfEnabled(): boolean {
  return process.env['DEBUG']?.includes('perf') || false
}
