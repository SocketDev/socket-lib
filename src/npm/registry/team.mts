/**
 * @file The npm registry Team endpoints: creating and deleting teams inside an
 *   org, and moving users in and out of them.
 *   Note the path shapes, which are easy to get subtly wrong because they do
 *   not follow one pattern. Creating a team posts to `/-/org/{org}/team`, but
 *   deleting one targets `/-/org/{org}/{team}` with no `team` segment at all,
 *   and membership hangs off `/-/org/{org}/{team}/user`. Team package grants
 *   live somewhere else again, under `/-/team/...`, and are in
 *   `./access` with the other access-level operations.
 *   The member list read fails open. Team membership gates package publishing,
 *   so an empty list mistaken for the truth says nobody holds access.
 *   All four writes are governance operations, which npm refuses for a
 *   granular access token created with `bypass_2fa: true`.
 */

import {
  fetchStringList,
  npmAuthHeaders,
  resolveRegistry,
  sendJsonRequest,
  sendNoContentRequest,
} from './client.mjs'

import type {
  NpmAuthOptions,
  NpmRegistryHttpOptions,
  NpmStringListRead,
  NpmWriteResult,
} from './client.mjs'

/**
 * What npm reports back after creating a team.
 */
export interface NpmCreatedTeam {
  readonly name?: string | undefined
}

/**
 * Add a user to a team. The user must already belong to the org.
 */
export async function addTeamMember(
  orgName: string,
  teamName: string,
  user: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<unknown>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const path = `${encodeURIComponent(orgName)}/${encodeURIComponent(teamName)}`
  return await sendJsonRequest<unknown>(
    `${registry}/-/org/${path}/user`,
    {
      body: JSON.stringify({ user }),
      headers: npmAuthHeaders(opts),
      method: 'PUT',
    },
    opts,
  )
}

/**
 * Create a team in an org.
 */
export async function createTeam(
  orgName: string,
  params: { description?: string | undefined; name: string },
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<NpmCreatedTeam>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await sendJsonRequest<NpmCreatedTeam>(
    `${registry}/-/org/${encodeURIComponent(orgName)}/team`,
    {
      body: JSON.stringify({
        ...(params.description === undefined
          ? {}
          : { description: params.description }),
        name: params.name,
      }),
      headers: npmAuthHeaders(opts),
      method: 'PUT',
    },
    opts,
  )
}

/**
 * Delete a team from an org.
 *
 * The path has no `team` segment: the team name sits directly under the org.
 */
export async function deleteTeam(
  orgName: string,
  teamName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<undefined>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const path = `${encodeURIComponent(orgName)}/${encodeURIComponent(teamName)}`
  return await sendNoContentRequest(
    `${registry}/-/org/${path}`,
    { headers: npmAuthHeaders(opts), method: 'DELETE' },
    opts,
  )
}

/**
 * Every username in a team.
 */
export async function fetchTeamMembers(
  orgName: string,
  teamName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmStringListRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const path = `${encodeURIComponent(orgName)}/${encodeURIComponent(teamName)}`
  return await fetchStringList(`${registry}/-/org/${path}/user`, opts)
}

/**
 * Remove a user from a team.
 */
export async function removeTeamMember(
  orgName: string,
  teamName: string,
  user: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<undefined>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const path = `${encodeURIComponent(orgName)}/${encodeURIComponent(teamName)}`
  return await sendNoContentRequest(
    `${registry}/-/org/${path}/user`,
    {
      body: JSON.stringify({ user }),
      headers: npmAuthHeaders(opts),
      method: 'DELETE',
    },
    opts,
  )
}
