/**
 * @file Generate a unique filepath by appending `-1`, `-2`, … before the
 *   extension until the path is free. Useful for "save next to existing" flows
 *   where overwriting silently would be wrong (PDF reports, exports, etc.).
 */

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import { normalizePath } from '../paths/normalize'

import type { PathLike } from 'node:fs'

/**
 * Generate a unique filepath by adding number suffix if the path exists.
 * Appends `-1`, `-2`, etc. before the file extension until a non-existent path
 * is found. Useful for creating files without overwriting existing ones.
 *
 * @example
 *   ;```ts
 *   // If 'report.pdf' exists, returns 'report-1.pdf'
 *   const uniquePath = uniqueSync('./report.pdf')
 *
 *   // If 'data.json' and 'data-1.json' exist, returns 'data-2.json'
 *   const path = uniqueSync('./data.json')
 *
 *   // If 'backup' doesn't exist, returns 'backup' unchanged
 *   const backupPath = uniqueSync('./backup')
 *   ```
 *
 * @param filepath - Desired file path.
 *
 * @returns Normalized unique filepath (original if it doesn't exist, or with
 *   number suffix)
 */
export function uniqueSync(filepath: PathLike): string {
  const fs = getNodeFs()
  const path = getNodePath()
  const filepathStr = String(filepath)

  // If the file doesn't exist, return as is
  if (!fs.existsSync(filepathStr)) {
    return normalizePath(filepathStr)
  }

  const dirname = path.dirname(filepathStr)
  const ext = path.extname(filepathStr)
  const basename = path.basename(filepathStr, ext)

  let counter = 1
  let uniquePath: string
  do {
    uniquePath = path.join(dirname, `${basename}-${counter}${ext}`)
    counter++
  } while (fs.existsSync(uniquePath))

  return normalizePath(uniquePath)
}
