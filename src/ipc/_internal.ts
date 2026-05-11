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

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

/**
 * Lazily load the fs module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getFs() {
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
export function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}
