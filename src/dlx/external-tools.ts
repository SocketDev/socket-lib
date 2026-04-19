/**
 * @fileoverview Schema + loader for `external-tools.json` files.
 *
 * External-tools.json lives in CONSUMER repos (e.g., socket-registry's
 * `.github/actions/<name>/external-tools.json`). It enumerates the
 * external CLIs, binary releases, and npm packages that a given
 * repo/action pins for supply-chain integrity.
 *
 * socket-lib provides only the schema types and a loader that resolves
 * relative filesystem references (e.g., sibling `*.lock.json` files)
 * into absolute paths so they can be passed directly into `downloadPackage`
 * or `downloadBinary`.
 */

import type { HashSpec } from './integrity'

let _fs: typeof import('node:fs') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

let _path: typeof import('node:path') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Entry for a single external tool. Shape overlaps between binary and
 * npm-package tools, with optional fields for each flavor.
 */
export interface ExternalToolEntry {
  /** Human-readable description of the tool's role. */
  description?: string | undefined
  /** Free-form notes. String or array of strings per existing schema. */
  notes?: string | string[] | undefined

  /** Discriminator. 'npm' triggers downloadPackage; others trigger downloadBinary. */
  packageManager?: 'npm' | 'pip' | 'pnpm' | undefined

  // --- npm-package fields ---
  /** Package spec base, e.g., `'@anthropic-ai/claude-code'`. */
  package?: string | undefined
  /** Package version (semver exact). Combined with `package` into a full spec. */
  version?: string | undefined
  /** Absolute path to the pinned lockfile (resolved from sibling path by loader). */
  lockfile?: string | undefined

  // --- binary-release fields (existing socket-btm schema) ---
  /** GitHub repository `owner/repo`. */
  repository?: string | undefined
  /** Release type. */
  release?: 'asset' | 'archive' | undefined
  /** Release tag. */
  tag?: string | undefined
  /** Per-platform asset+sha256 map, keyed by platform-arch triple. */
  checksums?:
    | Record<string, { asset: string; sha256: string } | string>
    | undefined

  /**
   * Expected hash for integrity verification. For npm packages this is
   * the top-level tarball's integrity as advertised by the registry.
   * For binaries, this is a fallback when `checksums` is not used.
   */
  hash?: HashSpec | undefined
}

/**
 * Full external-tools.json document shape.
 */
export interface ExternalToolsDocument {
  $schema?: string | undefined
  description?: string | undefined
  /** Relative path to a base document to inherit from. */
  extends?: string | undefined
  tools: Record<string, ExternalToolEntry>
}

/**
 * Thrown when an external-tools.json file is malformed or references a
 * missing sibling path.
 */
export class ExternalToolsError extends Error {
  constructor(message: string, options?: { cause?: unknown } | undefined) {
    super(message, options)
    this.name = 'ExternalToolsError'
  }
}

async function readDocument(filepath: string): Promise<ExternalToolsDocument> {
  const fs = getFs()
  let raw: string
  try {
    raw = await fs.promises.readFile(filepath, 'utf8')
  } catch (e) {
    throw new ExternalToolsError(
      `Failed to read external-tools.json at ${filepath}`,
      { cause: e },
    )
  }
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch (e) {
    throw new ExternalToolsError(
      `Invalid JSON in external-tools.json at ${filepath}`,
      { cause: e },
    )
  }
  if (typeof doc !== 'object' || doc === null) {
    throw new ExternalToolsError(
      `external-tools.json must be a JSON object: ${filepath}`,
    )
  }
  const asDoc = doc as ExternalToolsDocument
  if (typeof asDoc.tools !== 'object' || asDoc.tools === null) {
    throw new ExternalToolsError(
      `external-tools.json missing required "tools" object: ${filepath}`,
    )
  }
  return asDoc
}

/**
 * Resolve relative paths inside a single entry against the loaded
 * document's directory. Currently only `lockfile` is a path.
 */
function resolveEntryPaths(
  entry: ExternalToolEntry,
  baseDir: string,
): ExternalToolEntry {
  const path = getPath()
  if (typeof entry.lockfile === 'string' && entry.lockfile.length > 0) {
    const resolved = path.isAbsolute(entry.lockfile)
      ? entry.lockfile
      : path.resolve(baseDir, entry.lockfile)
    return { ...entry, lockfile: resolved }
  }
  return entry
}

/**
 * Load and resolve an `external-tools.json` file.
 *
 * Behavior:
 *   1. Read + parse the given JSON file
 *   2. Resolve any `extends` chain (shallow merge: extending doc wins)
 *   3. For each entry, resolve `lockfile` relative paths to absolute paths
 *      (the path string is returned as-is; no file read is performed here)
 *   4. Return a frozen copy of the `tools` record
 *
 * Callers can then spread entries directly into `downloadPackage` /
 * `downloadBinary` options.
 *
 * @param filepath - Path to the `external-tools.json` file.
 */
export async function loadExternalTools(
  filepath: string,
): Promise<Readonly<Record<string, Readonly<ExternalToolEntry>>>> {
  const path = getPath()
  const absolute = path.resolve(filepath)
  const visited = new Set<string>()
  const chain: Array<{ doc: ExternalToolsDocument; dir: string }> = []
  let current = absolute
  while (current) {
    if (visited.has(current)) {
      throw new ExternalToolsError(
        `Circular extends chain in external-tools.json at ${current}`,
      )
    }
    visited.add(current)
    const doc = await readDocument(current)
    const dir = path.dirname(current)
    chain.unshift({ doc, dir })
    if (typeof doc.extends !== 'string' || doc.extends.length === 0) {
      break
    }
    current = path.isAbsolute(doc.extends)
      ? doc.extends
      : path.resolve(dir, doc.extends)
  }
  const merged = { __proto__: null } as unknown as Record<
    string,
    ExternalToolEntry
  >
  for (const { dir, doc } of chain) {
    for (const [key, entry] of Object.entries(doc.tools)) {
      merged[key] = resolveEntryPaths(entry, dir)
    }
  }
  const frozen = { __proto__: null } as unknown as Record<
    string,
    Readonly<ExternalToolEntry>
  >
  for (const [key, entry] of Object.entries(merged)) {
    frozen[key] = Object.freeze(entry) as Readonly<ExternalToolEntry>
  }
  return Object.freeze(frozen)
}
