/**
 * @fileoverview Format descriptor for `Cargo.toml` — Rust's package
 * manifest. Currently only used for `detectFormat` recognition; no
 * parser is wired yet.
 */

import { ObjectFreeze } from '../../primordials/object'

import type { FormatDescriptor } from '../manifest/types'

export const CARGO_TOML_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'cargo',
  type: 'manifest',
}) as unknown as FormatDescriptor

export const CARGO_TOML_FILENAME = 'Cargo.toml'
