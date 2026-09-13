import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { repositoryContainsTarget } from '../../../.git-hooks/_shared/repo-containment.mts'
import { sha256Hex } from '../bootstrap/fleet.mjs'
import {
  AGGREGATE_FUTURE_SKEW_MS,
  AGGREGATE_MAX_AGE_MS,
  validateConsumerUsageAggregate,
} from '../consumer-usage-aggregate.mts'
import type { ConsumerUsageAggregate } from '../consumer-usage-aggregate.mts'
import {
  consumerUsageImmutableTag,
  inspectUsageManifest,
  USAGE_REGISTRY,
  USAGE_REPOSITORY,
} from './registry.mts'
import type {
  ConsumerUsageReceipt,
  VerifiedConsumerUsage,
} from './registry.mts'

export function consumerUsageCachePaths(repoRoot: string): {
  aggregate: string
  receipt: string
  manifest: string
} {
  const directory = path.join(repoRoot, '.cache/consumer-evidence')
  const paths = {
    aggregate: path.join(directory, 'fleet-lib-usage.aggregate.json'),
    receipt: path.join(directory, 'fleet-lib-usage.receipt.json'),
    manifest: path.join(directory, 'fleet-lib-usage.manifest.json'),
  }
  if (
    Object.values(paths).some(file => !repositoryContainsTarget(repoRoot, file))
  ) {
    throw new Error(
      'Consumer usage cache escapes its repository. Where: .cache/consumer-evidence. Saw an external path; wanted contained runtime files. Fix: remove escaping symlinks and run pnpm run audit:consumer-usage.',
    )
  }
  return paths
}

function readUsageReceipt(value: unknown): ConsumerUsageReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      'Consumer usage receipt is invalid. Fix: run pnpm run audit:consumer-usage.',
    )
  }
  const fields = [
    'schemaVersion',
    'immutableTag',
    'manifestDigest',
    'layerDigest',
    'producerRevision',
    'sourcesDigest',
    'repository',
    'verifiedAt',
  ]
  if (
    Object.keys(value).length !== fields.length ||
    Object.keys(value).some(key => !fields.includes(key)) ||
    Reflect.get(value, 'schemaVersion') !== 1
  ) {
    throw new Error(
      'Consumer usage receipt schema is invalid. Fix: run pnpm run audit:consumer-usage.',
    )
  }
  for (const field of ['manifestDigest', 'layerDigest', 'sourcesDigest']) {
    const digest: unknown = Reflect.get(value, field)
    if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
      throw new Error(
        'Consumer usage receipt digest is invalid. Fix: run pnpm run audit:consumer-usage.',
      )
    }
  }
  validateUsageReceiptIdentity(value)
  return value as ConsumerUsageReceipt
}

function validateUsageReceiptIdentity(value: object): void {
  const revision: unknown = Reflect.get(value, 'producerRevision')
  const tag: unknown = Reflect.get(value, 'immutableTag')
  const sources: unknown = Reflect.get(value, 'sourcesDigest')
  const repository: unknown = Reflect.get(value, 'repository')
  const verifiedAt: unknown = Reflect.get(value, 'verifiedAt')
  if (
    typeof revision !== 'string' ||
    typeof sources !== 'string' ||
    tag !== consumerUsageImmutableTag(revision, sources) ||
    repository !== `${USAGE_REGISTRY}/${USAGE_REPOSITORY}` ||
    typeof verifiedAt !== 'string' ||
    !Number.isFinite(Date.parse(verifiedAt)) ||
    new Date(verifiedAt).toISOString() !== verifiedAt
  ) {
    throw new Error(
      'Consumer usage receipt identity is invalid. Fix: run pnpm run audit:consumer-usage.',
    )
  }
}

export function readInstalledConsumerUsage(
  repoRoot: string,
  now: number = Date.now(),
): ConsumerUsageAggregate {
  const paths = consumerUsageCachePaths(repoRoot)
  let bytes: Buffer
  let receipt: ConsumerUsageReceipt
  let manifest: ReturnType<typeof inspectUsageManifest>
  try {
    bytes = readFileSync(paths.aggregate)
    receipt = readUsageReceipt(JSON.parse(readFileSync(paths.receipt, 'utf8')))
    manifest = inspectUsageManifest(readFileSync(paths.manifest))
  } catch {
    throw new Error(
      'Consumer usage evidence is unavailable. Where: .cache/consumer-evidence. Saw missing or invalid aggregate/receipt; wanted verified public evidence. Fix: run pnpm run audit:consumer-usage.',
    )
  }
  if (
    manifest.manifestDigest !== receipt.manifestDigest ||
    manifest.layerDigest !== receipt.layerDigest ||
    manifest.producerRevision !== receipt.producerRevision ||
    bytes.length !== manifest.layerSize ||
    `sha256:${sha256Hex(bytes)}` !== receipt.layerDigest
  ) {
    throw new Error(
      'Consumer usage cache bytes disagree with the receipt. Fix: run pnpm run audit:consumer-usage.',
    )
  }
  const aggregate = validateConsumerUsageAggregate(
    repoRoot,
    JSON.parse(bytes.toString('utf8')),
    {
      producerRevision: receipt.producerRevision,
      sourceSetDigest: receipt.sourcesDigest,
      now,
    },
  )
  const verifiedAt = Date.parse(receipt.verifiedAt)
  if (
    verifiedAt > now + AGGREGATE_FUTURE_SKEW_MS ||
    now - verifiedAt > AGGREGATE_MAX_AGE_MS ||
    verifiedAt < Date.parse(aggregate.generatedAt) - AGGREGATE_FUTURE_SKEW_MS
  ) {
    throw new Error(
      'Consumer usage verification receipt is stale or future-dated. Fix: run pnpm run audit:consumer-usage.',
    )
  }
  return aggregate
}

export function writeInstalledConsumerUsage(
  repoRoot: string,
  verified: VerifiedConsumerUsage,
): void {
  const paths = consumerUsageCachePaths(repoRoot)
  mkdirSync(path.dirname(paths.aggregate), { recursive: true })
  consumerUsageCachePaths(repoRoot)
  writeFileSync(paths.manifest, verified.manifestBytes)
  writeFileSync(paths.aggregate, verified.bytes)
  writeFileSync(paths.receipt, `${JSON.stringify(verified.receipt)}\n`)
}
