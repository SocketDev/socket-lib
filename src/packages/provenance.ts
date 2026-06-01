/**
 * @file Package provenance and attestation verification utilities.
 */

import { NPM_REGISTRY_URL } from '../constants/agents'
import { getPacoteCachePath } from '../constants/packages'

import makeFetchHappen from '../external/make-fetch-happen'

import {
  createCompositeAbortSignal,
  createTimeoutSignal,
} from '../abort/signal'
import { parseUrl } from '../url/parse'

import { isObject } from '../objects/predicates'

import type { ProvenanceOptions } from './types'

import { ArrayIsArray } from '../primordials/array'
import { BufferFrom } from '../primordials/buffer'

import { JSONParse } from '../primordials/json'

import { ObjectHasOwn } from '../primordials/object'

import {
  StringPrototypeEndsWith,
  StringPrototypeIncludes,
  StringPrototypeSplit,
} from '../primordials/string'
const SLSA_PROVENANCE_V0_2 = 'https://slsa.dev/provenance/v0.2'
const SLSA_PROVENANCE_V1_0 = 'https://slsa.dev/provenance/v1'

let _fetcher: ReturnType<typeof makeFetchHappen.defaults> | undefined

/**
 * Comparator ordering two trust statuses by ascending trust level. Sorts an
 * array of statuses lowest-trust-first; negate for highest-first.
 */
export function compareTrust(a: TrustStatus, b: TrustStatus): -1 | 0 | 1 {
  const levelA = getTrustLevel(a)
  const levelB = getTrustLevel(b)
  if (levelA < levelB) {
    return -1
  }
  if (levelA > levelB) {
    return 1
  }
  return 0
}

/**
 * Whether `next` sits at a lower trust level than `prev` — i.e. a release
 * regressed its supply-chain posture. Drives the post-publish provenance
 * reminder: a version that drops from trustedPublisher back to bare provenance
 * is a red flag worth surfacing.
 */
export function didTrustDecrease(
  prev: TrustStatus,
  next: TrustStatus,
): boolean {
  return getTrustLevel(next) < getTrustLevel(prev)
}

/**
 * Fetch package provenance information from npm registry.
 *
 * @example
 *   ;```typescript
 *   const provenance = await fetchPackageProvenance('lodash', '4.17.21')
 *   ```
 */
export async function fetchPackageProvenance(
  pkgName: string,
  pkgVersion: string,
  options?: ProvenanceOptions,
): Promise<unknown> {
  const { signal, timeout = 10_000 } = {
    __proto__: null,
    ...options,
  } as ProvenanceOptions

  if (signal?.aborted) {
    return undefined
  }

  // Create composite signal combining external signal with timeout
  const timeoutSignal = createTimeoutSignal(timeout)
  const compositeSignal = createCompositeAbortSignal(signal, timeoutSignal)
  const fetcher = getFetcher()

  try {
    const response = await fetcher(
      // The npm registry attestations API endpoint.
      `${NPM_REGISTRY_URL}/-/npm/v1/attestations/${encodeURIComponent(pkgName)}@${encodeURIComponent(pkgVersion)}`,
      {
        method: 'GET',
        signal: compositeSignal,
        headers: {
          'User-Agent': 'socket-registry',
        },
      } as {
        method: string
        signal: AbortSignal
        headers: Record<string, string>
      },
    )
    if (response.ok) {
      return getProvenanceDetails(await response.json())
    }
  } catch {}
  return undefined
}

/**
 * Find the first attestation with valid provenance data.
 */
