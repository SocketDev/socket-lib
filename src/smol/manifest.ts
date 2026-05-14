/**
 * @fileoverview Lazy-loader for socket-btm's `node:smol-manifest`.
 *
 * `node:smol-manifest` is the manifest + lockfile parser exposed by
 * socket-btm's smol Node binary. It parses package.json, package-lock
 * (npm v1/v2/v3), yarn.lock (classic + berry), and pnpm-lock.yaml
 * (v5/v6/v9) with internal primordial-hardened parsing.
 *
 * Returns `undefined` on stock Node + non-Node runtimes. Result is
 * cached across calls. Callers fall back to the JS parsers under
 * `src/eco/<pm>/parse-*` on the undefined path.
 *
 * @internal — used by `src/eco/manifest/*` leaves to resolve the
 *   smol-aware parsers. Most callers should import the specific leaf
 *   (`@socketsecurity/lib/eco/manifest/parse`), which already routes
 *   through this when smol is present.
 */

import { isNodeBuiltin } from '../node/module'

import type { EcosystemString } from '../eco/purl'

/**
 * Dependency-relationship tag on a parsed package reference.
 *
 *   - `prod`     — runtime dependency
 *   - `dev`      — devDependency
 *   - `optional` — optionalDependency
 *   - `peer`     — peerDependency
 */
export type DepType = 'prod' | 'dev' | 'optional' | 'peer'

/**
 * A single package entry inside a parsed lockfile. Frozen plain
 * object with `__proto__: null` on smol; JS-fallback parsers return
 * the same shape so consumers can't tell which impl ran.
 */
export interface PackageRef {
  readonly name: string
  readonly version: string
  readonly resolved: string | undefined
  readonly integrity: string | undefined
  readonly ecosystem: EcosystemString
  readonly depType: DepType
  readonly isDev: boolean
  readonly isOptional: boolean
  readonly isPeer: boolean
  readonly isBundled: boolean
  readonly license?: string | undefined
  readonly vcsUrl: string | undefined
  readonly vcsCommit: string | undefined
  readonly dependencies: readonly string[]
}

/**
 * A single dependency entry inside a parsed manifest (package.json).
 */
export interface ManifestDep {
  readonly name: string
  readonly versionRange: string
  readonly type: DepType
  readonly optional: boolean
}

/**
 * Result of parsing a manifest (e.g. `package.json`).
 */
export interface ParsedManifest {
  readonly type: 'manifest'
  readonly name: string | undefined
  readonly version: string | undefined
  readonly description: string | undefined
  readonly license: string | undefined
  readonly repository: string | undefined
  readonly dependencies: readonly ManifestDep[]
  readonly ecosystem: EcosystemString
}

/**
 * Result of parsing a lockfile (npm/yarn/pnpm). `_index` is a private
 * name→index map (or `name→number[]` for multi-version) used by
 * `getPackage` / `getPackageVersions` for O(1) lookup.
 */
export interface ParsedLockfile {
  readonly type: 'lockfile'
  readonly lockVersion: string
  readonly ecosystem: EcosystemString
  readonly packages: readonly PackageRef[]
  readonly _index: Readonly<Record<string, number | readonly number[]>>
}

/**
 * Format descriptor returned by `detectFormat`.
 */
export interface FormatDescriptor {
  readonly ecosystem: EcosystemString
  readonly type: 'manifest' | 'lockfile'
  readonly format?: 'npm' | 'yarn' | 'pnpm' | 'composer'
}

/**
 * Supported-files index returned by `supportedFiles`.
 */
export interface SupportedFiles {
  readonly manifests: readonly string[]
  readonly lockfiles: readonly string[]
}

/**
 * Statistics returned by `analyzeLockfile`.
 */
export interface LockfileStats {
  readonly totalPackages: number
  readonly prodDeps: number
  readonly devDeps: number
  readonly optionalDeps: number
  readonly byEcosystem: Readonly<Record<string, number>>
  readonly maxDepth: number
  readonly avgDepth: number
}

/**
 * Error class thrown by every parser on invalid / unsupported input.
 * The `code` field is one of:
 *
 *   - `ERR_INVALID_JSON`    — JSON.parse failure
 *   - `ERR_UNKNOWN_FORMAT`  — filename or content didn't match a parser
 *   - `ERR_UNSUPPORTED`     — ecosystem not yet implemented
 */
export interface ManifestErrorLike extends Error {
  readonly name: 'ManifestError'
  readonly code: string
}

/**
 * Surface of `node:smol-manifest`. See socket-btm's
 * additions/source-patched/lib/smol-manifest.js for the canonical
 * shape.
 */
export interface SmolManifestBinding {
  parse(filename: string, content: string): ParsedManifest | ParsedLockfile
  parseManifest(content: string, ecosystem: EcosystemString): ParsedManifest
  parseLockfile(
    content: string,
    ecosystem: EcosystemString,
    format?: 'npm' | 'yarn' | 'pnpm' | 'composer',
  ): ParsedLockfile
  createStreamingParser(
    content: string,
    ecosystem: EcosystemString,
  ): AsyncIterableIterator<PackageRef>
  analyzeLockfile(lockfile: ParsedLockfile): LockfileStats
  getPackage(lockfile: ParsedLockfile, name: string): PackageRef | undefined
  getPackageVersions(
    lockfile: ParsedLockfile,
    name: string,
  ): readonly PackageRef[]
  findPackages(
    lockfile: ParsedLockfile,
    pattern: string | RegExp,
  ): readonly PackageRef[]
  detectFormat(filename: string): FormatDescriptor | undefined
  readonly supportedFiles: SupportedFiles
  readonly ManifestError: new (
    message: string,
    code: string,
  ) => ManifestErrorLike
}

let _smolManifest: SmolManifestBinding | undefined
let _smolManifestProbed = false

/**
 * Returns `node:smol-manifest` when running on the smol Node binary,
 * otherwise `undefined`. Result is cached across calls.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSmolManifest(): SmolManifestBinding | undefined {
  if (!_smolManifestProbed) {
    _smolManifestProbed = true
    if (isNodeBuiltin('node:smol-manifest')) {
      _smolManifest = require('node:smol-manifest') as SmolManifestBinding
    }
  }
  return _smolManifest
}
