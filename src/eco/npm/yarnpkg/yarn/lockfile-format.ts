/**
 * @fileoverview Format descriptor for `yarn.lock` — yarn's lockfile
 * (Classic v1 + Berry v6 share the filename; the parser
 * auto-discriminates on `__metadata:` presence).
 *
 * Returned by `src/eco/manifest/detect-format.ts` when a filename
 * matches `yarn.lock`.
 */

import { ObjectFreeze } from '../../../../primordials/object'

import type { FormatDescriptor } from '../../../manifest/types'

export const YARN_LOCK_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'npm',
  format: 'yarn',
  type: 'lockfile',
}) as unknown as FormatDescriptor

export const YARN_LOCK_FILENAME = 'yarn.lock'
