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
 *
 * Source material (in lock-step order, newest → oldest):
 *
 *   1. **C++ native parser** in socket-btm/node-smol-builder:
 *      additions/source-patched/src/socketsecurity/manifest/parser_npm.cc
 *      Same algorithm, same fixes — keep the two in lock-step.
 *
 *   2. **socket-sdxgen** — algorithm oracle, broader production
 *      exposure:
 *      socket-sdxgen/src/parsers/npm/package-lock-v1.mts
 *      socket-sdxgen/src/parsers/npm/package-lock-v2.mts
 *      socket-sdxgen/src/parsers/npm/npm-shrinkwrap.mts
 *
 *   3. **cdxgen** (pinned v11.11.0) — sdxgen's upstream baseline:
 *      https://github.com/CycloneDX/cdxgen/blob/v11.11.0/lib/parsers/js.js
 *      (parseLockFile / parsePkgLock)
 *
 *   4. **npm lockfile specs**:
 *      v1 (legacy): https://docs.npmjs.com/cli/v6/configuring-npm/package-lock-json
 *      v2/v3:       https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json
 *      arborist (canonical reader/writer):
 *        https://github.com/npm/cli/tree/latest/workspaces/arborist
 *
 * Bug fixes implemented here (and in the native parser):
 *
 *   - Fix 1  v1 alias extraction. `version: "npm:<real>@<ver>"`
 *            surfaces the real registry identity on the PackageRef;
 *            `_index` keeps the original alias key for lookups.
 *
 *   - Fix 2a v2/v3 workspace path entries prefer `pkg.name` over
 *            path-derived fallback (workspace paths like
 *            `packages/ui` lack the `node_modules/` prefix).
 *
 *   - Fix 2b v2/v3 aliased installs (`node_modules/<alias>` with
 *            `name: "<real>"` field) prefer `pkg.name`. Same code
 *            path as Fix 2a.
 *
 * Regression fixtures live under socket-btm's test/fixtures/
 * sdxgen-bug-regressions/ — every shipped fix has a matching
 * fixture directory there.
 */

import { ManifestError } from '../../manifest/manifest-error'
import { errorMessage } from '../../../errors/message'
import { ArrayFrom, ArrayPrototypePush } from '../../../primordials/array'
import { RangeErrorCtor } from '../../../primordials/error'
import { JSONParse } from '../../../primordials/json'
import { SetCtor } from '../../../primordials/map-set'
import { ObjectFreeze, ObjectKeys } from '../../../primordials/object'
import { getSmolManifest } from '../../../smol/manifest'
import { extractPackageNameFromPath } from './extract-package-name-from-path'
import { parseGitUrl } from './parse-git-url'

import {
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../../../primordials/string'

import type { DepType, PackageRef, ParsedLockfile } from '../../manifest/types'

// Cap recursion depth on v1 nested `dependencies`. The `visited` set
// prevents cycles but not pathological linear nesting — an
// attacker-crafted lockfile 20k levels deep would blow the JS engine
// stack with a RangeError that unwinds past all caller try/catch.
// Real npm nesting is ~10 levels; 64 is a safe ceiling.
const MAX_LOCKFILE_DEPTH = 64

interface RawPackage {
  readonly name?: unknown
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
  // Aliased installs in npm v1 lockfiles encode the real identity in
  // the version field as `npm:<real-name>@<real-version>`. Emitting
  // the alias directly would produce a malformed purl
  // (`pkg:npm/alias@npm%3Areal%401.0`) pointing at a non-existent
  // package. Detect the prefix and extract the underlying name +
  // version so downstream consumers reference the actual registry
  // package.
  let effectiveName = name
  let version = typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  if (StringPrototypeStartsWith(version, 'npm:')) {
    const rest = StringPrototypeSlice(version, 'npm:'.length)
    const atIdx = StringPrototypeLastIndexOf(rest, '@')
    if (atIdx > 0) {
      effectiveName = StringPrototypeSlice(rest, 0, atIdx)
      version = StringPrototypeSlice(rest, atIdx + 1)
    }
  }
  return ObjectFreeze({
    __proto__: null,
    name: effectiveName,
    version,
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
  const visited = new SetCtor<string>()

  const flatten = (
    deps: Record<string, RawPackage>,
    parentPath: string,
    depth: number,
  ): void => {
    if (depth > MAX_LOCKFILE_DEPTH) {
      throw new RangeErrorCtor(
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
  const packages: PackageRef[] = ArrayFrom({
    length: rawPackages[''] !== undefined ? pkgKeys.length - 1 : pkgKeys.length,
  })
  let pkgCount = 0

  for (let ki = 0, { length } = pkgKeys; ki < length; ki++) {
    const pkgPath = pkgKeys[ki]!
    if (pkgPath === '') {
      continue
    }
    const pkg = rawPackages[pkgPath]!
    // Workspace entries in npm v2/v3 lockfiles are keyed by their
    // relative path (e.g. `packages/foo`) without a `node_modules/`
    // prefix. For those, prefer `pkg.name` from the entry body —
    // falling back to the path-derived name keeps node_modules/*
    // entries working unchanged. Same fallback chain covers aliased
    // installs (which carry the alias name in `pkg.name`).
    const nameFromPath = extractPackageNameFromPath(pkgPath)
    const name =
      typeof pkg.name === 'string' && pkg.name.length > 0
        ? pkg.name
        : nameFromPath
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
  ? /* c8 ignore next 2 - smol Node binary only. */
    (content: string) =>
      _smol.parseLockfile(content, 'npm', 'npm') as ParsedLockfile
  : jsParsePackageLock
