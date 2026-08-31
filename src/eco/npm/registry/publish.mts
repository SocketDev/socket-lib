/**
 * @file The npm registry publish endpoint: `PUT /{escapedPackageName}` with a
 *   packument-shaped payload.
 *   One field is a genuine trap. `access` here takes `public` or `restricted`,
 *   while the `access` field on the package access endpoint in
 *   `./access` takes `public` or `private`. Same word, same concept,
 *   two different vocabularies, and sending the wrong one is a 400 that names
 *   a field which looks correct. The two types are kept separate so the
 *   compiler catches the swap.
 *   Publishing is the one write here that a granular access token created with
 *   `bypass_2fa: true` is still allowed to perform. That is the entire point
 *   of such a token: direct publish keeps working, while the governance routes
 *   that could widen its own authority do not.
 */

import { npmAuthHeaders, resolveRegistry, sendJsonRequest } from './client.mjs'
import { encodeRegistryName } from './index.mjs'

import type {
  NpmAuthOptions,
  NpmRegistryHttpOptions,
  NpmWriteResult,
} from './client.mjs'

/**
 * A base64 attachment on a publish payload, typically the tarball and, when
 * provenance is being published, a sigstore bundle beside it.
 */
export interface NpmPublishAttachment {
  /**
   * Wire name `content_type`. `application/octet-stream` marks the tarball.
   */
  readonly content_type?: string | undefined
  /**
   * Base64-encoded bytes.
   */
  readonly data: string
  readonly length?: number | undefined
}

/**
 * Visibility at publish time. Note `restricted`, not `private`: the package
 * access endpoint spells the same idea the other way.
 */
export type NpmPublishAccess = 'public' | 'restricted'

/**
 * The publish request body.
 *
 * `versions` holds the manifest of the version being published, keyed by
 * version string, and `_attachments` holds its tarball. Both are what actually
 * publishes a release; the top-level `name` and `dist-tags` describe where it
 * lands.
 */
export interface NpmPublishPayload {
  readonly _attachments: Readonly<Record<string, NpmPublishAttachment>>
  readonly _id?: string | undefined
  readonly access?: NpmPublishAccess | undefined
  readonly description?: string | undefined
  readonly dist?: Readonly<Record<string, unknown>> | undefined
  readonly 'dist-tags'?: Readonly<Record<string, string>> | undefined
  readonly name: string
  readonly versions: Readonly<Record<string, unknown>>
}

/**
 * What npm reports back after a successful publish.
 */
export interface NpmPublishResult {
  readonly success?: boolean | undefined
}

/**
 * Publish a new version of a package.
 *
 * The package name comes from `payload.name` so the URL and the body can never
 * disagree about what is being published.
 */
export async function publishPackage(
  payload: NpmPublishPayload,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<NpmPublishResult>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await sendJsonRequest<NpmPublishResult>(
    `${registry}/${encodeRegistryName(payload.name)}`,
    {
      body: JSON.stringify(payload),
      headers: npmAuthHeaders(opts),
      method: 'PUT',
    },
    opts,
  )
}
