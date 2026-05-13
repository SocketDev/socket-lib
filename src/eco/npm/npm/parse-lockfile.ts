/**
 * @fileoverview `parsePackageLock(content)` — parses an npm
 * `package-lock.json` / `npm-shrinkwrap.json` (v1/v2/v3) into a
 * `ParsedLockfile`.
 *
 * On socket-btm's smol Node binary this routes to
 * `node:smol-manifest`'s native `parseLockfile(content, 'npm',
 * 'npm')`; on stock Node it runs the JS impl below.
 *
 * Throws:
 *   - `ManifestError(ERR_INVALID_JSON)` — JSON.parse failure
 *   - `RangeError` — v1 nested-deps exceed `MAX_LOCKFILE_DEPTH = 64`,
 *     surfaces malformed input rather than blowing the JS stack
 *
 * v2/v3 uses the flat `packages` key; v1 uses recursive `dependencies`.
 * The two paths converge on the same `ParsedLockfile` shape so
 * downstream consumers don't branch on `lockVersion`.
 */

import { ManifestError } from '../../manifest/manifest-error'
import { errorMessage } from '../../../errors/message'
import { ArrayPrototypePush } from '../../../primordials/array'
import { JSONParse } from '../../../primordials/json'
import { ObjectFreeze, ObjectKeys } from '../../../primordials/object'
import { getSmolManifest } from '../../../smol/manifest'
import { extractPackageNameFromPath } from './extract-package-name-from-path'
import { parseGitUrl } from './parse-git-url'

import type { DepType, PackageRef, ParsedLockfile } from '../../manifest/types'

// Cap recursion depth on v1 nested `dependencies`. The `visited` set
// prevents cycles but not pathological linear nesting — an
// attacker-crafted lockfile 20k levels deep would blow the JS engine
// stack with a RangeError that unwinds past all caller try/catch.
// Real npm nesting is ~10 levels; 64 is a safe ceiling.
const MAX_LOCKFILE_DEPTH = 64

interface RawPackage {
  readonly version?: unknown
  readonly resolved?: unknown
  readonly integrity?: unknown
  readonly dev?: unknown
  readonly optional?: unknown
  readonly peer?: unknown
  readonly inBundle?: unknown
  readonly license?: unknown
  readonly dependencies?: unknown
  readonly requires?: unknown
}

interface RawLockfile {
  readonly lockfileVersion?: unknown
  readonly packages?: Record<string, RawPackage>
  readonly dependencies?: Record<string, RawPackage>
}

type PackageIndex = Record<string, number | number[]>

export function addToIndex(
  packageIndex: PackageIndex,
  name: string,
  idx: number,
): void {
  const existing = packageIndex[name]
  if (existing === undefined) {
    packageIndex[name] = idx
  } else if (typeof existing === 'number') {
    packageIndex[name] = [existing, idx]
  } else {
    ArrayPrototypePush(existing, idx)
  }
}

export function buildPackageRef(name: string, pkg: RawPackage): PackageRef {
  let vcsUrl: string | undefined
  let vcsCommit: string | undefined
  if (typeof pkg.resolved === 'string') {
    const gitMatch = parseGitUrl(pkg.resolved)
    if (gitMatch) {
      vcsUrl = gitMatch.url
      vcsCommit = gitMatch.commit
    }
  }
  const depsKey = pkg.dependencies ?? pkg.requires
  const dependencies =
    depsKey && typeof depsKey === 'object'
      ? ObjectKeys(depsKey as Record<string, unknown>)
      : []
  return ObjectFreeze({
    __proto__: null,
    name,
    version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
    resolved: typeof pkg.resolved === 'string' ? pkg.resolved : undefined,
    integrity: typeof pkg.integrity === 'string' ? pkg.integrity : undefined,
    ecosystem: 'npm',
    depType: resolveDepType(pkg),
    isDev: !!pkg.dev,
    isOptional: !!pkg.optional,
    isPeer: !!pkg.peer,
    isBundled: !!pkg.inBundle,
    license: typeof pkg.license === 'string' ? pkg.license : undefined,
    vcsUrl,
    vcsCommit,
    dependencies,
  }) as unknown as PackageRef
}

