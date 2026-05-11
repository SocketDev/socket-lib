/**
 * @fileoverview IPC stub path resolution. The on-disk layout is
 * `<tmpDir>/.socket-ipc/<appName>/stub-<pid>.json`, computed here
 * once so writers and readers agree on where stubs land.
 */

import process from 'node:process'

import { getOsTmpDir } from '../paths/socket'

import { getPath } from './_internal'

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
