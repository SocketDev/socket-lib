/**
 * @fileoverview Secure inter-process communication utilities for Socket CLI.
 * File-based stub handoff (restricted-perm temp files with unique IDs and
 * timestamps) for transferring data between processes that exceeds the size
 * or exposure limits of environment variables.
 */

import process from 'node:process'

import { getOsTmpDir } from './paths/socket'
import { z } from './zod'

/**
 * IPC stub file schema - validates the structure of stub files.
 * Stub files are used for passing data between processes via filesystem.
 */
const IpcStubSchema = z.object({
  /** Process ID that created the stub. */
  pid: z.number().int().positive(),
  /** Creation timestamp for age validation. */
  timestamp: z.number().positive(),
  /** The actual data payload. */
  data: z.unknown(),
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
 * stub files.
 * @internal
 */
async function ensureIpcDirectory(filePath: string): Promise<void> {
  const fs = getFs()
  const path = getPath()
  const dir = path.dirname(filePath)
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 })
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

  const validated = IpcStubSchema.parse(ipcData)

  const fs = getFs()
  await fs.promises.writeFile(stubPath, JSON.stringify(validated, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  })
  return stubPath
}
