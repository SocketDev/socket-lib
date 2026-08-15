/**
 * @file Format descriptor for `Cargo.toml` — Rust's package manifest. Currently
 *   only used for `detectFormat` recognition; no parser is wired yet.
 */

import { ObjectFreeze } from '../../primordials/object.mjs'

import type { FormatDescriptor } from '../manifest/types.mjs'

export const CARGO_TOML_FORMAT = ObjectFreeze({
  __proto__: null,
  ecosystem: 'cargo',
  type: 'manifest',
}) as unknown as FormatDescriptor

export const CARGO_TOML_FILENAME = 'Cargo.toml'
