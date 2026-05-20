/**
 * @file Reader for `external-tools.json` — the fleet manifest describing
 *   downloadable external binaries (sfw, zizmor, etc.) with pinned versions,
 *   per-platform asset names, and integrity hashes. The manifest itself is
 *   hand-maintained in each fleet repo's root (`<repo>/external-tools.json`)
 *   and consumed by the setup-and-install GitHub action. This reader gives
 *   in-process consumers (external- tools resolvers, ad-hoc scripts) the same
 *   typed view without each one re-implementing the JSON-parse + shape check +
 *   integrity-string validation. Shape: { "<tool-name>": { "description":
 *   "human-readable summary", "version": "1.7.2", "release": "asset" |
 *   "tarball" | ..., "repository": "github:owner/repo", "notes": [...],
 *   "checksums": { "<platform-arch>": { "asset": "<asset-filename>",
 *   "integrity": "sha256-base64=" } } } } Some tools have flavor variants (e.g.
 *   sfw's `free` / `enterprise`) that wrap the `{repository, binaryName,
 *   checksums}` triple under a flavor key. Use `getToolFlavor` for those. Some
 *   entries (e.g. `rust`) describe a system tool with a different shape —
 *   they're skipped by `getTool` and fully readable only via the raw
 *   `readManifest` returning unknown.
 */

import { readJson } from '../fs/read-json'
import { isIntegrityString } from '../integrity'

import { ArrayIsArray } from '../primordials/array'
import { ErrorCtor } from '../primordials/error'

/**
 * Lookup helper — return the plain tool entry for `toolName`, or `undefined` if
 * the manifest doesn't have it or the entry is flavored / other-shape.
 */
export function getTool(
  manifest: Manifest,
  toolName: string,
): ToolEntry | undefined {
  const entry = manifest.tools[toolName]
  return entry?.kind === 'tool' ? entry.entry : undefined
}

/**
 * Lookup helper — return the specific flavor of a flavored tool, or `undefined`
 * if the tool isn't flavored or the flavor doesn't exist.
 */
export function getToolFlavor(
  manifest: Manifest,
  toolName: string,
  flavor: string,
): ToolFlavor | undefined {
  const entry = manifest.tools[toolName]
  if (entry?.kind !== 'flavored') {
    return undefined
  }
  return entry.entry.flavors[flavor]
}

/**
 * Per-platform asset record: which filename to fetch from the release, plus the
 * integrity hash to verify against.
 */
export interface ToolChecksum {
  /**
   * Asset filename on the GitHub release page.
   */
  asset: string
  /**
   * SRI integrity string, e.g. `sha256-<base64>=`. Validated on read.
   */
  integrity: string
}

/**
 * A downloadable-binary tool entry. `checksums` is keyed by the fleet's
 * platform-arch token (`darwin-arm64`, `linux-x64-musl`, `win-x64`, etc. — same
 * vocabulary as `getPlatformArch`).
 */
export interface ToolEntry {
  description: string
  version: string
  release: string
  repository: string
  binaryName?: string | undefined
  notes?: readonly string[] | undefined
  checksums: Readonly<Record<string, ToolChecksum>>
}

/**
 * A flavored tool entry — sfw is the canonical example, with `free` and
 * `enterprise` variants sharing the same outer `description` / `version` /
 * `release` but each carrying its own `{repository, binaryName, checksums}`.
 */
export interface FlavoredToolEntry {
  description: string
  version: string
  release: string
  notes?: readonly string[] | undefined
  flavors: Readonly<Record<string, ToolFlavor>>
}

export interface ToolFlavor {
  repository: string
  binaryName?: string | undefined
  checksums: Readonly<Record<string, ToolChecksum>>
}

/**
 * Parsed manifest. `tools` is a flat map; the values are unions because some
 * tools are plain (`ToolEntry`) and some are flavored (`FlavoredToolEntry`).
 * Unknown shapes (rust's `components` entry, future variants) come back as `{
 * kind: 'other'; raw: unknown }` so callers can opt in to handle them.
 */
export interface Manifest {
  tools: Readonly<Record<string, ManifestEntry>>
}

export type ManifestEntry =
  | { kind: 'tool'; entry: ToolEntry }
  | { kind: 'flavored'; entry: FlavoredToolEntry }
  | { kind: 'other'; raw: unknown }

interface RawChecksum {
  asset?: unknown
  integrity?: unknown
}

interface RawFlavor {
  repository?: unknown
  binaryName?: unknown
  checksums?: unknown
}

interface RawToolEntry {
  description?: unknown
  version?: unknown
  release?: unknown
  repository?: unknown
  binaryName?: unknown
  notes?: unknown
  checksums?: unknown
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !ArrayIsArray(value)
}

