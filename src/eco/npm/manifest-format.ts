/**
 * @file Format descriptor for `package.json` — the manifest shape shared across
 *   the entire npm-family ecosystem (npm, pnpm, yarn, bun, vlt). Per-PM
 *   lockfile descriptors live next to their parsers under
 *   `src/eco/npm/<pm>/lockfile-format.ts`. Returned by
 *   `src/eco/manifest/detect-format.ts` when a filename matches
 *   `package.json`.
 */

import { ObjectFreeze } from '../../primordials/object'

import type { FormatDescriptor } from '../manifest/types'

export const PACKAGE_JSON_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'npm',
  type: 'manifest',
}) as unknown as FormatDescriptor

export const PACKAGE_JSON_FILENAME = 'package.json'
