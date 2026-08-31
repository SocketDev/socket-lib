/**
 * @file Npm staging and package-version lifecycle reads.
 *   A published version is not the only state a version can be in. npm can hold
 *   one in STAGING while automated validation runs or a maintainer reviews it,
 *   and a release pipeline that only asks "is it on the registry yet" cannot
 *   tell three very different situations apart: never staged, staged and
 *   waiting, and blocked.
 *   Two reads answer that, and one field is why this module exists at all: a
 *   staged item carries the `shasum` of the tarball npm actually holds. That is
 *   the only registry-side record of WHAT is staged, so it is what a pipeline
 *   compares against the artifact it believes it staged. Without it, "a release
 *   is staged" is a claim with nothing behind it.
 *   Both reads need a token: staging is per-user, and the version-status
 *   endpoint deliberately reports "no access" and "does not exist" the same
 *   way, so a caller cannot probe for packages it cannot see.
 *   FAIL-OPEN, matching the sibling live reads. An unreachable registry answers
 *   `reachable: false`, never an empty list, because "nothing is staged" and
 *   "I could not ask" are different facts and a pipeline must not confuse them.
 */

import { npmAuthHeaders, resolveRegistry } from './client.mjs'
import { encodeRegistryName } from './index.mjs'

import type { NpmHttpOptions } from './index.mjs'

/**
 * Every lifecycle state npm reports for an exact version.
 *
 * `validating` and `staged` are both pre-publication: the first is automated
 * checks in progress, the second is waiting on a maintainer. `blocked` is a
 * refusal, not a delay, and retrying does not clear it.
 */
export type NpmVersionStatus =
  | 'blocked'
  | 'deleted'
  | 'published'
  | 'staged'
  | 'validating'

/**
 * One staged package version, as the registry records it.
 */
export interface NpmStageItem {
  readonly access?: string | undefined
  readonly actor?: string | undefined
  readonly actorType?: string | undefined
  readonly createdAt?: string | undefined
  readonly id: string
  readonly packageName: string
  /**
   * The tarball digest npm holds for this staged version. The registry's own
   * record of WHAT is staged, and the only thing a pipeline can check its
   * local artifact against.
   */
  readonly shasum?: string | undefined
  readonly status?: NpmVersionStatus | undefined
  readonly tag?: string | undefined
  readonly version: string
}

export interface NpmStageListRead {
  readonly items: readonly NpmStageItem[]
  readonly page?: number | undefined
  readonly perPage?: number | undefined
  /**
   * False when the registry could not be asked. Distinct from an empty
   * `items`, which means it answered and nothing is staged.
   */
  readonly reachable: boolean
  /**
   * How many staged items exist across every page, not how many are on this
   * one. Paging on `items.length` alone silently stops at the first short
   * page.
   */
  readonly total?: number | undefined
}

/**
 * One staged item read on its own, or the fact that it could not be read.
 */
export interface NpmStageItemRead {
  readonly item?: NpmStageItem | undefined
  /**
   * False when the registry could not be asked. A reachable read with no
   * `item` means npm answered 404: no such staged version, or none this token
   * may see.
   */
  readonly reachable: boolean
}

export interface NpmVersionStatusRead {
  readonly reachable: boolean
  readonly status?: NpmVersionStatus | undefined
}

/**
 * Authorization header for a token-bearing read. Delegates to
 * `npmAuthHeaders` so this client has exactly one place that decides how a
 * credential is put on the wire.
 */
export function authHeaders(token: string): Record<string, string> {
  return npmAuthHeaders({ token })
}

/**
 * One staged version looked up directly by its stage id.
 *
 * A 404 is reported as `reachable: true` with no item, matching
 * {@link fetchVersionStatus}: npm answers 404 both for "no such stage id" and
 * for "not yours to see", so neither is a failure worth retrying.
 */
export async function fetchStagedItem(
  stageId: string,
  options: NpmHttpOptions & {
    registry?: string | undefined
    token: string
  },
): Promise<NpmStageItemRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  try {
    const json = await opts.http.json<NpmStageItem>(
      `${registry}/-/stage/${encodeURIComponent(stageId)}`,
      { headers: authHeaders(opts.token) },
    )
    return { item: json, reachable: true }
  } catch (e) {
    const status = (e as { status?: number | undefined } | null)?.status
    if (status === 404) {
      return { item: undefined, reachable: true }
    }
    return { reachable: false }
  }
}

/**
 * Every staged version visible to the token, newest first.
 *
 * `packageName` narrows the list to one package, which is what a release
 * pipeline wants: it is asking about its own package, not the whole account.
 * `page` is 0-indexed and `perPage` is capped at 100 by npm.
 */
export async function fetchStagedVersions(
  options: NpmHttpOptions & {
    packageName?: string | undefined
    page?: number | undefined
    perPage?: number | undefined
    registry?: string | undefined
    token: string
  },
): Promise<NpmStageListRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const query: string[] = []
  if (opts.packageName) {
    query.push(`package=${encodeRegistryName(opts.packageName)}`)
  }
  if (opts.page !== undefined) {
    query.push(`page=${String(opts.page)}`)
  }
  if (opts.perPage !== undefined) {
    query.push(`perPage=${String(opts.perPage)}`)
  }
  const suffix = query.length ? `?${query.join('&')}` : ''
  try {
    const json = await opts.http.json<{
      items?: NpmStageItem[] | undefined
      page?: number | undefined
      perPage?: number | undefined
      total?: number | undefined
    }>(`${registry}/-/stage${suffix}`, {
      headers: authHeaders(opts.token),
    })
    return {
      items: Array.isArray(json.items) ? json.items : [],
      page: json.page,
      perPage: json.perPage,
      reachable: true,
      total: json.total,
    }
  } catch {
    return { items: [], reachable: false }
  }
}

/**
 * The lifecycle status of an exact version.
 *
 * A 404 is reported as `reachable: true` with no status, because the registry
 * returns 404 both for "does not exist" and for "you cannot see it" - they are
 * deliberately indistinguishable, so neither is an error to retry.
 */
export async function fetchVersionStatus(
  packageName: string,
  version: string,
  options: NpmHttpOptions & {
    registry?: string | undefined
    token: string
  },
): Promise<NpmVersionStatusRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const url = `${registry}/-/package/${encodeRegistryName(packageName)}/version/${encodeURIComponent(version)}/status`
  try {
    const json = await opts.http.json<{
      status?: NpmVersionStatus | undefined
    }>(url, { headers: authHeaders(opts.token) })
    return { reachable: true, status: json.status }
  } catch (e) {
    const status = (e as { status?: number | undefined } | null)?.status
    if (status === 404 || status === 403) {
      return { reachable: true, status: undefined }
    }
    return { reachable: false }
  }
}

/**
 * The staged entry for one exact version, or undefined when none is staged.
 *
 * A convenience over {@link fetchStagedVersions} for the question a release
 * pipeline actually asks: is THIS version sitting in staging, and under what
 * digest.
 */
export async function findStagedVersion(
  packageName: string,
  version: string,
  options: NpmHttpOptions & { token: string },
): Promise<NpmStageItem | undefined> {
  const read = await fetchStagedVersions({ ...options, packageName })
  if (!read.reachable) {
    return undefined
  }
  return read.items.find(item => item.version === version)
}

/**
 * Whether a status means the version is still pre-publication.
 *
 * Both waiting states answer true. `blocked` does NOT: it is a refusal, and a
 * caller polling for "still working" would wait forever on it.
 */
export function isPendingStatus(status: NpmVersionStatus | undefined): boolean {
  return status === 'staged' || status === 'validating'
}
