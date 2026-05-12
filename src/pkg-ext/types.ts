/**
 * @fileoverview Public type surface for `pkg-ext/*` modules —
 * the `PackageExtension` tuple shape used by the merged Yarn /
 * Socket-curated extensions list. Pure types, no runtime side effects.
 */

export type PackageExtension = readonly [string, Record<string, unknown>]
