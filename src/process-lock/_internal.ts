/**
 * @fileoverview Private internals for `process-lock/*` modules —
 * re-exports of the canonical node:fs / node:path lazy loaders under
 * the process-lock/ legacy names. New code should import getNodeFs /
 * getNodePath from `@socketsecurity/lib/node/{fs,path}` directly.
 */

export { getNodeFs as getFs } from '../node/fs'
export { getNodePath as getPath } from '../node/path'