export function parseChecksum(
  raw: unknown,
  toolName: string,
  platformKey: string,
): ToolChecksum {
  if (!isObject(raw)) {
    throw new ErrorCtor(
      `external-tools.json: tool '${toolName}' checksum entry '${platformKey}' must be an object, got: ${typeof raw}`,
    )
  }
  const r = raw as RawChecksum
  if (typeof r.asset !== 'string' || r.asset.length === 0) {
    throw new ErrorCtor(
      `external-tools.json: tool '${toolName}' platform '${platformKey}' is missing a non-empty 'asset' string`,
    )
  }
  if (typeof r.integrity !== 'string' || !isIntegrityString(r.integrity)) {
    throw new ErrorCtor(
      `external-tools.json: tool '${toolName}' platform '${platformKey}' has an invalid 'integrity' (expected SRI sha512 or sha256 form): ${r.integrity}`,
    )
  }
  return { asset: r.asset, integrity: r.integrity }
}

export function parseChecksums(
  raw: unknown,
  toolName: string,
): Record<string, ToolChecksum> {
  if (!isObject(raw)) {
    throw new ErrorCtor(
      `external-tools.json: tool '${toolName}' is missing a 'checksums' object`,
    )
  }
  const out: Record<string, ToolChecksum> = {}
  for (const platformKey of Object.keys(raw)) {
    out[platformKey] = parseChecksum(raw[platformKey], toolName, platformKey)
  }
  return out
}

export function parseToolEntry(raw: unknown, toolName: string): ManifestEntry {
  if (!isObject(raw)) {
    return { kind: 'other', raw }
  }
  const r = raw as RawToolEntry
  // Heuristic: if there's a top-level `checksums` object, it's a
  // plain tool entry. If not, try to parse as flavored. Otherwise
  // surface as 'other' so callers can opt in.
  if (isObject(r.checksums)) {
    if (
      typeof r.description !== 'string' ||
      typeof r.version !== 'string' ||
      typeof r.release !== 'string' ||
      typeof r.repository !== 'string'
    ) {
      return { kind: 'other', raw }
    }
    return {
      kind: 'tool',
      entry: {
        description: r.description,
        version: r.version,
        release: r.release,
        repository: r.repository,
        binaryName: typeof r.binaryName === 'string' ? r.binaryName : undefined,
        notes: ArrayIsArray(r.notes) ? (r.notes as string[]) : undefined,
        checksums: parseChecksums(r.checksums, toolName),
      },
    }
  }
  const flavored = tryParseFlavored(raw as Record<string, unknown>, toolName)
  if (flavored) {
    return { kind: 'flavored', entry: flavored }
  }
  return { kind: 'other', raw }
}

/**
 * Read an `external-tools.json` file from disk and return the parsed manifest.
 * Throws on malformed JSON or invalid integrity strings; unknown-shape entries
 * (rust components, future variants) come back as `{kind: 'other', raw}` so
 * callers can handle them out-of-band without blocking the manifest read.
 */
export async function readExternalToolsManifest(
  filepath: string,
): Promise<Manifest> {
  const raw = await readJson(filepath)
  if (!isObject(raw)) {
    throw new ErrorCtor(
      `external-tools.json: expected top-level object, got: ${typeof raw}`,
    )
  }
  const tools: Record<string, ManifestEntry> = {}
  for (const toolName of Object.keys(raw)) {
    if (toolName.startsWith('$')) {
      // Skip JSON-Schema metadata keys like $schema.
      continue
    }
    tools[toolName] = parseToolEntry(raw[toolName], toolName)
  }
  return { tools }
}

export function tryParseFlavored(
  raw: Record<string, unknown>,
  toolName: string,
): FlavoredToolEntry | undefined {
  // Flavored entries have at least one nested object that itself has
  // a 'checksums' field — those are the flavor variants.
  const flavors: Record<string, ToolFlavor> = {}
  for (const key of Object.keys(raw)) {
    const value = raw[key]
    if (!isObject(value)) {
      continue
    }
    const rf = value as RawFlavor
    if (!isObject(rf.checksums)) {
      continue
    }
    if (typeof rf.repository !== 'string') {
      continue
    }
    flavors[key] = {
      repository: rf.repository,
      binaryName: typeof rf.binaryName === 'string' ? rf.binaryName : undefined,
      checksums: parseChecksums(rf.checksums, `${toolName}.${key}`),
    }
  }
  if (Object.keys(flavors).length === 0) {
    return undefined
  }
  return {
    description: String(raw['description'] ?? ''),
    version: String(raw['version'] ?? ''),
    release: String(raw['release'] ?? ''),
    notes: ArrayIsArray(raw['notes']) ? (raw['notes'] as string[]) : undefined,
    flavors,
  }
}
