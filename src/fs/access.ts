/**
 * @file Synchronous file-access predicates — boolean "can this process do X to
 *   this path?" checks over `fs.accessSync`. Prefer these only where the answer
 *   drives a user-facing decision (e.g. "is the cache dir writable, so I can
 *   pick a fallback?"). For "I'm about to write, can I?" do NOT pre-check —
 *   just attempt the write and handle the error; a check-then-act gap is a
 *   TOCTOU race. `canAccess` (F_OK) overlaps `existsSync`; use `existsSync` for
 *   plain existence, these for permission bits.
 */

import { getNodeFs } from '../node/fs'

import type { PathLike } from 'node:fs'

/**
 * Does the process have `mode` access to `path`? Wraps `fs.accessSync`,
 * returning a boolean instead of throwing. Default mode is `F_OK` (existence).
 *
 * @param path - Path to check.
 * @param mode - `fs.constants` bit (`F_OK` / `R_OK` / `W_OK` / `X_OK`).
 *
 * @returns True if the access check succeeds.
 */
/*@__NO_SIDE_EFFECTS__*/
export function canAccess(path: PathLike, mode?: number | undefined): boolean {
  const fs = getNodeFs()
  try {
    // oxlint-disable-next-line socket/prefer-exists-sync -- checks the mode bit (R_OK/W_OK/X_OK), not mere existence; existsSync can't express permissions.
    fs.accessSync(path, mode)
    return true
  } catch {
    return false
  }
}

/**
 * Can the process execute `path`? (`X_OK`)
 */
/*@__NO_SIDE_EFFECTS__*/
export function canExecute(path: PathLike): boolean {
  return canAccess(path, getNodeFs().constants.X_OK)
}

/**
 * Can the process read `path`? (`R_OK`)
 */
/*@__NO_SIDE_EFFECTS__*/
export function canRead(path: PathLike): boolean {
  return canAccess(path, getNodeFs().constants.R_OK)
}

/**
 * Can the process write `path`? (`W_OK`)
 */
/*@__NO_SIDE_EFFECTS__*/
export function canWrite(path: PathLike): boolean {
  return canAccess(path, getNodeFs().constants.W_OK)
}
