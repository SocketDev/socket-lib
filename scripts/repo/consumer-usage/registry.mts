import type { Buffer } from 'node:buffer'
import {
  fetchBlob,
  fetchOciManifestEnvelope,
  httpGet,
  sha256Hex,
} from '../bootstrap/fleet.mjs'
import type { GhcrHttpGetFn } from '../bootstrap/fleet.mjs'
import { validateConsumerUsageAggregate } from '../consumer-usage-aggregate.mts'
import type { ConsumerUsageAggregate } from '../consumer-usage-aggregate.mts'

export const USAGE_REGISTRY = 'ghcr.io'
export const USAGE_REPOSITORY = 'socketdev/socket-wheelhouse/fleet-pack'
export const USAGE_GREEN_TAG = 'lib-usage-green'
export const USAGE_ARTIFACT_TYPE = 'application/vnd.socket.fleet-lib-usage.v1'
export const USAGE_LAYER_TYPE =
  'application/vnd.socket.fleet-lib-usage.aggregate.v1+json'

export interface ConsumerUsageReceipt {
  schemaVersion: 1
  immutableTag: string
  manifestDigest: string
  layerDigest: string
  producerRevision: string
  sourcesDigest: string
  repository: string
  verifiedAt: string
}

export interface VerifiedConsumerUsage {
  aggregate: ConsumerUsageAggregate
  bytes: Buffer
  manifestBytes: Buffer
  receipt: ConsumerUsageReceipt
}

function usageRegistryError(reason: string): never {
  throw new Error(
    `Consumer usage download failed. Where: public usage registry. Saw ${reason}; wanted verified immutable aggregate bytes. Fix: run pnpm run audit:consumer-usage after the trusted producer publishes complete evidence.`,
  )
}

export function consumerUsageImmutableTag(
  revision: string,
  contentDigest: string,
): string {
  if (
    !/^[a-f0-9]{40}$/.test(revision) ||
    !/^sha256:[a-f0-9]{64}$/.test(contentDigest)
  ) {
    usageRegistryError('invalid immutable identity')
  }
  return `lib-usage-${revision}-${contentDigest.slice('sha256:'.length)}`
}

export function inspectUsageManifest(body: Buffer): {
  producerRevision: string
  layerDigest: string
  layerSize: number
  manifestDigest: string
} {
  const value: unknown = JSON.parse(body.toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    usageRegistryError('a non-object manifest')
  }
  const layers: unknown = Reflect.get(value, 'layers')
  if (
    Reflect.get(value, 'schemaVersion') !== 2 ||
    Reflect.get(value, 'mediaType') !==
      'application/vnd.oci.image.manifest.v1+json' ||
    Reflect.get(value, 'artifactType') !== USAGE_ARTIFACT_TYPE ||
    Reflect.has(value, 'manifests')
  ) {
    usageRegistryError('an unexpected artifact manifest')
  }
  if (!Array.isArray(layers) || layers.length !== 1) {
    usageRegistryError('an unexpected layer count')
  }
  const layer = inspectUsageLayer(layers[0])
  const annotations: unknown = Reflect.get(value, 'annotations')
  const revision: unknown =
    annotations !== null && typeof annotations === 'object'
      ? Reflect.get(annotations, 'org.opencontainers.image.revision')
      : undefined
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision)) {
    usageRegistryError('an invalid revision annotation')
  }
  return {
    producerRevision: revision,
    ...layer,
    manifestDigest: `sha256:${sha256Hex(body)}`,
  }
}

function inspectUsageLayer(layer: unknown): {
  layerDigest: string
  layerSize: number
} {
  if (
    !layer ||
    typeof layer !== 'object' ||
    Reflect.get(layer, 'mediaType') !== USAGE_LAYER_TYPE
  ) {
    usageRegistryError('an unexpected layer media type')
  }
  const digest: unknown = Reflect.get(layer, 'digest')
  const size: unknown = Reflect.get(layer, 'size')
  if (
    typeof digest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(digest) ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > 4 * 1024 * 1024
  ) {
    usageRegistryError('an invalid layer digest or size')
  }
  return { layerDigest: digest, layerSize: size }
}

