/**
 * @file Socket CLI child-process IPC object getter. Lazily builds an
 *   `IpcObject` from `SOCKET_CLI_*` environment variables so child processes
 *   can read flags and tokens forwarded by the parent Socket CLI without
 *   re-parsing `process.env` each call. Complements the filesystem stub IPC in
 *   `@socketsecurity/lib/ipc` (`getIpcStubPath`, `writeIpcStub`) for cases
 *   where data exceeds env-var size limits.
 */

import { ObjectFreeze } from '../primordials/object'

import type { IpcObject } from './types'

let ipcObject: IpcObject | undefined

/**
 * Get IPC data forwarded by a parent Socket CLI via `SOCKET_CLI_*` env vars.
 * Call without arguments to receive the full frozen `IpcObject`, or pass a key
 * to read a single field. The object is lazily built and cached; keys that
 * weren't set in the environment are returned as `undefined`.
 *
 * @param key - Optional `IpcObject` field name to read.
 *
 * @returns The full `IpcObject` or the value at `key` (possibly `undefined`).
 */
export async function getIpc(): Promise<IpcObject>
export async function getIpc<K extends keyof IpcObject>(
  key: K,
): Promise<IpcObject[K]>
export async function getIpc(
  key?: keyof IpcObject,
): Promise<IpcObject | IpcObject[keyof IpcObject]> {
  if (ipcObject === undefined) {
    ipcObject = {}

    // Check for IPC environment variables.
    const { env } = process

    if (env['SOCKET_CLI_FIX']) {
      ipcObject.SOCKET_CLI_FIX = env['SOCKET_CLI_FIX']
    }

    if (env['SOCKET_CLI_OPTIMIZE']) {
      ipcObject.SOCKET_CLI_OPTIMIZE =
        env['SOCKET_CLI_OPTIMIZE'] === '1' ||
        env['SOCKET_CLI_OPTIMIZE'] === 'true'
    }

    if (env['SOCKET_CLI_SHADOW_ACCEPT_RISKS']) {
      ipcObject.SOCKET_CLI_SHADOW_ACCEPT_RISKS =
        env['SOCKET_CLI_SHADOW_ACCEPT_RISKS'] === '1' ||
        env['SOCKET_CLI_SHADOW_ACCEPT_RISKS'] === 'true'
    }

    if (env['SOCKET_CLI_SHADOW_API_TOKEN']) {
      ipcObject.SOCKET_CLI_SHADOW_API_TOKEN =
        env['SOCKET_CLI_SHADOW_API_TOKEN']
    }

    if (env['SOCKET_CLI_SHADOW_BIN']) {
      ipcObject.SOCKET_CLI_SHADOW_BIN = env['SOCKET_CLI_SHADOW_BIN']
    }

    if (env['SOCKET_CLI_SHADOW_PROGRESS']) {
      ipcObject.SOCKET_CLI_SHADOW_PROGRESS =
        env['SOCKET_CLI_SHADOW_PROGRESS'] === '1' ||
        env['SOCKET_CLI_SHADOW_PROGRESS'] === 'true'
    }

    if (env['SOCKET_CLI_SHADOW_SILENT']) {
      ipcObject.SOCKET_CLI_SHADOW_SILENT =
        env['SOCKET_CLI_SHADOW_SILENT'] === '1' ||
        env['SOCKET_CLI_SHADOW_SILENT'] === 'true'
    }

    ObjectFreeze(ipcObject)
  }

  return key ? ipcObject[key] : ipcObject
}
