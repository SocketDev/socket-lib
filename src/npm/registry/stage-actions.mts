/**
 * @file The npm registry staging MUTATIONS: put a version into staging, throw
 *   it away, or approve it into a real publish. The staging READS live in
 *   `./stage` beside the version-status lookup, so the fail-open read
 *   contract and the fail-closed write contract stay visibly separate.
 *   Approving is a publish. It is the moment a staged artifact becomes
 *   installable by everyone, and it cannot be undone by staging it again, so
 *   it reports through `NpmWriteResult` and never fails open. A caller that
 *   cannot tell an approval from a failed approval is a caller that will
 *   either double-publish or report a release that never shipped.
 *   Delete and approve both require a real 2FA challenge, so `options.otp`
 *   must be set on those two.
 *   The staged tarball download is a READ, and a binary one, so it lives in
 *   `./stage-tarball` with the helpers that turn those bytes back
 *   into files.
 */

import { npmWebAuthHeaders } from './auth.mjs'
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
import type { NpmPublishAttachment } from './publish.mjs'

/**
 * What npm reports back after approving a staged version.
 */
export interface NpmStageApproval {
  readonly message?: string | undefined
}

/**
 * The staging request body.
 *
 * Nearly the publish payload, with one difference worth knowing: `access` here
 * takes `private`, where the publish endpoint takes `restricted`. The registry
 * treats the FIRST key of `versions` as the version being published, so send
 * exactly one.
 */
export interface NpmStagePayload {
  readonly _attachments: Readonly<Record<string, NpmPublishAttachment>>
  readonly _id?: string | undefined
  readonly _rev?: string | undefined
  readonly access?: 'private' | 'public' | undefined
  readonly description?: string | undefined
  readonly 'dist-tags'?: Readonly<Record<string, string>> | undefined
  readonly name: string
  readonly versions: Readonly<Record<string, unknown>>
}

/**
 * What npm reports back after staging a version. `stageId` is the handle every
 * later staging call needs.
 */
export interface NpmStagedVersion {
  readonly message?: string | undefined
  readonly stageId?: string | undefined
}

/**
 * Approve a staged version, publishing it to the registry.
 *
 * Requires an OTP, from `options.otp` up front or from `options.onAuth` in
 * answer to npm's challenge. This is a real publish and cannot be undone.
 */
export async function approveStagedVersion(
  stageId: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<NpmStageApproval>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await sendJsonRequest<NpmStageApproval>(
    `${registry}/-/stage/${encodeURIComponent(stageId)}/approve`,
    {
      headers: { ...npmAuthHeaders(opts), ...npmWebAuthHeaders('stage', opts) },
      method: 'POST',
    },
    opts,
  )
}

/**
 * Delete a staged version, removing it from review.
 *
 * Requires an OTP, from `options.otp` up front or from `options.onAuth` in
 * answer to npm's challenge. Once deleted, the version has to be staged again
 * before it can be approved.
 */
export async function deleteStagedVersion(
  stageId: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<undefined>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  return await sendNoContentRequest(
    `${registry}/-/stage/${encodeURIComponent(stageId)}`,
    {
      headers: { ...npmAuthHeaders(opts), ...npmWebAuthHeaders('stage', opts) },
      method: 'DELETE',
    },
    opts,
  )
}

/**
 * Stage a package version for maintainer review.
 *
 * The package name comes from `payload.name` so the URL and the body cannot
 * disagree about what is being staged.
 */
export async function stagePackageVersion(
  payload: NpmStagePayload,
  options: NpmRegistryHttpOptions & NpmAuthOptions,
): Promise<NpmWriteResult<NpmStagedVersion>> {
  const opts = { __proto__: null, ...options } as typeof options
  const registry = resolveRegistry(opts.registry)
  const encoded = encodeRegistryName(payload.name)
  return await sendJsonRequest<NpmStagedVersion>(
    `${registry}/-/stage/package/${encoded}`,
    {
      body: JSON.stringify(payload),
      headers: npmAuthHeaders(opts),
      method: 'POST',
    },
    opts,
  )
}
