/**
 * @file `jsParseBunLock(content)` — parse the text `bun.lock` (bun v1.2+).
 */

import { ArrayPrototypePush } from '../../../../primordials/array.mjs'
import { ObjectFreeze } from '../../../../primordials/object.mjs'
import {
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../../../../primordials/string.mjs'

import { parseGitDep } from '../../parse-git-dep.mjs'

import type { PackageRef, ParsedLockfile } from '../../../manifest/types.mjs'

const WORKSPACE_PROTOCOL = 'workspace:'

export interface RawBunLockfile {
  readonly lockfileVersion?: number | undefined
  // oxlint-disable-next-line socket/prefer-refined-record -- bun lockfile shape
  readonly packages?: Record<string, unknown[]> | undefined
}

export interface BunMeta {
  readonly dependencies?: Record<string, string> | undefined
  readonly optionalDependencies?: Record<string, string> | undefined
  readonly peerDependencies?: Record<string, string> | undefined
}

export function dependencyNames(meta: BunMeta | undefined): string[] {
  if (!meta) {
    return []
  }
  const names: string[] = []
  const groups = [
    meta.dependencies,
    meta.optionalDependencies,
    meta.peerDependencies,
  ]
  for (let i = 0, { length } = groups; i < length; i += 1) {
    const group = groups[i]
    if (!group) {
      continue
    }
    const keys = Object.keys(group)
    for (let j = 0, keyCount = keys.length; j < keyCount; j += 1) {
      ArrayPrototypePush(names, keys[j]!)
    }
  }
  return names
}

export function jsParseBunLock(content: string): ParsedLockfile {
  const packages: PackageRef[] = []
  const packageIndex: Record<string, number | number[]> = Object.create(null)

  let data: RawBunLockfile
  try {
    data = JSON.parse(stripTrailingCommas(content)) as RawBunLockfile
  } catch {
    data = {}
  }

  const entries = Object.entries(data.packages ?? {})
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const tuple = entries[i]![1]
    if (!Array.isArray(tuple) || typeof tuple[0] !== 'string') {
      continue
    }
    const { name, version } = parseBunDescriptor(tuple[0])
    if (!name) {
      continue
    }
    // A workspace member resolves from disk: no registry version, no integrity.
    const isWorkspace = StringPrototypeStartsWith(version, WORKSPACE_PROTOCOL)
    const gitDep = parseGitDep(version)
    // A git entry drops the registry slot, so its meta sits one place earlier.
    const metaAt = typeof tuple[1] === 'object' && tuple[1] !== null ? 1 : 2
    const meta = (
      typeof tuple[metaAt] === 'object' && tuple[metaAt] !== null
        ? tuple[metaAt]
        : undefined
    ) as BunMeta | undefined
    const registry = typeof tuple[1] === 'string' ? tuple[1] : ''
    const integrityAt = metaAt + 1
    const integrity =
      typeof tuple[integrityAt] === 'string' &&
      StringPrototypeStartsWith(tuple[integrityAt] as string, 'sha')
        ? (tuple[integrityAt] as string)
        : undefined

    const ref = ObjectFreeze({
      __proto__: null,
      name,
      version: isWorkspace || gitDep ? '' : version,
      resolved: registry || undefined,
      integrity,
      ecosystem: 'npm',
      depType: 'prod',
      isDev: false,
      isOptional: false,
      isPeer: false,
      isBundled: false,
      vcsUrl: gitDep?.url,
      vcsCommit: gitDep?.commit,
      dependencies: ObjectFreeze(dependencyNames(meta)),
    }) as unknown as PackageRef
    ArrayPrototypePush(packages, ref)

    const at = packageIndex[name]
    if (at === undefined) {
      packageIndex[name] = packages.length - 1
    } else if (Array.isArray(at)) {
      ArrayPrototypePush(at, packages.length - 1)
    } else {
      packageIndex[name] = [at, packages.length - 1]
    }
  }

  return ObjectFreeze({
    __proto__: null,
    type: 'lockfile',
    lockVersion: String(data.lockfileVersion ?? 1),
    ecosystem: 'npm',
    packages: ObjectFreeze(packages),
    _index: packageIndex,
  }) as unknown as ParsedLockfile
}

/**
 * Split a descriptor on its LAST `@`, since scoped names start with one.
 */
export function parseBunDescriptor(descriptor: string): {
  name: string
  version: string
} {
  const at = StringPrototypeLastIndexOf(descriptor, '@')
  if (at <= 0) {
    return { __proto__: null, name: descriptor, version: '' } as unknown as {
      name: string
      version: string
    }
  }
  return {
    __proto__: null,
    name: StringPrototypeSlice(descriptor, 0, at),
    version: StringPrototypeSlice(descriptor, at + 1),
  } as unknown as { name: string; version: string }
}

/**
 * Drop trailing commas so `JSON.parse` accepts bun's JSONC. String-aware: a
 * blind regex would corrupt a version range or path containing a comma.
 */
export function stripTrailingCommas(content: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0, { length } = content; i < length; i += 1) {
    const char = content[i]!
    if (inString) {
      out += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === ',') {
      let j = i + 1
      while (j < length && /\s/.test(content[j]!)) {
        j += 1
      }
      const next = content[j]
      if (next === ']' || next === '}') {
        continue
      }
    }
    out += char
  }
  return out
}
