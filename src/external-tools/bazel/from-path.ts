/**
 * @file `bazelFromPath()` — looks for `bazelisk` first, then `bazel`, on the
 *   system PATH. Bazelisk is preferred because it honors `.bazelversion` and
 *   downloads the project-pinned Bazel into its own cache — closer to what real
 *   Bazel users want. Returns `undefined` if neither is found on PATH.
 */

import { which } from '../../bin/which'

import type { ResolvedBazel } from './types'

export async function bazelFromPath(): Promise<ResolvedBazel | undefined> {
  const bazelisk = await which('bazelisk', { nothrow: true })
  /* c8 ignore start - reached only when bazelisk is on PATH. */
  if (typeof bazelisk === 'string') {
    return { path: bazelisk, source: 'path' }
  }
  /* c8 ignore stop */
  const bazel = await which('bazel', { nothrow: true })
  /* c8 ignore start - reached only when bazel is on PATH. */
  if (typeof bazel === 'string') {
    return { path: bazel, source: 'path' }
  }
  /* c8 ignore stop */
  return undefined
}
