/**
 * @file Recursive copy for a file or directory tree, with three destination
 *   modes (see {@link CopyMode}). Plain `fs.cp` (even with `force`) overwrites
 *   files present in the source but never deletes destination files absent from
 *   it, so copying onto an existing target leaves stale leftovers behind. The
 *   `'pave'` mode makes the destination an exact copy of the source by staging
 *   a fresh tree in a sibling temp directory and swapping it in with a single
 *   rename — atomic, with no stale survivors.
 */

import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import { pathLikeToString } from '../paths/normalize.mjs'
import { ObjectFreeze } from '../primordials/object.mjs'

import { safeDelete, safeMkdir } from './safe.mjs'
import { uniqueSync } from './unique.mjs'

import type { PathLike } from 'node:fs'

/**
 * Named values for {@link CopyMode}. A frozen object rather than a TypeScript
 * `enum` so the declaration is erasable, since enums emit runtime helper code.
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
 *   atomic, renaming a sibling temp directory into place, so a partial tree is
 *   never observable.
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
   * Predicate deciding which entries to copy. Return `false` to skip an entry;
   * skipping a directory also skips everything beneath it. Receives resolved
   * source and destination paths, matching `node:fs` `cp`'s `filter`.
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
 * Errno values that mean "this filesystem has no reflink", as opposed to
 * "this copy failed".
 *
 * The distinction is the point. A blanket `catch` would also swallow ENOENT on
 * a missing source and EACCES on an unwritable destination, retry them as a
 * plain copy, and report whatever that did - so a real failure becomes a slow
 * success or a confusing second error.
 */
const NO_REFLINK_ERRNOS: ReadonlySet<string> = new Set([
  'EINVAL',
  'ENOSYS',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EXDEV',
])

/**
 * Whether the filesystem has already answered that it cannot reflink.
 *
 * One refusal answers for the whole process. Asking again per file costs a
 * failed syscall each time, on exactly the systems that are already the slow
 * ones.
 */
let reflinkUnsupported = false

/**
 * Copy one directory tree, sharing the bytes of every file when the filesystem
 * can. See {@link cloneFile} for what the sharing buys.
 *
 * Children come from one `readdir` with their types attached, so nothing stats
 * a path twice to learn what it is. Symlinks are recreated as symlinks:
 * following one would turn a link into a full copy of its target, and a link
 * pointing outside the tree would drag in whatever it names.
 *
 * @param from - Source directory.
 * @param to - Destination directory.
 */
export async function cloneDir(from: PathLike, to: PathLike): Promise<void> {
  const fs = getNodeFs()
  const path = getNodePath()
  const fromStr = pathLikeToString(from)
  const toStr = pathLikeToString(to)
  await safeMkdir(toStr)
  const entries = await fs.promises.readdir(fromStr, { withFileTypes: true })
  await Promise.all(
    entries.map(async entry => {
      const childFrom = path.join(fromStr, entry.name)
      const childTo = path.join(toStr, entry.name)
      if (entry.isDirectory()) {
        await cloneDir(childFrom, childTo)
        return
      }
      if (entry.isSymbolicLink()) {
        const target = await fs.promises.readlink(childFrom)
        await safeDelete(childTo)
        await fs.promises.symlink(target, childTo)
        return
      }
      await cloneFile(childFrom, childTo)
    }),
  )
}

/**
 * Copy one file, sharing its bytes with the source when the filesystem can.
 *
 * `COPYFILE_FICLONE` asks for a copy-on-write clone: APFS and Btrfs answer with
 * a metadata operation whatever the file size, and everything else copies the
 * bytes. A clone is NOT a hard link - the two files carry separate inodes and
 * separate mode bits, so writing one can never reach back into the other.
 *
 * @example
 *   ;```js
 *   // Near-free on APFS, a plain copy elsewhere.
 *   await cloneFile('./template/hook.mts', './.cache/stage/hook.mts')
 *   ```
 *
 * @param from - Source file.
 * @param to - Destination file.
 */
export async function cloneFile(from: PathLike, to: PathLike): Promise<void> {
  const fs = getNodeFs()
  const fromStr = pathLikeToString(from)
  const toStr = pathLikeToString(to)
  if (reflinkUnsupported) {
    await fs.promises.copyFile(fromStr, toStr)
    return
  }
  try {
    await fs.promises.copyFile(fromStr, toStr, fs.constants.COPYFILE_FICLONE)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException | undefined)?.code
    if (code === undefined || !NO_REFLINK_ERRNOS.has(code)) {
      throw e
    }
    reflinkUnsupported = true
    await fs.promises.copyFile(fromStr, toStr)
  }
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
 * @param options - Copy options: mode, filter, dereference, abort signal.
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

/**
 * Forget that a filesystem refused to reflink, so the next clone asks again.
 */
export function resetReflinkSupport(): void {
  reflinkUnsupported = false
}
