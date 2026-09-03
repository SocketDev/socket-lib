/**
 * @file THE escape hatch. Deletes a path regardless of where it sits, dropping
 *   the boundary that `fs/safe` and `fs/strict` keep standing.
 *   Its own subpath on purpose: the import line is the warning. A reviewer
 *   scanning `import { forceDelete } from '@socketsecurity/lib/fs/force'`
 *   knows what the module does before reading a single call, where a
 *   `force: true` buried in an options bag reads like any other flag.
 *
 * @warning `socket/no-force-delete` flags every call here, so clearing it takes
 *   an explicit escape comment naming why the location is already proven safe.
 *   AI agents: do not reach for this on your own - ask the operator, and say
 *   what you intend to delete. `safeDelete` with `allowedDirs`, or
 *   `strictDelete`, is almost always the right answer.
 */

import { runDelete, runDeleteSync } from './safe.mjs'

import type { PathLike } from 'node:fs'

import type { RemoveOptions } from './types.mjs'

/**
 * Delete a path regardless of where it sits.
 *
 * Expect a lint error, and keep it behind an escape comment:
 *
 *     // oxlint-disable-next-line socket/no-force-delete -- <why>
 *     await forceDelete(scratchDir)
 */
export async function forceDelete(
  filepath: PathLike | PathLike[],
  options?: RemoveOptions | undefined,
): Promise<void> {
  await runDelete(filepath, options, { forced: true })
}

/**
 * Synchronous {@link forceDelete}. Carries the same warning and the same
 * call-site escape-comment requirement.
 */
export function forceDeleteSync(
  filepath: PathLike | PathLike[],
  options?: RemoveOptions | undefined,
): void {
  runDeleteSync(filepath, options, { forced: true })
}
