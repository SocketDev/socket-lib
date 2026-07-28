/**
 * @file Stub-directory creation + permission audit. The IPC directory is
 *   created with 0o700 so other users can't read or plant files; on POSIX we
 *   also verify ownership and permission bits before any write, since a
 *   pre-existing directory could belong to a different user or have permissive
 *   modes inherited from umask.
 */

import process from 'node:process'

import { ErrorCtor } from '../primordials/error'

import { getFs, getPath } from './_internal'

/**
 * Ensure IPC directory exists for stub file creation. Uses restrictive (0o700)
 * permissions so other users cannot read or write stub files. On POSIX, after
 * `mkdir` we verify the directory is owned by the current user and not
 * world/group-writable — protects against a prior local attacker pre-creating
 * `.socket-ipc/<app>/` with permissive modes and planting symlinks for stub
 * filenames. Throws if the directory fails the check.
 *
 * @internal
 */
export async function ensureIpcDirectory(filePath: string): Promise<void> {
  const fs = getFs()
  const path = getPath()
  const dir = path.dirname(filePath)
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 })
  // Windows skip-path; tested on Windows runners.
  /* c8 ignore start */
  if (process.platform === 'win32') {
    return
  }
  /* c8 ignore stop */
  // oxlint-disable-next-line socket/prefer-exists-sync -- need lstat to discriminate symlink/dir via isDirectory().
  const stats = await fs.promises.lstat(dir)
  // Defensive: mkdir just succeeded so dir is a directory.
  /* c8 ignore start */
  if (!stats.isDirectory()) {
    throw new ErrorCtor(`IPC path is not a directory: ${dir}`)
  }
  /* c8 ignore stop */
  const getuid = process.getuid
  /* c8 ignore next - process.getuid is always present on POSIX. */
  const ownUid = typeof getuid === 'function' ? getuid.call(process) : -1
  /* c8 ignore next 5 - Cross-user ownership guard fires only if the
     IPC directory was created by a different uid; can't be triggered
     in-test without spawning a separate user. */
  if (ownUid !== -1 && stats.uid !== ownUid) {
    throw new ErrorCtor(
      `IPC directory ${dir} is owned by another user (uid ${stats.uid}); refusing to use it.`,
    )
  }
  // Permission bits only (mask out file-type bits). Reject any group or
  // other access — only owner bits may be set.
  const mode = stats.mode & 0o777
  /* c8 ignore next 7 - chmod-tightening fires only if umask leaves
     group/other bits set; default Node umask 0o022 strips group-write
     but keeps group/other read+execute, so the value depends on the
     CI runner's umask. */
  if ((mode & 0o077) !== 0) {
    // Tighten an over-permissive directory we just inherited. Use chmod
    // rather than fail outright so a first-run that inherits e.g. 0o755
    // from umask still succeeds.
    await fs.promises.chmod(dir, 0o700)
  }
}
