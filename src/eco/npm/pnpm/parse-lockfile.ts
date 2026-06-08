/**
 * @file `parsePnpmLock(content)` — parses a `pnpm-lock.yaml` (v5, v6, or v9)
 *   into a `ParsedLockfile`. On socket-btm's smol Node binary this routes to
 *   `node:smol-manifest`'s native `parseLockfile(content, 'npm', 'pnpm')`; on
 *   stock Node it runs the line-scanning JS impl below. The parser supports
 *   three top-level sections:
 *
 *   - `packages:` — pnpm v5/v6 main package entries
 *   - `snapshots:` — pnpm v9 main package entries
 *   - `importers:` — workspace/monorepo dependency declarations (extracted as
 *     ad-hoc package entries so SBOM tooling sees the workspace's own deps even
 *     when no `packages:` block lists them) Forgiving by design — unknown keys
 *     ignored, missing versions default to `0.0.0`. Never throws. Source
 *     material (in lock-step order, newest → oldest):
 *
 *   1. **C++ native parser** in socket-btm/node-smol-builder:
 *      additions/source-patched/src/socketsecurity/manifest/parser_pnpm.cc Same
 *      algorithm, same fixes — keep the two in lock-step.
 *   2. **socket-sdxgen** — algorithm oracle:
 *      socket-sdxgen/src/parsers/pnpm/pnpm-lock-v5.mts
 *      socket-sdxgen/src/parsers/pnpm/pnpm-lock-v6.mts
 *      socket-sdxgen/src/parsers/pnpm/pnpm-lock-v9.mts
 *   3. **cdxgen** (pinned v11.11.0):
 *      https://github.com/CycloneDX/cdxgen/blob/v11.11.0/lib/parsers/js.js
 *      (parsePnpmLock)
 *   4. **pnpm lockfile spec** + reference implementation:
 *      https://github.com/pnpm/spec/blob/834f2815cc61917fa133e10869a2d4e9391c36bf/lockfile/9.0.md
 *      https://github.com/pnpm/pnpm/blob/main/packages/lockfile-file/ Bug fixes
 *      implemented here (and in the native parser):
 *
 *   - Fix 3a Empty-version guard in importer block-shape walk — v9
 *     nested-property entries (`pkg:` parent + indented `version:` child) no
 *     longer emit a phantom parent PackageRef with `version: ''`.
 *   - Fix 3b workspace/file/link protocol filter — importer deps with
 *     `workspace:` / `file:` / `link:` values are workspace-local refs, not
 *     shippable registry artifacts.
 *   - Fix 5 pnpm v9 isDev derivation from importer prod/devOnly sets, post-pass
 *     classified. The v9 format dropped per- snapshot `dev: true` markers, so
 *     isDev must be derived from importers. Prior impls left every v9 snapshot
 *     as `depType: 'prod'`. Regression fixtures live under socket-btm's
 *     test/fixtures/ sdxgen-bug-regressions/ — every shipped fix has a matching
 *     fixture directory there.
 */

import { ArrayPrototypePush } from '../../../primordials/array'
import { ObjectFreeze } from '../../../primordials/object'
import { RegExpPrototypeExec } from '../../../primordials/regexp'
import {
  StringPrototypeEndsWith,
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeTrim,
} from '../../../primordials/string'
import { getSmolManifest } from '../../../smol/manifest'
import { detectPnpmVersion } from './detect-pnpm-version'
import { parsePnpmPackageIdV5 } from './parse-pnpm-package-id-v5'
import { parsePnpmPackageIdV6V9 } from './parse-pnpm-package-id-v6-v9'

import type { DepType, PackageRef, ParsedLockfile } from '../../manifest/types'

const RE_INTEGRITY = /integrity:\s*([a-zA-Z0-9+/=-]+)/
const RE_TARBALL = /tarball:\s*['"]?([^'"}\s]+)['"]?/

type PackageIndex = Record<string, number | number[]>

interface PnpmEntry {
  name: string
  version: string
  resolved: string | undefined
  integrity: string | undefined
  ecosystem: 'npm'
  depType: DepType
  isDev: boolean
  isOptional: boolean
  isPeer: boolean
  isBundled: boolean
  vcsUrl: string | undefined
  vcsCommit: string | undefined
  dependencies: string[]
  _inDeps: boolean
}

interface ImporterState {
  section: 'prod' | 'dev' | 'optional' | undefined
}

