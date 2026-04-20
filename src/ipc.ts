/**
 * @fileoverview Secure inter-process communication utilities for Socket CLI.
 * File-based stub handoff (restricted-perm temp files with unique IDs and
 * timestamps) for transferring data between processes that exceeds the size
 * or exposure limits of environment variables.
 */

import process from 'node:process'

import { Type } from './external/@sinclair/typebox'
import { getOsTmpDir } from './paths/socket'
import { parseSchema } from './schema/parse'

/**
 * IPC stub file schema - validates the structure of stub files.
 * Stub files are used for passing data between processes via filesystem.
 */
const IpcStubSchema = Type.Object({
  /** Process ID that created the stub. */
  pid: Type.Integer({ minimum: 1 }),
  /** Creation timestamp for age validation. */
  timestamp: Type.Number({ exclusiveMinimum: 0 }),
  /** The actual data payload. */
  data: Type.Unknown(),
})

/**
 * IPC stub file interface.
 * Represents the structure of stub files used for filesystem-based IPC.
 */
export interface IpcStub {
  /** The actual data payload. */
  data: unknown
  /** Process ID that created the stub. */
  pid: number
  /** Creation timestamp for age validation. */
  timestamp: number
}

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

/**
 * Ensure IPC directory exists for stub file creation.
 * Uses restrictive (0o700) permissions so other users cannot read or write
 * stub files. On POSIX, after `mkdir` we verify the directory is owned by
 * the current user and not world/group-writable — protects against a
 * prior local attacker pre-creating `.socket-ipc/<app>/` with permissive
 * modes and planting symlinks for stub filenames. Throws if the directory
 * fails the check.
 * @internal
 */
async function ensureIpcDirectory(filePath: string): Promise<void> {
  const fs = getFs()
  const path = getPath()
  const dir = path.dirname(filePath)
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 })
  if (process.platform === 'win32') {
    return
  }
  const stats = await fs.promises.lstat(dir)
  if (!stats.isDirectory()) {
    throw new Error(`IPC path is not a directory: ${dir}`)
  }
  const getuid = process.getuid
  const ownUid = typeof getuid === 'function' ? getuid.call(process) : -1
  if (ownUid !== -1 && stats.uid !== ownUid) {
    throw new Error(
      `IPC directory ${dir} is owned by another user (uid ${stats.uid}); refusing to use it.`,
    )
  }
  // Permission bits only (mask out file-type bits). Reject any group or
  // other access — only owner bits may be set.
  // eslint-disable-next-line no-bitwise
  const mode = stats.mode & 0o777
  // eslint-disable-next-line no-bitwise
  if ((mode & 0o077) !== 0) {
    // Tighten an over-permissive directory we just inherited. Use chmod
    // rather than fail outright so a first-run that inherits e.g. 0o755
    // from umask still succeeds.
    await fs.promises.chmod(dir, 0o700)
  }
}

/**
 * Lazily load the fs module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load the path module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Get the IPC stub path for a given application.
 *
 * Generates a unique file path for IPC stub files that are used to pass
 * data between processes. The stub files are stored in a hidden directory
 * within the system's temporary folder.
 *
 * ## Path Structure:
 * - Base: System temp directory (e.g., /tmp on Unix, %TEMP% on Windows)
 * - Directory: `.socket-ipc/{appName}/`
 * - Filename: `stub-{pid}.json`
 *
 * ## Security Features:
 * - Files are isolated per application via appName parameter
 * - Process ID in filename prevents collisions between concurrent processes
 * - Temporary directory location ensures automatic cleanup on system restart
 *
 * @param appName - The application identifier (e.g., 'socket-cli', 'socket-dlx')
 * @returns Full path to the IPC stub file
 *
 * @example
 * ```typescript
 * const stubPath = getIpcStubPath('socket-cli')
 * // Returns: '/tmp/.socket-ipc/socket-cli/stub-12345.json' (Unix)
 * // Returns: 'C:\\Users\\Name\\AppData\\Local\\Temp\\.socket-ipc\\socket-cli\\stub-12345.json' (Windows)
 * ```
 */
export function getIpcStubPath(appName: string): string {
  const tempDir = getOsTmpDir()
  const path = getPath()
  const stubDir = path.join(tempDir, '.socket-ipc', appName)
  return path.join(stubDir, `stub-${process.pid}.json`)
}

/**
 * Write IPC data to a stub file for inter-process data transfer.
 *
 * Creates a stub file containing data that needs to be passed between
 * processes. The file is written with 0o600 permissions so only the
 * invoking user can read it.
 *
 * ## File Structure:
 * ```json
 * {
 *   "pid": 12345,
 *   "timestamp": 1699564234567,
 *   "data": { ... }
 * }
 * ```
 *
 * @param appName - The application identifier
 * @param data - The data to write to the stub file
 * @returns Promise resolving to the stub file path
 *
 * @example
 * ```typescript
 * const stubPath = await writeIpcStub('socket-cli', {
 *   apiToken: 'secret-token',
 *   config: { ... }
 * })
 * // Pass stubPath to child process for reading
 * ```
 */
export async function writeIpcStub(
  appName: string,
  data: unknown,
): Promise<string> {
  const stubPath = getIpcStubPath(appName)
  await ensureIpcDirectory(stubPath)

  const ipcData: IpcStub = {
    data,
    pid: process.pid,
    timestamp: Date.now(),
  }

  const validated = parseSchema(IpcStubSchema, ipcData)

  const fs = getFs()
  // Open O_CREAT|O_WRONLY|O_EXCL|O_NOFOLLOW so we (a) refuse to overwrite
  // a pre-existing stub — protects against collision with an attacker-
  // planted file or an old stub from a reused PID — and (b) refuse to
  // follow a symlink at the final path component, which on shared temp
  // dirs (e.g. /tmp on Linux) could otherwise redirect this write into
  // the victim's own files. O_NOFOLLOW is a no-op on Windows, where the
  // per-user $TEMP makes the attack moot anyway.
  // eslint-disable-next-line no-bitwise
  const flags =
    fs.constants.O_CREAT |
    fs.constants.O_WRONLY |
    fs.constants.O_EXCL |
    fs.constants.O_NOFOLLOW
  // Retry once if a stale stub (from the same PID, reused after an ungraceful
  // exit) already exists — remove and recreate. Only one retry.
  let handle: import('node:fs').promises.FileHandle | undefined
  try {
    handle = await fs.promises.open(stubPath, flags, 0o600)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'EEXIST') {
      await fs.promises.unlink(stubPath)
      handle = await fs.promises.open(stubPath, flags, 0o600)
    } else {
      throw err
    }
  }
  try {
    await handle.writeFile(JSON.stringify(validated, null, 2), 'utf8')
  } finally {
    await handle.close()
  }
  return stubPath
}
