/**
 * @file The npm registry Trust endpoints: the trusted publisher configurations
 *   that let a CI provider publish a package through OIDC instead of a
 *   long-lived token.
 *   `claims` is deliberately an open record. npm's design is that the claim
 *   properties mirror each provider's own claim names exactly, so the shape
 *   differs per provider and grows whenever a provider adds one. npm's
 *   published spec expands only the GitHub Actions form, so constraining the
 *   type to that would silently reject a valid GitLab or CircleCI
 *   configuration. Known-good GitHub claims are `repository`, `workflow_ref`
 *   (an object with `file` for partial matching), and `environment`.
 *   The read fails open. A trusted publisher list IS the set of identities
 *   allowed to publish, so an empty list read as authoritative says "nothing
 *   can publish this package via OIDC" and can send a caller off to add a
 *   duplicate configuration, or to conclude a rogue one was already removed.
 *   Every route requires a real 2FA challenge, so `options.otp` must be set,
 *   and npm refuses a granular access token created with `bypass_2fa: true`.
 */

import { npmWebAuthHeaders, sendWithNpmAuthRetry } from './auth.mjs'
import {
  npmAuthHeaders,
  resolveRegistry,
  sendJsonRequest,
  sendNoContentRequest,
} from './client.mjs'
import { encodeRegistryName } from './index.mjs'

import type {
  NpmAuthOptions,
  NpmRegistryHttpOptions,
  NpmWriteResult,
} from './client.mjs'

/**
 * What a trusted publisher is allowed to do.
 */
export type NpmTrustedPublisherPermission =
  | 'createPackage'
  | 'createStagedPackage'

/**
 * A trusted publisher configuration as submitted.
 *
 * `type` names the provider; npm's spec expands `github` and refers to GitLab
 * and CircleCI forms without publishing their literal values, so this stays a
 * string rather than an invented union.
 */
export interface NpmTrustedPublisherConfig {
  readonly claims: Readonly<Record<string, unknown>>
  readonly permissions: readonly NpmTrustedPublisherPermission[]
  readonly type: string
}

/**
 * A stored trusted publisher configuration, carrying the id needed to delete
 * it.
 */
export interface NpmTrustedPublisherRecord extends NpmTrustedPublisherConfig {
  readonly id?: string | undefined
}

/**
 * The trusted publisher configurations for a package.
 */
export interface NpmTrustedPublisherRead {
  readonly configs: readonly NpmTrustedPublisherRecord[]
  /**
   * False when the registry could not be asked. Distinct from an empty
   * `configs`, which means the package genuinely trusts no publisher.
   */
  readonly reachable: boolean
}

/**
 * Add trusted publisher configurations to a package.
 *
 * The request body is an ARRAY even for a single configuration, matching npm's
 * spec, and the reply echoes the stored configurations with their ids.
 */
export async function addTrustedPublishers(
  packageName: string,
  configs: readonly NpmTrustedPublisherConfig[],
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<readonly NpmTrustedPublisherRecord[]>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await sendJsonRequest<readonly NpmTrustedPublisherRecord[]>(
    `${registry}/-/package/${encodeRegistryName(packageName)}/trust`,
    {
      body: JSON.stringify(configs),
      headers: { ...npmAuthHeaders(opts), ...npmWebAuthHeaders('trust', opts) },
      method: 'POST',
    },
    opts,
  )
}

/**
 * Delete one trusted publisher configuration by its id.
 */
export async function deleteTrustedPublisher(
  packageName: string,
  configId: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<undefined>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const encoded = encodeRegistryName(packageName)
  return await sendNoContentRequest(
    `${registry}/-/package/${encoded}/trust/${encodeURIComponent(configId)}`,
    {
      headers: { ...npmAuthHeaders(opts), ...npmWebAuthHeaders('trust', opts) },
      method: 'DELETE',
    },
    opts,
  )
}

/**
 * Every trusted publisher configuration for a package.
 *
 * Npm gates this READ behind an OTP as well, so it takes the same `onAuth`
 * callback the writes do. It still fails open: a challenge nobody answers
 * reports `reachable: false`, never an authoritative empty list.
 */
export async function fetchTrustedPublishers(
  packageName: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmTrustedPublisherRead> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const url = `${registry}/-/package/${encodeRegistryName(packageName)}/trust`
  try {
    const json = await sendWithNpmAuthRetry(
      async headers => await opts.http.json<unknown>(url, { headers }),
      { ...npmAuthHeaders(opts), ...npmWebAuthHeaders('trust', opts) },
      opts,
    )
    return {
      configs: Array.isArray(json)
        ? (json as readonly NpmTrustedPublisherRecord[])
        : [],
      reachable: true,
    }
  } catch {
    return { configs: [], reachable: false }
  }
}
