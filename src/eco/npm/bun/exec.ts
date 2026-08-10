/**
 * @file Bun tool surface. Stub — execBun is not yet implemented in socket-lib.
 *   The dir exists so downstream code (e.g. socket-cli's optimize command) can
 *   import from a stable canonical path; populate when first concrete need
 *   arrives. Bun lockfile is the modern text `bun.lock` or the legacy binary
 *   `bun.lockb`. Min version supported by socket-cli is 1.1.39 (text-based
 *   lockfile). Reference: socket-sdxgen/src/parsers/bun/.
 */

import { ErrorCtor } from '../../../primordials/error'

/**
 * Execute Bun commands. Not yet implemented — throws.
 *
 * @internal When implementing, model after eco/npm/npm-cli/exec.ts for array-based
 *   args, Windows shell handling, and debug-level filtering.
 */
export function execBun(
  _args: string[],
  _options?: unknown | undefined,
): never {
  throw new ErrorCtor(
    'execBun is not yet implemented in @socketsecurity/lib/eco/npm/bun. Track at task #57 (socket-lib 6.x: implement execBun).',
  )
}
