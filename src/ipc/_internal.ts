/**
 * @fileoverview Private internals for `ipc/*` modules — lazy
 * node:fs / node:path accessors, the IpcStub schema, and the
 * shared platform check. Used by every public IPC entrypoint.
 */

import { Type } from '../external/@sinclair/typebox'

/**
 * IPC stub file schema - validates the structure of stub files.
 * Stub files are used for passing data between processes via filesystem.
 */
export const IpcStubSchema = Type.Object({
  /** Process ID that created the stub. */
  pid: Type.Integer({ minimum: 1 }),
  /** Creation timestamp for age validation. */
  timestamp: Type.Number({ exclusiveMinimum: 0 }),
  /** The actual data payload. */
  data: Type.Unknown(),
})

// Re-export canonical node:fs / node:path loaders under the ipc/
// legacy names for siblings. New code should import getNodeFs /
// getNodePath from '@socketsecurity/lib/node/{fs,path}'.
export { getNodeFs as getFs } from '../node/fs'
export { getNodePath as getPath } from '../node/path'
