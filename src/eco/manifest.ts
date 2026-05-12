/**
 * @fileoverview Socket Registry manifest schema — per-ecosystem
 * package-list entries used by the registry build pipeline.
 *
 *   - `ManifestEntryData` — per-package metadata (name/version + tags)
 *   - `ManifestEntry`     — `[packageName, data]` tuple shape
 *   - `Manifest`          — top-level map keyed by ecosystem
 */

import type { CategoryString } from './category'
import type { InteropString } from './interop'
import type { EcosystemString } from './purl'

export type ManifestEntryData = {
  categories?: CategoryString[] | undefined
  interop?: InteropString | undefined
  license?: string | undefined
  name: string
  version: string
  [key: string]: unknown
}

export type ManifestEntry = [packageName: string, data: ManifestEntryData]

export type Manifest = Record<EcosystemString, ManifestEntry[]>
