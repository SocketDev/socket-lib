/**
 * @file Format descriptor for npm lockfiles — covers both `package-lock.json`
 *   and `npm-shrinkwrap.json` (npm v1/v2/v3 lock formats share the parser).
 *   Returned by `src/eco/manifest/detect-format.ts` when a filename matches
 *   either of the two npm lockfile basenames.
 */

import { ObjectFreeze } from '../../../primordials/object'

import type { FormatDescriptor } from '../../manifest/types'

export const PACKAGE_LOCK_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'npm',
  format: 'npm',
  type: 'lockfile',
}) as unknown as FormatDescriptor

export const PACKAGE_LOCK_FILENAMES = ObjectFreeze([
  'package-lock.json',
  'npm-shrinkwrap.json',
])
