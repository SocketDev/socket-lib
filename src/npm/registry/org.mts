/**
 * @file The npm registry Org endpoints: who belongs to an org, at what role,
 *   and which teams exist inside it.
 *   Both reads fail open. An org membership list drives access decisions, and
 *   an empty list read as authoritative says "nobody is in this org", which is
 *   never true of a real org and would let a caller conclude a user's access
 *   was already removed when the request simply never landed.
 *   The two writes are governance operations, so npm rejects a granular access
 *   token created with `bypass_2fa: true` with a 403 regardless of how valid
 *   the token is.
 */

import {
  fetchRecord,
  fetchStringList,
  npmAuthHeaders,
  resolveRegistry,
  sendJsonRequest,
  sendNoContentRequest,
} from './client.mjs'

import type {
  NpmAuthOptions,
  NpmRecordRead,
  NpmRegistryHttpOptions,
  NpmStringListRead,
  NpmWriteResult,
} from './client.mjs'

/**
 * A member's role within an org, in npm's own vocabulary.
 */
export type NpmOrgRole = 'admin' | 'developer' | 'owner'

/**
 * What npm reports back after a membership change. An invite for a user who
 * was not already a member reports the same shape as a direct role change.
 */
export interface NpmOrgMembershipRecord {
  readonly org?:
    | { readonly name?: string | undefined; readonly size?: string | undefined }
    | undefined
  readonly role?: string | undefined
  readonly user?: string | undefined
}

/**
 * Every user in an org, mapped to their role.
 */
export async function fetchOrgMembership(
  orgName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmRecordRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await fetchRecord(
    `${registry}/-/org/${encodeURIComponent(orgName)}/user`,
    opts,
  )
}

/**
 * Every team in an org, as fully qualified `@scope:team` names.
 */
export async function fetchOrgTeams(
  orgName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmStringListRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await fetchStringList(
    `${registry}/-/org/${encodeURIComponent(orgName)}/team`,
    opts,
  )
}

/**
 * Remove a user from an org.
 */
export async function removeOrgMember(
  orgName: string,
  user: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<undefined>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await sendNoContentRequest(
    `${registry}/-/org/${encodeURIComponent(orgName)}/user`,
    {
      body: JSON.stringify({ user }),
      headers: npmAuthHeaders(opts),
      method: 'DELETE',
    },
    opts,
  )
}

/**
 * Set a user's role in an org, inviting them when they are not a member yet.
 */
export async function setOrgMembership(
  orgName: string,
  params: { role: NpmOrgRole; user: string },
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<NpmOrgMembershipRecord>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await sendJsonRequest<NpmOrgMembershipRecord>(
    `${registry}/-/org/${encodeURIComponent(orgName)}/user`,
    {
      body: JSON.stringify({ role: params.role, user: params.user }),
      headers: npmAuthHeaders(opts),
      method: 'PUT',
    },
    opts,
  )
}