export function findProvenance(attestations: unknown[]): unknown {
  for (let i = 0, { length } = attestations; i < length; i += 1) {
    const attestation = attestations[i]!
    const att = attestation as {
      bundle?:
        | { dsseEnvelope?: { payload?: string | undefined } | undefined }
        | undefined
      predicate?: unknown | undefined
    }
    try {
      let predicate = att.predicate

      // If predicate is not directly available, try to decode from DSSE envelope
      if (!predicate && att.bundle?.dsseEnvelope?.payload) {
        try {
          const decodedPayload = BufferFrom!(
            att.bundle.dsseEnvelope.payload,
            'base64',
          ).toString('utf8')
          const statement = JSONParse(decodedPayload)
          predicate = statement.predicate
        } catch {
          // Failed to decode, continue to next attestation
          continue
        }
      }

      const predicateData = predicate as {
        buildDefinition?:
          | { externalParameters?: unknown | undefined }
          | undefined
      }
      if (predicateData?.buildDefinition?.externalParameters) {
        return {
          predicate,
          externalParameters: predicateData.buildDefinition.externalParameters,
        }
      }
      // c8 ignore start - Error handling for malformed attestation data should continue processing other attestations.
    } catch {
      // Continue checking other attestations if one fails to parse
    }
    // c8 ignore stop
  }
  return undefined
}

/**
 * Extract and filter SLSA provenance attestations from attestation data.
 */
export function getAttestations(attestationData: unknown): unknown[] {
  const data = attestationData as { attestations?: unknown[] | undefined }
  if (!data.attestations || !ArrayIsArray(data.attestations)) {
    return []
  }

  return data.attestations.filter((attestation: unknown) => {
    const att = attestation as { predicateType?: string | undefined }
    return (
      att.predicateType === SLSA_PROVENANCE_V0_2 ||
      att.predicateType === SLSA_PROVENANCE_V1_0
    )
  })
}

export function getFetcher() {
  if (_fetcher === undefined) {
    // module is imported at the top
    _fetcher = makeFetchHappen.defaults({
      cachePath: getPacoteCachePath(),
      // Prefer-offline: Staleness checks for cached data will be bypassed, but
      // missing data will be requested from the server.
      // https://github.com/npm/make-fetch-happen?tab=readme-ov-file#--optscache
      cache: 'force-cache',
    })
  }
  return _fetcher
}

/**
 * Convert raw attestation data to user-friendly provenance details.
 *
 * @example
 *   ;```typescript
 *   const details = getProvenanceDetails(attestationData)
 *   // { level: 'trusted', repository: '...', commitSha: '...' }
 *   ```
 */
export function getProvenanceDetails(attestationData: unknown): unknown {
  const attestations = getAttestations(attestationData)
  if (!attestations.length) {
    return undefined
  }
  // Find the first attestation with valid provenance data.
  const provenance = findProvenance(attestations)
  if (!provenance) {
    return { level: 'attested' }
  }

  const provenanceData = provenance as {
    externalParameters?:
      | {
          context?: string | undefined
          ref?: string | undefined
          repository?: string | undefined
          run_id?: string | undefined
          sha?: string | undefined
          workflow?:
            | {
                ref?: string | undefined
                repository?: string | undefined
              }
            | undefined
          workflow_ref?: string | undefined
        }
      | undefined
    predicate?:
      | {
          buildDefinition?: { buildType?: string | undefined } | undefined
        }
      | undefined
  }
  const { externalParameters, predicate } = provenanceData
  const def = predicate?.buildDefinition

  // Handle both SLSA v0.2 (direct properties) and v1 (nested workflow object)
  const workflow = externalParameters?.workflow
  const workflowRef = workflow?.ref || externalParameters?.workflow_ref
  const workflowUrl = externalParameters?.context
  const workflowPlatform = def?.buildType
  const repository = workflow?.repository || externalParameters?.repository
  const gitRef = externalParameters?.ref || workflow?.ref
  const commitSha = externalParameters?.sha
  const workflowRunId = externalParameters?.run_id

  // Check for trusted publishers (GitHub Actions, GitLab CI/CD).
  const trusted =
    isTrustedPublisher(workflowRef) ||
    isTrustedPublisher(workflowUrl) ||
    isTrustedPublisher(workflowPlatform) ||
    isTrustedPublisher(repository)

  return {
    commitSha,
    gitRef,
    level: trusted ? 'trusted' : 'attested',
    repository,
    workflowRef,
    workflowUrl,
    workflowPlatform,
    workflowRunId,
  }
}

/**
 * Map a trust status to its 0..3 ladder level.
 */
