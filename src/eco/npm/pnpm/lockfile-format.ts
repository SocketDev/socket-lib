/**
 * @fileoverview Format descriptor for `pnpm-lock.yaml` — pnpm's
 * YAML-formatted lockfile (v5/v6/v9).
 *
 * Returned by `src/eco/manifest/detect-format.ts` when a filename
 * matches `pnpm-lock.yaml`.
 */

import { ObjectFreeze } from '../../../primordials/object'

import type { FormatDescriptor } from '../../manifest/types'

export const PNPM_LOCK_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'npm',
  format: 'pnpm',
  type: 'lockfile',
}) as unknown as FormatDescriptor

export const PNPM_LOCK_FILENAME = 'pnpm-lock.yaml'
