/**
 * @file Async spawn with retry.
 *   WHY THIS IS NOT AN OPTION ON `spawn`. That function returns a promise
 *   carrying live `process` and `stdin` accessors, so a caller can write to
 *   the running child or signal it mid-flight. A retry spawns a SECOND child,
 *   which leaves those accessors pointing at a corpse. Rather than hand back a
 *   surface that silently means something else on attempt two, retry lives on
 *   its own function that resolves to the result alone.
 *   Retry stays as unsafe here as it is anywhere: it suits a command that runs
 *   twice with the same outcome. A `git push` killed on timeout may already
 *   have reached the server.
 */

import { sleep } from '../../promises/timers.mjs'

import { spawn } from './child.mjs'
import { enhanceSpawnError } from './errors.mjs'
import { runWithSpawnRetryAsync } from './retry/policy.mjs'

import type { SpawnRetryFailure } from './retry/policy.mjs'
import type { SpawnExtra, SpawnOptions, SpawnStdioResult } from './types.mjs'

/**
 * The retry policy reads `status`; the async result reports `code`.
 */
export function asRetryFailure(result: SpawnStdioResult): SpawnRetryFailure {
  return { signal: result.signal, status: result.code }
}

/**
 * Spawn `cmd`, retrying per the options, and resolve with the final result.
 *
 * Unlike {@link spawn} the returned promise carries no `process` or `stdin`:
 * a retry replaces the child, so those would name the wrong one.
 *
 * `throws` behaves as it does on {@link spawn}. Internally every attempt runs
 * with `throws: false` so the loop can read a non-zero exit and decide, and a
 * caller who wanted a throw gets one from the final result.
 */
// Mirrors spawn(cmd, args, options, extra) on purpose: a caller swaps one for
// the other without rewriting the call, so the shape is fixed by that
// contract rather than chosen here.
// oxlint-disable-next-line socket/no-optional-positional-trap, socket/no-optional-param-before-options-bag -- mirrors spawn
export async function spawnWithRetry(
  cmd: string,
  args?: string[] | readonly string[] | undefined,
  options?: SpawnOptions | undefined,
  extra?: SpawnExtra | undefined,
): Promise<SpawnStdioResult> {
  const opts = { __proto__: null, ...options } as SpawnOptions
  const { throws = true } = opts
  const attemptOptions = { ...opts, throws: false }
  const result = await runWithSpawnRetryAsync(
    sleep,
    async () => {
      const attempt = (await spawn(
        cmd,
        args,
        attemptOptions,
        extra,
      )) as SpawnStdioResult
      // Carry the retry shape alongside the real result so the policy can read
      // it without the loop having to know about spawn's field names.
      return Object.assign(attempt, asRetryFailure(attempt))
    },
    opts,
  )
  if (throws && result.code !== 0) {
    // Built from the result the loop already has. Re-running the command to
    // provoke a throw would execute it one more time, which is the exact
    // double-apply this module warns about.
    throw enhanceSpawnError(
      Object.assign(new Error(`${cmd} exited with code ${result.code}`), {
        args: result.args,
        cmd: result.cmd,
        code: result.code,
        signal: result.signal,
        stderr: result.stderr,
        stdout: result.stdout,
      }),
    )
  }
  return result
}
