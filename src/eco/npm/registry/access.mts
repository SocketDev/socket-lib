/**
 * @file The npm registry Access endpoints: who can reach a package, at what
 *   level, and whether it is public at all.
 *   Every read here is a PERMISSIONS read, which is why they all fail open
 *   rather than returning an empty map. "This team has no grants" and "I could
 *   not check this team's grants" look identical once both are an empty
 *   object, and the two justify opposite decisions: the first says a revoke
 *   already happened, the second says nothing at all. An audit that treats the
 *   second as the first reports a package as locked down when it may be wide
 *   open.
 *   The writes are governance operations, so npm rejects a granular access
 *   token created with `bypass_2fa: true` with a 403 even though the token is
 *   otherwise valid. `describeNpmStatus` in `./client` spells that out
 *   in the failure, because the default reading of 403 sends a caller off to
 *   rotate a token that was never the problem.
 */

import {
  fetchRecord,
  npmAuthHeaders,
  resolveRegistry,
  sendJsonRequest,
  sendNoContentRequest,
} from './client.mjs'
import { encodeRegistryName } from './index.mjs'

import type {
  NpmAuthOptions,
  NpmRecordRead,
  NpmRegistryHttpOptions,
  NpmWriteResult,
} from './client.mjs'

/**
 * The access level a team or user holds over a package.
 */
export type NpmPackagePermission = 'read-only' | 'read-write'

/**
 * Whether a package is published publicly or restricted to its owners.
 */
export type NpmPackageVisibility = 'private' | 'public'

/**
 * The package access settings that can be changed in one call. Every field is
 * optional; npm leaves anything omitted untouched.
 */
export interface NpmSetPackageAccessParams {
  access?: NpmPackageVisibility | undefined
  /**
   * Whether an automation token satisfies the 2FA requirement on publish.
   * Wire name `automation_token_overrides_tfa`.
   */
  automationTokenOverridesTfa?: boolean | undefined
  /**
   * Whether publishing this package demands multifactor auth. Wire name
   * `publish_requires_tfa`.
   */
  publishRequiresTfa?: boolean | undefined
}

/**
 * Every package an org can reach, mapped to the org's access level.
 */
export async function fetchOrgPackageGrants(
  orgName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmRecordRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await fetchRecord(
    `${registry}/-/org/${encodeURIComponent(orgName)}/package`,
    opts,
  )
}

/**
 * Every user who can reach a package, mapped to their access level.
 */
export async function fetchPackageCollaborators(
  packageName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmRecordRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await fetchRecord(
    `${registry}/-/package/${encodeRegistryName(packageName)}/collaborators`,
    opts,
  )
}

/**
 * A package's visibility, as a name-to-visibility map.
 *
 * The map shape looks odd for a single-package route, but it is what npm
 * documents and returns, so it is passed through rather than flattened into a
 * guess about which key is the one asked for.
 */
export async function fetchPackageVisibility(
  packageName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmRecordRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await fetchRecord(
    `${registry}/-/package/${encodeRegistryName(packageName)}/visibility`,
    opts,
  )
}

/**
 * Every package a team can reach, mapped to the team's access level.
 */
export async function fetchTeamPackageGrants(
  orgName: string,
  teamName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmRecordRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const path = `${encodeURIComponent(orgName)}/${encodeURIComponent(teamName)}`
  return await fetchRecord(`${registry}/-/team/${path}/package`, opts)
}

/**
 * Give a team access to a package at the requested level.
 */
export async function grantTeamPackageAccess(
  orgName: string,
  teamName: string,
  params: { packageName: string; permissions: NpmPackagePermission },
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<unknown>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const path = `${encodeURIComponent(orgName)}/${encodeURIComponent(teamName)}`
  return await sendJsonRequest<unknown>(
    `${registry}/-/team/${path}/package`,
    {
      body: JSON.stringify({
        package: params.packageName,
        permissions: params.permissions,
      }),
      headers: npmAuthHeaders(opts),
      method: 'PUT',
    },
    opts,
  )
}

/**
 * Take away a team's access to a package.
 *
 * `packageName` is REQUIRED and always sent as `{ "package": <name> }`.
 *
 * Npm's published `access.yaml` gives this route no `requestBody`, while the
 * sibling `PUT` on the identical path documents one. That is an omission in
 * the document, not a smaller request: the path carries only the org and the
 * team, so a body-less DELETE names no package and there is nothing for the
 * registry to revoke. npm's own client settles it - `removePermissions` in
 * `libnpmaccess` sends `DELETE /-/team/{scope}/{team}/package` with the body
 * `{ package: spec.name }`, exactly mirroring its `setPermissions` PUT. This
 * follows that behavior rather than the incomplete document.
 */
export async function revokeTeamPackageAccess(
  orgName: string,
  teamName: string,
  packageName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<undefined>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const path = `${encodeURIComponent(orgName)}/${encodeURIComponent(teamName)}`
  return await sendNoContentRequest(
    `${registry}/-/team/${path}/package`,
    {
      body: JSON.stringify({ package: packageName }),
      headers: npmAuthHeaders(opts),
      method: 'DELETE',
    },
    opts,
  )
}

/**
 * Set a package's visibility and its 2FA-on-publish policy.
 */
export async function setPackageAccess(
  packageName: string,
  params: NpmSetPackageAccessParams,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<unknown>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const body: Record<string, unknown> = {}
  if (params.access !== undefined) {
    body['access'] = params.access
  }
  if (params.automationTokenOverridesTfa !== undefined) {
    body['automation_token_overrides_tfa'] = params.automationTokenOverridesTfa
  }
  if (params.publishRequiresTfa !== undefined) {
    body['publish_requires_tfa'] = params.publishRequiresTfa
  }
  return await sendJsonRequest<unknown>(
    `${registry}/-/package/${encodeRegistryName(packageName)}/access`,
    {
      body: JSON.stringify(body),
      headers: npmAuthHeaders(opts),
      method: 'POST',
    },
    opts,
  )
}
