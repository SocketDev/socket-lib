/**
 * @fileoverview Bun tool surface.
 *
 * Stub — execBun is not yet implemented in socket-lib. The dir exists
 * so downstream code (e.g. socket-cli's optimize command) can import
 * from a stable canonical path; populate when first concrete need
 * arrives.
 *
 * Bun lockfile is `bun.lock` (text, modern) or `bun.lockb` (binary,
 * legacy). Min version supported by socket-cli is 1.1.39 (text-based
 * lockfile). Reference: socket-sdxgen/src/parsers/bun/.
 */

/**
 * Execute Bun commands. Not yet implemented — throws.
 *
 * @internal When implementing, model after eco/npm/npm/exec.ts
 * (array-based args, Windows shell handling, debug-level filtering).
 */
export function execBun(_args: string[], _options?: unknown): never {
  throw new Error(
    'execBun is not yet implemented in @socketsecurity/lib/eco/npm/bun. Track at task #57 (socket-lib 6.x: implement execBun).',
  )
}