export function addToPnpmIndex(
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

export function freezeEntry(entry: PnpmEntry): PackageRef {
  // Strip the _inDeps cursor so it doesn't leak into SBOM output.
  const { _inDeps, ...rest } = entry
  void _inDeps
  return ObjectFreeze({
    __proto__: null,
    ...rest,
  }) as unknown as PackageRef
}

export function indentOf(line: string): number {
  let indent = 0
  while (
    indent < line.length &&
    (line[indent] === '\t' || line[indent] === ' ')
  ) {
    indent++
  }
  return indent
}

export function jsParsePnpmLock(content: string): ParsedLockfile {
  const packages: PackageRef[] = []
  const packageIndex: PackageIndex = {
    __proto__: null,
  } as unknown as PackageIndex
  const lockVersion = detectPnpmVersion(content)

  let inPackages = false
  let inSnapshots = false
  let inImporters = false
  let currentPkg: PnpmEntry | undefined
  let currentIndent = 0
  let currentImporter: ImporterState | undefined
  let importerIndent = 0

  let pos = 0
  while (pos < content.length) {
    const eol = StringPrototypeIndexOf(content, '\n', pos)
    const end = eol === -1 ? content.length : eol
    const line = StringPrototypeSlice(content, pos, end)
    pos = end + 1

    const trimmed = StringPrototypeTrim(line)

    if (trimmed === 'packages:') {
      inPackages = true
      inSnapshots = false
      inImporters = false
      continue
    }
    if (trimmed === 'snapshots:') {
      inSnapshots = true
      inPackages = false
      inImporters = false
      continue
    }
    if (trimmed === 'importers:') {
      inImporters = true
      inPackages = false
      inSnapshots = false
      continue
    }

    // New top-level section ends current section.
    if (
      line[0] !== ' ' &&
      line[0] !== '\t' &&
      trimmed.length > 0 &&
      trimmed !== 'packages:' &&
      trimmed !== 'snapshots:' &&
      trimmed !== 'importers:'
    ) {
      inPackages = false
      inSnapshots = false
      inImporters = false
      continue
    }

    if (inImporters) {
      const indent = indentOf(line)
      if (indent === 2 && StringPrototypeEndsWith(trimmed, ':')) {
        currentImporter = { section: undefined }
        importerIndent = indent
        continue
      }
      if (currentImporter && indent > importerIndent) {
        if (StringPrototypeIndexOf(trimmed, 'devDependencies:') === 0) {
          currentImporter.section = 'dev'
        } else if (
          StringPrototypeIndexOf(trimmed, 'optionalDependencies:') === 0
        ) {
          currentImporter.section = 'optional'
        } else if (StringPrototypeIndexOf(trimmed, 'dependencies:') === 0) {
          currentImporter.section = 'prod'
        } else if (indent > importerIndent + 2) {
          // pnpm v9 nests each dep as a block — skip its sub-properties.
          if (
            StringPrototypeIndexOf(trimmed, 'specifier:') === 0 ||
            StringPrototypeIndexOf(trimmed, 'version:') === 0 ||
            StringPrototypeIndexOf(trimmed, 'resolution:') === 0
          ) {
            continue
          }
          const colonIdx = StringPrototypeIndexOf(trimmed, ':')
          if (colonIdx > 0) {
            const depName = StringPrototypeSlice(trimmed, 0, colonIdx)
            const depVersion = StringPrototypeTrim(
              StringPrototypeSlice(trimmed, colonIdx + 1),
            )
            // Skip block-style v9 importer entries (where the parent
            // line is `name:` and the version is nested under it as a
            // separate `version:` property). The nested-line skip above
            // handles the children; this guard stops the parent line
            // from being emitted with empty version. Also skip
            // workspace-local protocol refs (`link:` / `workspace:` /
            // `file:`) — they aren't shippable artifacts.
            if (
              depVersion.length === 0 ||
              StringPrototypeIndexOf(depVersion, 'link:') === 0 ||
              StringPrototypeIndexOf(depVersion, 'workspace:') === 0 ||
              StringPrototypeIndexOf(depVersion, 'file:') === 0
            ) {
              continue
            }
            const versionWithoutPeer = stripPeerSuffix(depVersion)
            if (packageIndex[depName] === undefined) {
              const section = currentImporter.section
              const ref = ObjectFreeze({
                __proto__: null,
                name: depName,
                version: versionWithoutPeer,
                resolved: undefined,
                integrity: undefined,
                ecosystem: 'npm',
                depType:
                  section === 'dev'
                    ? 'dev'
                    : section === 'optional'
                      ? 'optional'
                      : 'prod',
                isDev: section === 'dev',
                isOptional: section === 'optional',
                isPeer: false,
                isBundled: false,
                vcsUrl: undefined,
                vcsCommit: undefined,
                dependencies: [],
              }) as unknown as PackageRef
              ArrayPrototypePush(packages, ref)
              packageIndex[depName] = packages.length - 1
            }
          }
        }
      }
      continue
    }

    if (!inPackages && !inSnapshots) {
      continue
    }

    const indent = indentOf(line)
    // A package entry must end with `:`, sit at indent 2-4, and — if
    // we're already inside one — be at the same depth or shallower
    // (deeper means it's a property block of the current entry).
    const isPackageEntry =
      indent >= 2 &&
      indent <= 4 &&
      StringPrototypeEndsWith(trimmed, ':') &&
      trimmed.length > 1 &&
      (currentPkg === undefined || indent <= currentIndent)

    if (isPackageEntry) {
      if (currentPkg?.name) {
        const ref = freezeEntry(currentPkg)
        ArrayPrototypePush(packages, ref)
        addToPnpmIndex(packageIndex, currentPkg.name, packages.length - 1)
      }
      const key = StringPrototypeSlice(trimmed, 0, -1)
      const parsed =
        key[0] === '/' ? parsePnpmPackageIdV5(key) : parsePnpmPackageIdV6V9(key)
      currentPkg = newPnpmEntry(parsed.name, parsed.version)
      currentIndent = indent
      continue
    }

    if (currentPkg && indent > currentIndent) {
      if (StringPrototypeIndexOf(trimmed, 'dev:') === 0) {
        if (StringPrototypeIndexOf(trimmed, 'true') !== -1) {
          currentPkg.depType = 'dev'
          currentPkg.isDev = true
        }
      } else if (StringPrototypeIndexOf(trimmed, 'optional:') === 0) {
        if (StringPrototypeIndexOf(trimmed, 'true') !== -1) {
          currentPkg.depType = 'optional'
          currentPkg.isOptional = true
        }
      } else if (StringPrototypeIndexOf(trimmed, 'integrity:') === 0) {
        currentPkg.integrity = StringPrototypeTrim(
          StringPrototypeSlice(trimmed, 10),
        )
      } else if (StringPrototypeIndexOf(trimmed, 'resolution:') === 0) {
        const intMatch = RegExpPrototypeExec(RE_INTEGRITY, trimmed)
        if (intMatch) {
          currentPkg.integrity = intMatch[1]
        }
        const tarballMatch = RegExpPrototypeExec(RE_TARBALL, trimmed)
        if (tarballMatch) {
          currentPkg.resolved = tarballMatch[1]
        }
      } else if (StringPrototypeIndexOf(trimmed, 'dependencies:') === 0) {
        currentPkg.dependencies = []
        currentPkg._inDeps = true
      } else if (
        currentPkg._inDeps &&
        (StringPrototypeIndexOf(trimmed, 'peerDependencies:') === 0 ||
          StringPrototypeIndexOf(trimmed, 'optionalDependencies:') === 0 ||
          StringPrototypeIndexOf(trimmed, 'engines:') === 0 ||
          StringPrototypeIndexOf(trimmed, 'os:') === 0 ||
          StringPrototypeIndexOf(trimmed, 'cpu:') === 0 ||
          StringPrototypeIndexOf(trimmed, 'bin:') === 0)
      ) {
        currentPkg._inDeps = false
      } else if (currentPkg._inDeps && indent > currentIndent + 2) {
        const colonIdx = StringPrototypeIndexOf(trimmed, ':')
        if (colonIdx > 0) {
          ArrayPrototypePush(
            currentPkg.dependencies,
            StringPrototypeSlice(trimmed, 0, colonIdx),
          )
        }
      }
    }
  }

  if (currentPkg?.name) {
    const ref = freezeEntry(currentPkg)
    ArrayPrototypePush(packages, ref)
    addToPnpmIndex(packageIndex, currentPkg.name, packages.length - 1)
  }

  return ObjectFreeze({
    __proto__: null,
    type: 'lockfile',
    lockVersion: String(lockVersion),
    ecosystem: 'npm',
    packages: ObjectFreeze(packages),
    _index: packageIndex,
  }) as unknown as ParsedLockfile
}

export function newPnpmEntry(name: string, version: string): PnpmEntry {
  return {
    name,
    version,
    resolved: undefined,
    integrity: undefined,
    ecosystem: 'npm',
    depType: 'prod',
    isDev: false,
    isOptional: false,
    isPeer: false,
    isBundled: false,
    vcsUrl: undefined,
    vcsCommit: undefined,
    dependencies: [],
    _inDeps: false,
  }
}

export function stripPeerSuffix(version: string): string {
  const underIdx = StringPrototypeIndexOf(version, '_')
  const noUnderscore =
    underIdx !== -1 ? StringPrototypeSlice(version, 0, underIdx) : version
  const parenIdx = StringPrototypeIndexOf(noUnderscore, '(')
  return parenIdx !== -1
    ? StringPrototypeSlice(noUnderscore, 0, parenIdx)
    : noUnderscore
}

const smol = getSmolManifest()

export const parsePnpmLock: (content: string) => ParsedLockfile = smol
  ? /* c8 ignore next 2 - smol Node binary only. */
    (content: string) =>
      smol.parseLockfile(content, 'npm', 'pnpm') as ParsedLockfile
  : jsParsePnpmLock
