/**
 * @file `parsePackageJson(content)` — parses a `package.json` string into a
 *   `ParsedManifest`. On socket-btm's smol Node binary this routes to
 *   `node:smol-manifest`'s native `parseManifest(content, 'npm')`; on stock
 *   Node it runs the JS impl below. Both return byte-equivalent frozen shapes.
 *   Throws `ManifestError` with code `ERR_INVALID_JSON` on JSON parse failure.
 *   Anything else is non-throwing: missing/extra fields, weird types in
 *   dep-record values, etc. are accepted — `package.json` in the wild is messy,
 *   and downstream consumers can re-validate if they care.
 */

import { ManifestError } from '../manifest/manifest-error'
import { errorMessage } from '../../errors/message'
import { ArrayPrototypePush } from '../../primordials/array'
import { JSONParse } from '../../primordials/json'
import { ObjectFreeze, ObjectKeys } from '../../primordials/object'
import { getSmolManifest } from '../../smol/manifest'

import type { DepType, ManifestDep, ParsedManifest } from '../manifest/types'

const PROD: DepType = 'prod'
const DEV: DepType = 'dev'
const OPTIONAL: DepType = 'optional'
const PEER: DepType = 'peer'

interface RawManifest {
  readonly name?: unknown | undefined
  readonly version?: unknown | undefined
  readonly description?: unknown | undefined
  readonly license?: unknown | undefined
  readonly repository?: unknown | undefined
  readonly dependencies?: unknown | undefined
  readonly devDependencies?: unknown | undefined
  readonly peerDependencies?: unknown | undefined
  readonly optionalDependencies?: unknown | undefined
}

export function addDeps(
  dependencies: ManifestDep[],
  obj: unknown,
  type: DepType,
): void {
  if (!obj || typeof obj !== 'object') {
    return
  }
  const record = obj as Record<string, unknown>
  const keys = ObjectKeys(record)
  for (let i = 0, { length } = keys; i < length; i++) {
    const name = keys[i]!
    const range = record[name]
    ArrayPrototypePush(
      dependencies,
      ObjectFreeze({
        __proto__: null,
        name,
        versionRange: typeof range === 'string' ? range : String(range ?? ''),
        type,
        optional: type === OPTIONAL,
      }) as unknown as ManifestDep,
    )
  }
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function jsParsePackageJson(content: string): ParsedManifest {
  let data: RawManifest
  try {
    data = JSONParse(content) as RawManifest
  } catch (e) {
    throw new ManifestError(
      `Invalid JSON: ${errorMessage(e)}`,
      'ERR_INVALID_JSON',
    )
  }

  const dependencies: ManifestDep[] = []
  addDeps(dependencies, data.dependencies, PROD)
  addDeps(dependencies, data.devDependencies, DEV)
  addDeps(dependencies, data.peerDependencies, PEER)
  addDeps(dependencies, data.optionalDependencies, OPTIONAL)

  return ObjectFreeze({
    __proto__: null,
    type: 'manifest',
    name: asOptionalString(data.name),
    version: asOptionalString(data.version),
    description: asOptionalString(data.description),
    license: asOptionalString(data.license),
    repository: resolveRepository(data.repository),
    dependencies: ObjectFreeze(dependencies),
    ecosystem: 'npm',
  }) as unknown as ParsedManifest
}

export function resolveRepository(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined
  }
  if (value && typeof value === 'object') {
    const url = (value as { url?: unknown | undefined }).url
    if (typeof url === 'string' && url.length > 0) {
      return url
    }
  }
  return undefined
}

const _smol = getSmolManifest()

export const parsePackageJson: (content: string) => ParsedManifest = _smol
  ? /* c8 ignore next 1 - smol Node binary only. */
    (content: string) => _smol.parseManifest(content, 'npm') as ParsedManifest
  : jsParsePackageJson