export function jsParsePackageLock(content: string): ParsedLockfile {
  let data: RawLockfile
  try {
    data = JSONParse(content) as RawLockfile
  } catch (e) {
    throw new ManifestError(
      `Invalid JSON: ${errorMessage(e)}`,
      'ERR_INVALID_JSON',
    )
  }
  if (data.packages) {
    return parseV2V3(data, data.packages)
  }
  if (data.dependencies) {
    return parseV1(data, data.dependencies)
  }
  // Empty lockfile — return shape with zero packages.
  return ObjectFreeze({
    __proto__: null,
    type: 'lockfile',
    lockVersion: String(data.lockfileVersion ?? 1),
    ecosystem: 'npm',
    packages: ObjectFreeze([] as PackageRef[]),
    _index: { __proto__: null } as unknown as PackageIndex,
  }) as unknown as ParsedLockfile
}

export function parseV1(
  data: RawLockfile,
  rootDeps: Record<string, RawPackage>,
): ParsedLockfile {
  const packageIndex: PackageIndex = {
    __proto__: null,
  } as unknown as PackageIndex
  const packages: PackageRef[] = []
  const visited = new Set<string>()

  const flatten = (
    deps: Record<string, RawPackage>,
    parentPath: string,
    depth: number,
  ): void => {
    if (depth > MAX_LOCKFILE_DEPTH) {
      throw new RangeError(
        `Lockfile dependency nesting exceeds ${MAX_LOCKFILE_DEPTH} levels at ${parentPath}`,
      )
    }
    const depKeys = ObjectKeys(deps)
    for (let di = 0, { length } = depKeys; di < length; di++) {
      const name = depKeys[di]!
      const pkg = deps[name]!
      const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0'
      const key = `${name}@${version}`
      if (visited.has(key)) {
        continue
      }
      if (packageIndex[name] === undefined) {
        const ref = buildPackageRef(name, pkg)
        ArrayPrototypePush(packages, ref)
        packageIndex[name] = packages.length - 1
      }
      if (pkg.dependencies && typeof pkg.dependencies === 'object') {
        visited.add(key)
        flatten(
          pkg.dependencies as Record<string, RawPackage>,
          `${parentPath}/${name}`,
          depth + 1,
        )
        visited.delete(key)
      }
    }
  }
  flatten(rootDeps, '', 0)

  return ObjectFreeze({
    __proto__: null,
    type: 'lockfile',
    lockVersion: String(data.lockfileVersion ?? 1),
    ecosystem: 'npm',
    packages: ObjectFreeze(packages),
    _index: packageIndex,
  }) as unknown as ParsedLockfile
}

export function parseV2V3(
  data: RawLockfile,
  rawPackages: Record<string, RawPackage>,
): ParsedLockfile {
  const packageIndex: PackageIndex = {
    __proto__: null,
  } as unknown as PackageIndex
  const pkgKeys = ObjectKeys(rawPackages)
  // Pre-size: subtract 1 for the root '' entry if present.
  const packages: PackageRef[] = Array.from({
    length: rawPackages[''] !== undefined ? pkgKeys.length - 1 : pkgKeys.length,
  })
  let pkgCount = 0

  for (let ki = 0, { length } = pkgKeys; ki < length; ki++) {
    const pkgPath = pkgKeys[ki]!
    if (pkgPath === '') {
      continue
    }
    const pkg = rawPackages[pkgPath]!
    const name = extractPackageNameFromPath(pkgPath)
    const ref = buildPackageRef(name, pkg)
    packages[pkgCount] = ref
    addToIndex(packageIndex, name, pkgCount)
    pkgCount++
  }
  packages.length = pkgCount

  return ObjectFreeze({
    __proto__: null,
    type: 'lockfile',
    lockVersion: String(data.lockfileVersion ?? 1),
    ecosystem: 'npm',
    packages: ObjectFreeze(packages),
    _index: packageIndex,
  }) as unknown as ParsedLockfile
}

export function resolveDepType(pkg: RawPackage): DepType {
  if (pkg.dev) {
    return 'dev'
  }
  if (pkg.optional) {
    return 'optional'
  }
  if (pkg.peer) {
    return 'peer'
  }
  return 'prod'
}

const _smol = getSmolManifest()

export const parsePackageLock: (content: string) => ParsedLockfile = _smol
  ? (content: string) =>
      _smol.parseLockfile(content, 'npm', 'npm') as ParsedLockfile
  : jsParsePackageLock
