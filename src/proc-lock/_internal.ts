/**
 * @fileoverview Private internals for `proc-lock/*` modules —
 * re-exports of the canonical node:fs / node:path lazy loaders under
 * the proc-lock/ legacy names. New code should import getNodeFs /
 * getNodePath from `@socketsecurity/lib/node/{fs,path}` directly.
 */

export { getNodeFs as getFs } from '../node/fs'
export { getNodePath as getPath } from '../node/path'