function anonymousUsageHttp(httpFn: GhcrHttpGetFn): GhcrHttpGetFn {
  return async (url, options) => {
    if (new URL(url).origin !== `https://${USAGE_REGISTRY}`) {
      usageRegistryError('an unexpected registry origin')
    }
    const response = await httpFn(url, options)
    if (response.body.length > 4 * 1024 * 1024) {
      usageRegistryError('an oversized response')
    }
    if (
      url.includes('/manifests/') &&
      response.status >= 200 &&
      response.status < 300
    ) {
      const identity = inspectUsageManifest(response.body)
      if (
        response.headers['docker-content-digest'] !== identity.manifestDigest
      ) {
        usageRegistryError('a manifest header digest mismatch')
      }
    }
    return response
  }
}

async function anonymousUsageToken(httpFn: GhcrHttpGetFn): Promise<string> {
  const url = `https://${USAGE_REGISTRY}/token?service=${USAGE_REGISTRY}&scope=repository:${USAGE_REPOSITORY}:pull`
  const response = await httpFn(url)
  if (response.status < 200 || response.status >= 300) {
    usageRegistryError('anonymous token acquisition failure')
  }
  const value: unknown = JSON.parse(response.body.toString('utf8'))
  const token: unknown =
    value !== null && typeof value === 'object'
      ? Reflect.get(value, 'token')
      : undefined
  if (typeof token !== 'string' || token.length === 0) {
    usageRegistryError('an unavailable anonymous pull token')
  }
  return token
}

export async function fetchConsumerUsageAggregate(
  repoRoot: string,
  options?:
    | { httpFn?: GhcrHttpGetFn | undefined; now?: number | undefined }
    | undefined,
): Promise<VerifiedConsumerUsage> {
  const opts = { __proto__: null, ...options } as typeof options
  const httpFn = anonymousUsageHttp(opts?.httpFn ?? httpGet)
  const token = await anonymousUsageToken(httpFn)
  const green = await fetchOciManifestEnvelope(
    USAGE_REPOSITORY,
    USAGE_GREEN_TAG,
    token,
    USAGE_REGISTRY,
    { httpFn },
  )
  const identity = inspectUsageManifest(green.body)
  const bytes = await fetchBlob(
    USAGE_REPOSITORY,
    identity.layerDigest,
    token,
    USAGE_REGISTRY,
    httpFn,
  )
  if (
    bytes.length !== identity.layerSize ||
    `sha256:${sha256Hex(bytes)}` !== identity.layerDigest
  ) {
    usageRegistryError('a layer byte digest or size mismatch')
  }
  const raw: unknown = JSON.parse(bytes.toString('utf8'))
  const sources: unknown =
    raw !== null && typeof raw === 'object'
      ? Reflect.get(raw, 'sources')
      : undefined
  const sourceSetDigest: unknown =
    sources !== null && typeof sources === 'object'
      ? Reflect.get(sources, 'digest')
      : undefined
  if (typeof sourceSetDigest !== 'string') {
    usageRegistryError('an absent source-set digest')
  }
  const aggregate = validateConsumerUsageAggregate(repoRoot, raw, {
    producerRevision: identity.producerRevision,
    sourceSetDigest,
    now: opts?.now ?? Date.now(),
  })
  const immutableTag = consumerUsageImmutableTag(
    identity.producerRevision,
    aggregate.contentDigest,
  )
  const immutable = await fetchOciManifestEnvelope(
    USAGE_REPOSITORY,
    immutableTag,
    token,
    USAGE_REGISTRY,
    { httpFn },
  )
  if (!green.body.equals(immutable.body)) {
    usageRegistryError('different green and immutable manifests')
  }
  return {
    aggregate,
    bytes,
    manifestBytes: green.body,
    receipt: {
      schemaVersion: 1,
      repository: `${USAGE_REGISTRY}/${USAGE_REPOSITORY}`,
      immutableTag,
      manifestDigest: identity.manifestDigest,
      layerDigest: identity.layerDigest,
      producerRevision: identity.producerRevision,
      sourcesDigest: sourceSetDigest,
      verifiedAt: new Date(opts?.now ?? Date.now()).toISOString(),
    },
  }
}
