/**
 * @file Atomic stub write — `O_CREAT|O_WRONLY|O_EXCL| O_NOFOLLOW` so we refuse
 *   to overwrite a pre-existing stub (collision with attacker-planted file or
 *   PID reuse) and refuse to follow symlinks at the final path component. One
 *   retry on EEXIST after `safeDelete` to handle the legitimate stale-stub case
 *   where the previous owner exited ungracefully.
 */

import process from 'node:process'

import { safeDelete } from '../fs/safe'
import { parseSchema } from '../schema/parse'

import { DateNow } from '../primordials/date'
import { JSONStringify } from '../primordials/json'

import { IpcStubSchema, getFs } from './_internal'
import { ensureIpcDirectory } from './directory'
import { getIpcStubPath } from './paths'

import type { IpcStub } from './types'

/**
 * Write IPC data to a stub file for inter-process data transfer.
 *
 * Creates a stub file containing data that needs to be passed between
 * processes. The file is written with 0o600 permissions so only the invoking
 * user can read it.
 *
 * ## File Structure:
 *
 * ```json
 * {
 *   "pid": 12345,
 *   "timestamp": 1699564234567,
 *   "data": { ... }
 * }
 * ```
 *
 * @example
 *   ;```typescript
 *   const stubPath = await writeIpcStub('socket-cli', {
 *   apiToken: 'secret-token',
 *   config: { ... }
 *   })
 *   // Pass stubPath to child process for reading
 *   ```
 *
 * @param appName - The application identifier.
 * @param data - The data to write to the stub file.
 *
 * @returns Promise resolving to the stub file path
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
    timestamp: DateNow(),
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
      await safeDelete(stubPath)
      handle = await fs.promises.open(stubPath, flags, 0o600)
    } else {
      throw err
    }
  }
  try {
    await handle.writeFile(JSONStringify(validated, undefined, 2), 'utf8')
  } finally {
    await handle.close()
  }
  return stubPath
}
