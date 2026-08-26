/**
 * @file The npm registry Tokens endpoints: create, list, and delete npm access
 *   tokens.
 *   Two secrets pass through this module and neither may ever reach a log, an
 *   error message, or a cache. The create request carries the account
 *   password, and the create reply carries the new token in full. npm redacts
 *   tokens in the LIST reply (`npm_aBcD...7890`) precisely because it only
 *   shows a token once, so a caller that discards the create reply cannot get
 *   the value back.
 *   Nothing here is cached, for the same reason nothing token-scoped is cached
 *   anywhere in this client: the answer is per-credential, and the list reply
 *   is an inventory of credentials.
 *   Every route needs a real 2FA challenge. npm rejects a granular access
 *   token created with `bypass_2fa: true` with a 403 on both create and
 *   delete, since a token that could mint tokens would escalate straight past
 *   the bypass restriction.
 */

import { npmWebAuthHeaders } from './auth.mjs'
import {
  buildQuery,
  npmAuthHeaders,
  resolveRegistry,
  sendJsonRequest,
  sendNoContentRequest,
} from './client.mjs'

import type {
  NpmAuthOptions,
  NpmRegistryHttpOptions,
  NpmWriteResult,
} from './client.mjs'

/**
 * Permission level granted to a token over packages, scopes, or orgs.
 */
export type NpmTokenPermission = 'no-access' | 'read-only' | 'read-write'

/**
 * The token creation request.
 *
 * `password` is the account password and `expires` is either a day count or an
 * ISO date. npm caps read-write tokens at 90 days and defaults them to 7;
 * read-only tokens have no cap and default to 30.
 */
export interface NpmCreateTokenParams {
  /**
   * Let the token skip 2FA for automation flows such as direct publish. A
   * token created this way is then refused, with a 403, on every account, org,
   * team, and package governance write. Wire name `bypass_2fa`.
   */
  bypass2fa?: boolean | undefined
  cidr?: readonly string[] | undefined
  expires?: number | string | undefined
  name: string
  orgs?: readonly string[] | undefined
  /**
   * Wire name `orgs_permission`.
   */
  orgsPermission?: NpmTokenPermission | undefined
  packages?: readonly string[] | undefined
  /**
   * Wire name `packages_and_scopes_permission`.
   */
  packagesAndScopesPermission?: NpmTokenPermission | undefined
  password: string
  scopes?: readonly string[] | undefined
  /**
   * Wire name `token_description`.
   */
  tokenDescription?: string | undefined
}

/**
 * A token record. On create, `token` is the full value and is shown once. On
 * list, it is redacted to a recognizable prefix and suffix.
 */
export interface NpmTokenRecord {
  readonly accessed?: string | undefined
  readonly bypass_2fa?: boolean | undefined
  readonly cidr?: readonly string[] | undefined
  readonly created?: string | undefined
  readonly description?: string | undefined
  readonly expiry?: string | undefined
  readonly key?: string | undefined
  readonly name?: string | undefined
  readonly permissions?:
    | ReadonlyArray<{
        readonly action?: string | undefined
        readonly name?: string | undefined
      }>
    | undefined
  readonly readonly?: boolean | undefined
  readonly revoked?: string | undefined
  readonly scopes?:
    | ReadonlyArray<{
        readonly name?: string | undefined
        readonly type?: string | undefined
      }>
    | undefined
  readonly token?: string | undefined
  readonly updated?: string | undefined
}

/**
 * One page of the caller's tokens.
 */
export interface NpmTokenListRead {
  readonly objects: readonly NpmTokenRecord[]
  /**
   * False when the registry could not be asked. Distinct from an empty
   * `objects`, which means the account genuinely has no tokens. Acting on the
   * difference matters: a revocation sweep that reads an unreachable registry
   * as "no tokens left" reports itself finished having revoked nothing.
   */
  readonly reachable: boolean
  readonly total?: number | undefined
  readonly urls?: Readonly<Record<string, string>> | undefined
}

/**
 * Create an npm access token.
 *
 * Npm requires an OTP on this route, from `options.otp` up front or from
 * `options.onAuth` in answer to its challenge. The reply is the only time the
 * full token value is available.
 */
export async function createNpmToken(
  params: NpmCreateTokenParams,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<NpmTokenRecord>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const body: Record<string, unknown> = {
    name: params.name,
    password: params.password,
  }
  if (params.bypass2fa !== undefined) {
    body['bypass_2fa'] = params.bypass2fa
  }
  if (params.cidr !== undefined) {
    body['cidr'] = params.cidr
  }
  if (params.expires !== undefined) {
    body['expires'] = params.expires
  }
  if (params.orgs !== undefined) {
    body['orgs'] = params.orgs
  }
  if (params.orgsPermission !== undefined) {
    body['orgs_permission'] = params.orgsPermission
  }
  if (params.packages !== undefined) {
    body['packages'] = params.packages
  }
  if (params.packagesAndScopesPermission !== undefined) {
    body['packages_and_scopes_permission'] = params.packagesAndScopesPermission
  }
  if (params.scopes !== undefined) {
    body['scopes'] = params.scopes
  }
  if (params.tokenDescription !== undefined) {
    body['token_description'] = params.tokenDescription
  }
  return await sendJsonRequest<NpmTokenRecord>(
    `${registry}/-/npm/v1/tokens`,
    {
      body: JSON.stringify(body),
      headers: {
        ...npmAuthHeaders(opts),
        'npm-command': 'token',
        ...npmWebAuthHeaders('token', opts),
      },
      method: 'POST',
    },
    opts,
  )
}

/**
 * Delete an npm access token.
 *
 * `token` identifies the token to remove, either as its UUID key or as the
 * full `npm_`-prefixed value. It is a different thing from `options.token`,
 * which authenticates the request.
 */
export async function deleteNpmToken(
  token: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<undefined>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await sendNoContentRequest(
    `${registry}/-/npm/v1/tokens/token/${encodeURIComponent(token)}`,
    {
      headers: {
        ...npmAuthHeaders(opts),
        'npm-command': 'token',
        ...npmWebAuthHeaders('token', opts),
      },
      method: 'DELETE',
    },
    opts,
  )
}

/**
 * List the authenticated account's tokens, one page at a time.
 *
 * Token values in the reply are redacted by npm. Never cached: this is a
 * per-credential inventory of credentials.
 */
export async function fetchNpmTokens(
  options: NpmRegistryHttpOptions &
    NpmAuthOptions & {
      page?: number | undefined
      perPage?: number | undefined
    },
): Promise<NpmTokenListRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const query = buildQuery({ page: opts.page, perPage: opts.perPage })
  try {
    const json = await opts.http.json<{
      objects?: NpmTokenRecord[] | undefined
      total?: number | undefined
      urls?: Record<string, string> | undefined
    }>(`${registry}/-/npm/v1/tokens${query}`, {
      headers: npmAuthHeaders(opts),
    })
    return {
      objects: Array.isArray(json.objects) ? json.objects : [],
      reachable: true,
      total: json.total,
      urls: json.urls,
    }
  } catch {
    return { objects: [], reachable: false }
  }
}
