/**
 * @file Single-file writes a concurrent reader can never catch half-finished.
 *   A plain `writeFileSync` truncates the target and then fills it. Between
 *   those two steps the file on disk is empty, and any reader that arrives in
 *   that window sees an empty file rather than the old contents. Crash there
 *   and the empty file is what survives, which is how a config file becomes a
 *   zero-byte config file that reads as "never configured".
 *   The fix is write-then-rename: fill a temp file in the SAME directory, then
 *   rename it over the target. A rename within one filesystem is atomic, so a
 *   reader observes either every old byte or every new byte. The temp file has
 *   to be a sibling — one in the system temp directory usually lands on another
 *   device, which silently degrades the rename into a copy and loses the whole
 *   guarantee.
 *   The temp name carries the pid so two processes writing the same target
 *   cannot collide on the scratch file, and a failed write deletes it rather
 *   than leaving a confusing half-file next to the real one.
 */

import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import { getNodeProcess } from '../node/process.mjs'

import { safeDeleteSync } from './safe.mjs'

import type { WriteFileOptions } from 'node:fs'

/**
 * How {@link writeFileAtomicSync} writes.
 *
 * @param encoding - Text encoding for the payload. Defaults to `'utf8'`.
 * @param mode - Permission bits for the created file. Defaults to `0o600`,
 *   because the callers that need atomicity are usually writing something worth
 *   keeping private; pass `0o644` for a world-readable file.
 */
export interface WriteFileAtomicOptions {
  encoding?: BufferEncoding | undefined
  mode?: number | undefined
}

/**
 * The sibling scratch path {@link writeFileAtomicSync} renames from.
 *
 * Exported because a caller cleaning up after a killed process needs to know
 * the shape of what was left behind, and because a name this load-bearing is
 * worth testing directly.
 *
 * @param filePath - The target file.
 * @param pid - The writing process id.
 *
 * @returns A dotted sibling path in the target's own directory.
 */
export function atomicTempPath(filePath: string, pid: number): string {
  const path = getNodePath()
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${pid}.tmp`,
  )
}

/**
 * Write `text` to `filePath` so a reader sees either the old bytes or the new
 * ones, never a partial file.
 *
 * Creates the target's directory when it does not exist, so a first write does
 * not need a separate mkdir. Throws whatever the underlying write or rename
 * threw, after deleting the scratch file.
 *
 * @example
 *   ;```js
 *   // Replace a config file without exposing an empty window.
 *   writeFileAtomicSync('~/.config/app/hosts.yml', text)
 *
 *   // A world-readable file needs the mode spelled out.
 *   writeFileAtomicSync('./build-info.json', json, { mode: 0o644 })
 *   ```
 *
 * @param filePath - Path to write to.
 * @param text - The payload.
 * @param options - See {@link WriteFileAtomicOptions}.
 */
export function writeFileAtomicSync(
  filePath: string,
  text: string,
  options?: WriteFileAtomicOptions | undefined,
): void {
  const opts = { __proto__: null, ...options } as WriteFileAtomicOptions
  const fs = getNodeFs()
  const path = getNodePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const nodeProcess = getNodeProcess()
  const temp = atomicTempPath(filePath, nodeProcess.pid)
  try {
    fs.writeFileSync(temp, text, {
      encoding: opts.encoding ?? 'utf8',
      mode: opts.mode ?? 0o600,
    } as WriteFileOptions)
    fs.renameSync(temp, filePath)
  } catch (e) {
    // A failed rename leaves the scratch file behind. A leftover dotfile beside
    // a real config is noise at best and a confusing half-config at worst.
    safeDeleteSync(temp)
    throw e
  }
}
