/**
 * @file The strictest of the three deletes. `fs/safe` widens by location and
 *   its `forceDelete` drops the boundary; this one REFUSES a target it cannot
 *   prove is safe, before any I/O touches the disk.
 *   Reach for it wherever the target is BUILT from a variable, which is where
 *   the failure lives: `path.join(base, '')` is `base`, so one empty segment
 *   turns "remove this scratch directory" into "remove the tree it sits in".
 *   `existsSync` answers TRUE for that path, so an existence check waves it
 *   through, and the rename-then-delete shape common to cascade and staging
 *   code completes before anything logs.
 */

import { getNodePath } from '../node/path.mjs'

import { runDelete, runDeleteSync } from './safe.mjs'

import type { RemoveOptions } from './types.mjs'

/**
 * Options for a strict delete: the ordinary delete options plus the base the
 * target must sit strictly below.
 */
export interface StrictDeleteOptions extends RemoveOptions {
  /**
   * The directory the target must be strictly inside. Omit it to check only
   * the target-shape refusals (empty, dot-only, filesystem root).
   */
  readonly base?: string | undefined
}

/**
 * Throw when a target must never be deleted.
 */
export function assertDeletable(
  target: string,
  base?: string | undefined,
): void {
  const reason = deleteRefusalReason(target, base)
  if (reason !== undefined) {
    throw new Error(
      'Refusing to delete a root-resolving path.\n' +
        `  Saw:   ${JSON.stringify(target)} - ${reason}.\n` +
        '  Wanted: a target strictly BELOW the base directory.\n' +
        '  Fix:   refuse the delete upstream instead of joining an empty\n' +
        '         segment onto a base directory.',
    )
  }
}

/**
 * The reason a target must never be deleted, or undefined when it is fine.
 *
 * Four refusals, all before any I/O: an empty or dot-only target, a filesystem
 * root, and - when a `base` is named - a target that IS the base or sits
 * outside it.
 */
export function deleteRefusalReason(
  target: string,
  base?: string | undefined,
): string | undefined {
  const trimmed = target.trim()
  if (!trimmed || trimmed === '.' || trimmed === './') {
    return 'the target is empty or resolves to the current directory'
  }
  const path = getNodePath()
  const resolved = path.resolve(trimmed)
  if (resolved === path.parse(resolved).root) {
    return 'the target is a filesystem root'
  }
  if (base !== undefined) {
    const resolvedBase = path.resolve(base)
    if (resolved === resolvedBase) {
      return 'the target IS the base directory'
    }
    if (!resolved.startsWith(resolvedBase + path.sep)) {
      return 'the target sits outside the base directory'
    }
  }
  return undefined
}

/**
 * Delete a target only after proving it sits strictly below `options.base`.
 */
export async function strictDelete(
  target: string,
  options?: StrictDeleteOptions | undefined,
): Promise<void> {
  const opts = { __proto__: null, ...options } as StrictDeleteOptions
  assertDeletable(target, opts.base)
  await runDelete(target, opts)
}

/**
 * Synchronous {@link strictDelete}.
 */
export function strictDeleteSync(
  target: string,
  options?: StrictDeleteOptions | undefined,
): void {
  const opts = { __proto__: null, ...options } as StrictDeleteOptions
  assertDeletable(target, opts.base)
  runDeleteSync(target, opts)
}
