/**
 * @fileoverview vlt tool surface.
 *
 * Stub — execVlt is not yet implemented in socket-lib. The dir exists
 * so downstream code can import from a stable canonical path; populate
 * when first concrete need arrives.
 *
 * vlt lockfile is `vlt-lock.json`. Reference: socket-sdxgen/src/parsers/vlt/.
 * vlt does not support overrides, so fleet code that needs override
 * support should branch around it (see socket-cli/packages/cli/src/commands/optimize/
 * for the canonical pattern of agent-conditional logic).
 */

import { ErrorCtor } from '../../../primordials/error'

/**
 * Execute vlt commands. Not yet implemented — throws.
 *
 * @internal When implementing, model after eco/npm/npm/exec.ts
 * (array-based args, Windows shell handling, debug-level filtering).
 */
export function execVlt(_args: string[], _options?: unknown): never {
  throw new ErrorCtor(
    'execVlt is not yet implemented in @socketsecurity/lib/eco/npm/vlt. Track at task #58 (socket-lib 6.x: implement execVlt).',
  )
}
