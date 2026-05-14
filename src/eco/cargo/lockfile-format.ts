/**
 * @fileoverview Format descriptor for `Cargo.lock` — Rust's
 * Cargo-managed lockfile.
 *
 * Returned by `src/eco/manifest/detect-format.ts` when a filename
 * matches `Cargo.lock`.
 */

import { ObjectFreeze } from '../../primordials/object'

import type { FormatDescriptor } from '../manifest/types'

export const CARGO_LOCK_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'cargo',
  format: 'cargo',
  type: 'lockfile',
}) as unknown as FormatDescriptor

export const CARGO_LOCK_FILENAME = 'Cargo.lock'
