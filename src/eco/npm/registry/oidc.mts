/**
 * @file The npm registry OIDC token exchange: trade a CI provider's id_token
 *   for a short-lived, package-scoped npm registry token.
 *   The `token` passed here is NOT an npm token. It is the id_token minted by
 *   the identity provider (GitHub Actions, GitLab CI, CircleCI), and its `aud`
 *   claim must be `npm:registry.npmjs.org`. This is the one route in the whole
 *   API that expects a foreign credential, and handing it an npm token instead
 *   produces a 401 that reads like an expired token rather than the wrong kind
 *   of token entirely.
 *   The reply contains a live credential. It is returned to the caller and
 *   never logged, and neither the request nor the response is cached: caching
 *   a bearer token is how one job ends up publishing with another job's
 *   authority.
 */

import { npmAuthHeaders, resolveRegistry, sendJsonRequest } from './client.mjs'
import { encodeRegistryName } from './index.mjs'

import type {
  NpmAuthOptions,
  NpmRegistryHttpOptions,
  NpmWriteResult,
} from './client.mjs'

/**
 * The short-lived npm token returned by an exchange, with its validity window.
 *
 * `token` is a live credential. Do not log it, persist it, or put it in an
 * error message.
 */
export interface NpmOidcTokenExchange {
  readonly created?: string | undefined
  readonly expires?: string | undefined
  readonly token?: string | undefined
  readonly token_type?: string | undefined
}

/**
 * Exchange an OIDC id_token for a package-scoped npm registry token.
 *
 * `options.token` must be the identity provider's id_token, not an npm token.
 */
export async function exchangeOidcToken(
  packageName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<NpmOidcTokenExchange>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const encoded = encodeRegistryName(packageName)
  return await sendJsonRequest<NpmOidcTokenExchange>(
    `${registry}/-/npm/v1/oidc/token/exchange/package/${encoded}`,
    { headers: npmAuthHeaders(opts), method: 'POST' },
    opts,
  )
}
