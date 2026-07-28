/**
 * @file Recursive copy for a file or directory tree, with three destination
 *   modes (see {@link CopyMode}). Plain `fs.cp` (even with `force`) overwrites
 *   files present in the source but never deletes destination files absent from
 *   it, so copying onto an existing target leaves stale leftovers behind. The
 *   `'pave'` mode makes the destination an exact copy of the source by staging
 *   a fresh tree in a sibling temp directory and swapping it in with a single
 *   rename — atomic, with no stale survivors.
 */

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import { pathLikeToString } from '../paths/normalize'
import { ObjectFreeze } from '../primordials/object'

import { safeDelete, safeMkdir } from './safe'
import { uniqueSync } from './unique'

import type { PathLike } from 'node:fs'

/**
 * Named values for {@link CopyMode}. A frozen object rather than a TypeScript
 * `enum` so the declaration is erasable (enums emit runtime helper code).
 */
export const CopyMode = ObjectFreeze({
  Fill: 'fill',
  Overlay: 'overlay',
  Pave: 'pave',
} as const)

/**
 * How {@link copy} treats an existing destination.
 *
 * - `'overlay'` (default) — overwrite files present in the source but leave any
 *   pre-existing destination-only files in place (a recursive `fs.cp`).
 * - `'pave'` — replace the destination so it becomes an exact copy of the source;
 *   destination entries absent from the source do not survive. The swap is
 *   atomic (a sibling temp directory is renamed into place), so a partial tree
 *   is never observable.
 * - `'fill'` — copy only what the destination lacks: existing files stay
 *   untouched (no-clobber), missing ones are added. Never throws on an existing
 *   file.
 *
 * Maps to `cp` (overlay), `rsync --delete` / robocopy `/MIR` (pave), and
 * `cp -n` (fill).
 */
export type CopyMode = (typeof CopyMode)[keyof typeof CopyMode]

/**
 * Options for {@link copy}.
 */
export interface CopyOptions {
  /**
   * Dereference symlinks — copy what each points to rather than the link
   * itself.
   *
   * @default false
   */
  dereference?: boolean | undefined
  /**
   * Predicate deciding which entries to copy. Return `false` to skip an entry
   * (and, for a directory, everything beneath it). Receives resolved source
   * and destination paths, matching `node:fs` `cp`'s `filter`.
   */
  filter?: ((source: string, destination: string) => boolean) | undefined
  /**
   * How to treat an existing destination. See {@link CopyMode}.
   *
   * @default 'overlay'
   */
  mode?: CopyMode | undefined
  /**
   * Abort signal to cancel the operation.
   */
  signal?: AbortSignal | undefined
}

/**
 * Recursively copy a file or directory tree from `from` to `to`.
 *
 * Works for both files and directories. The `mode` option chooses how an
 * existing destination is treated — overlay (default), pave, or fill; see
 * {@link CopyMode}.
 *
 * @example
 *   ;```ts
 *   // Overlay (default) — overwrite collisions, keep files already in dest:
 *   await copy('./src', './dest')
 *
 *   // Pave — dest ends up identical to src, no stale survivors:
 *   await copy('./vendor/upstream', './deps/upstream', { mode: CopyMode.Pave })
 *
 *   // Fill — add only what's missing, never overwrite an existing file:
 *   await copy('./defaults', './config', { mode: CopyMode.Fill })
 *   ```
 *
 * @param from - Source file or directory to copy.
 * @param to - Destination path.
 * @param options - Copy options (mode, filter, dereference, abort signal).
 */
export async function copy(
  from: PathLike,
  to: PathLike,
  options?: CopyOptions | undefined,
): Promise<void> {
  const fs = getNodeFs()
  const opts = { __proto__: null, ...options } as CopyOptions
  const { mode } = opts
  const fromStr = pathLikeToString(from)
  const toStr = pathLikeToString(to)
  const cpOptions = {
    __proto__: null,
    dereference: opts.dereference === true,
    // overlay + pave overwrite; fill is no-clobber. errorOnExist is left
    // unset, so fill silently skips existing files instead of throwing.
    force: mode !== CopyMode.Fill,
    recursive: true,
    ...(opts.filter ? { filter: opts.filter } : {}),
  }

  // overlay / fill copy straight onto the destination.
  if (mode !== CopyMode.Pave) {
    await fs.promises.cp(fromStr, toStr, cpOptions)
    return
  }

  // pave: stage a fresh tree in a sibling temp dir, then swap it in with a
  // single rename so the destination mirrors the source exactly and is never
  // observed half-populated.
  const path = getNodePath()
  const tmp = uniqueSync(`${toStr}.tmp`)
  try {
    await fs.promises.cp(fromStr, tmp, cpOptions)
    await safeMkdir(path.dirname(toStr))
    await safeDelete(toStr, { signal: opts.signal })
    await fs.promises.rename(tmp, toStr)
  } catch (e) {
    /* c8 ignore start - best-effort cleanup of the staged copy on failure */
    await safeDelete(tmp, { signal: opts.signal })
    throw e
    /* c8 ignore stop */
  }
}
