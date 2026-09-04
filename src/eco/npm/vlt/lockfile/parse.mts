/**
 * @file `jsParseVltLock(content)` — parse `vlt-lock.json`.
 */

import { ArrayPrototypePush } from '../../../../primordials/array.mjs'
import { ObjectFreeze } from '../../../../primordials/object.mjs'
import {
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
  StringPrototypeSplit,
} from '../../../../primordials/string.mjs'

import { parseGitDep } from '../../parse-git-dep.mjs'

import type { PackageRef, ParsedLockfile } from '../../../manifest/types.mjs'

const FLAG_OPTIONAL = 1
const FLAG_DEV = 2

export interface RawVltLockfile {
  readonly lockfileVersion?: number | undefined
  // oxlint-disable-next-line socket/prefer-refined-record -- vlt lockfile shape
  readonly nodes?: Record<string, unknown[]> | undefined
}

export interface VltDepId {
  readonly type: string
  readonly scope: string
  readonly detail: string
}

export function jsParseVltLock(content: string): ParsedLockfile {
  const packages: PackageRef[] = []
  const packageIndex: Record<string, number | number[]> = Object.create(null)

  let data: RawVltLockfile
  try {
    data = JSON.parse(content) as RawVltLockfile
  } catch {
    data = {}
  }

  const entries = Object.entries(data.nodes ?? {})
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const { 0: id, 1: node } = entries[i]!
    if (!Array.isArray(node)) {
      continue
    }
    const depId = parseVltDepId(id)
    const fromId = depId ? splitNameVersion(depId.detail) : undefined
    // The name column is omitted when it is recoverable from the DepID.
    const name =
      (typeof node[1] === 'string' && node[1] ? node[1] : undefined) ??
      fromId?.name
    if (!name) {
      continue
    }
    const flags = typeof node[0] === 'number' ? node[0] : 0
    // vlt encodes a git source in the DepID itself, e.g. `git~github:a/b~main`.
    const gitDep =
      depId?.type === 'git'
        ? parseGitDep(`${depId.scope}#${depId.detail}`)
        : undefined

    const ref = ObjectFreeze({
      __proto__: null,
      name,
      version: gitDep ? '' : (fromId?.version ?? ''),
      resolved: typeof node[3] === 'string' ? node[3] : undefined,
      integrity: typeof node[2] === 'string' ? node[2] : undefined,
      ecosystem: 'npm',
      depType: (flags & FLAG_DEV) === 0 ? 'prod' : 'dev',
      isDev: (flags & FLAG_DEV) !== 0,
      isOptional: (flags & FLAG_OPTIONAL) !== 0,
      isPeer: false,
      isBundled: false,
      vcsUrl: gitDep?.url,
      vcsCommit: gitDep?.commit,
      dependencies: ObjectFreeze([]),
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
 * Split a tilde-joined DepID, e.g. `registry~~lodash@4.17.21`.
 */
export function parseVltDepId(id: string): VltDepId | undefined {
  const parts = StringPrototypeSplit(id, '~')
  if (parts.length < 3) {
    return undefined
  }
  return {
    __proto__: null,
    type: parts[0]!,
    scope: parts[1]!,
    // A hosted-git ref can itself contain `~`, so keep the remainder whole.
    detail: parts.slice(2).join('~'),
  } as unknown as VltDepId
}

/**
 * Split `name@version` on its LAST `@`, since scoped names start with one.
 */
export function splitNameVersion(detail: string): {
  name: string
  version: string
} {
  const at = StringPrototypeLastIndexOf(detail, '@')
  if (at <= 0) {
    return { __proto__: null, name: detail, version: '' } as unknown as {
      name: string
      version: string
    }
  }
  return {
    __proto__: null,
    name: StringPrototypeSlice(detail, 0, at),
    version: StringPrototypeSlice(detail, at + 1),
  } as unknown as { name: string; version: string }
}
