/**
 * @file Socket Registry ecosystem schema types — tags for packages and the
 *   manifest entries the registry build pipeline emits.
 *
 *   - `CategoryString` — registry intent tag (cleanup/levelup/...)
 *   - `InteropString` — module-format tag (cjs/esm/browserify)
 *   - `ManifestEntryData` — per-package metadata (name/version + tags)
 *   - `ManifestEntry` — `[packageName, data]` tuple shape
 *   - `Manifest` — top-level map keyed by ecosystem Constants and PURL ecosystem
 *     identifiers live in `./purl`.
 */

import type { EcosystemString } from './purl'

/**
 * Socket Registry category tag for packages.
 *
 * - `cleanup` — removes unused / unsafe code
 * - `levelup` — adds capabilities (modern API surface, new features)
 * - `speedup` — performance optimization
 * - `tuneup` — quality/reliability tweaks
 */
export type CategoryString = 'cleanup' | 'levelup' | 'speedup' | 'tuneup'

/**
 * Module-format interop tag for packages.
 *
 * - `browserify` — bundled for browser consumption (CJS + shims)
 * - `cjs` — CommonJS
 * - `esm` — ES modules
 */
export type InteropString = 'browserify' | 'cjs' | 'esm'

/**
 * Per-package metadata emitted into the manifest. The `[key: string]` tail
 * keeps the type open for ecosystem-specific extensions added by downstream
 * tooling.
 */
export type ManifestEntryData = {
  categories?: CategoryString[] | undefined
  interop?: InteropString | undefined
  license?: string | undefined
  name: string
  version: string
  [key: string]: unknown
}

/**
 * Single manifest entry as a `[name, data]` tuple — the on-disk shape used by
 * the registry build pipeline.
 */
export type ManifestEntry = [packageName: string, data: ManifestEntryData]

/**
 * Top-level manifest keyed by ecosystem (PURL slug).
 */
export type Manifest = Record<EcosystemString, ManifestEntry[]>