export function getTrustLevel(status: TrustStatus): TrustLevel {
  if (status.stagedPublish) {
    return 3
  }
  if (status.trustedPublisher && status.provenance) {
    return 2
  }
  if (status.provenance) {
    return 1
  }
  return 0
}

/**
 * Map a trust status to its human-readable level name.
 */
export function getTrustLevelName(status: TrustStatus): TrustLevelName {
  return TRUST_LEVELS[getTrustLevel(status)]
}

/**
 * Extract provenance / trusted-publisher / staged-publish flags from a registry
 * version document.
 *
 * Staged-publish detection follows pnpm/pnpm#12056: `_npmUser.approver` is set
 * by the registry when a package version was promoted out of staging via a
 * 2FA-gated approve step. That signal ranks ABOVE both `trustedPublisher` and
 * `provenance` in pnpm's trust-evidence ladder, because it adds a human
 * approval gate on top of the OIDC publisher identity.
 */
export function getTrustStatus(meta: unknown): TrustStatus {
  const status: TrustStatus = {
    provenance: false,
    trustedPublisher: false,
    stagedPublish: false,
  }
  if (!isObject(meta)) {
    return status
  }
  const npmUser = ObjectHasOwn(meta, '_npmUser') ? meta['_npmUser'] : undefined
  if (isObject(npmUser)) {
    if (ObjectHasOwn(npmUser, 'approver') && npmUser['approver']) {
      status.stagedPublish = true
    }
    if (
      ObjectHasOwn(npmUser, 'trustedPublisher') &&
      npmUser['trustedPublisher']
    ) {
      status.trustedPublisher = true
    }
  }
  const dist = ObjectHasOwn(meta, 'dist') ? meta['dist'] : undefined
  const attestations =
    isObject(dist) && ObjectHasOwn(dist, 'attestations')
      ? dist['attestations']
      : undefined
  if (
    isObject(attestations) &&
    ObjectHasOwn(attestations, 'provenance') &&
    attestations['provenance']
  ) {
    status.provenance = true
  }
  return status
}

/**
 * Check if a value indicates a trusted publisher (GitHub or GitLab).
 */
export function isTrustedPublisher(value: unknown): boolean {
  if (typeof value !== 'string' || !value) {
    return false
  }

  let url = parseUrl(value)
  let hostname = url?.hostname

  // Handle GitHub workflow refs with @ syntax by trying the first part.
  // Example: "https://github.com/owner/repo/.github/workflows/ci.yml@refs/heads/main"
  if (!url && StringPrototypeIncludes(value, '@')) {
    const firstPart = StringPrototypeSplit(value, '@')[0]
    if (firstPart) {
      url = parseUrl(firstPart)
    }
    if (url) {
      hostname = url.hostname
    }
  }

  // Try common URL prefixes if not already a complete URL.
  if (!url) {
    const httpsUrl = parseUrl(`https://${value}`)
    if (httpsUrl) {
      hostname = httpsUrl.hostname
    }
  }

  if (hostname) {
    return (
      hostname === 'github.com' ||
      StringPrototypeEndsWith(hostname, '.github.com') ||
      hostname === 'gitlab.com' ||
      StringPrototypeEndsWith(hostname, '.gitlab.com')
    )
  }

  // Fallback: check for provider keywords in non-URL strings.
  return (
    StringPrototypeIncludes(value, 'github') ||
    StringPrototypeIncludes(value, 'gitlab')
  )
}

/**
 * Trust signals derived from a registry version document.
 */
export interface TrustStatus {
  provenance: boolean
  trustedPublisher: boolean
  stagedPublish: boolean
}

/**
 * Trust ladder, low → high. The index IS the level (0..3), so a single array
 * maps both directions: `TRUST_LEVELS[level]` → name, and
 * `TRUST_LEVELS.indexOf(name)` → level. One source of truth, no parallel Record
 * to keep in sync.
 */
export const TRUST_LEVELS = [
  'none',
  'provenance',
  'trustedPublisher',
  'stagedPublish',
] as const

export type TrustLevel = 0 | 1 | 2 | 3

export type TrustLevelName = (typeof TRUST_LEVELS)[number]
