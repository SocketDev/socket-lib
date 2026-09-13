import { hash } from '@socketsecurity/lib-stable/crypto/hash'
import path from 'node:path'
import { repositoryContainsTarget } from '../../.git-hooks/_shared/repo-containment.mts'
import { SOCKET_GITHUB_ORGS } from '../fleet/constants/socket-scopes.mts'
import { exportLeaves, keptLeaves } from './audit-fleet-lib-usage.mts'
import type { FleetLibUsageReport } from './audit-fleet-lib-usage.mts'
import { readConsumerRoster } from './consumer-evidence.mts'
import {
  plannedConsumerLeaves,
  validatePlannedApiReferences,
} from './consumer-usage/planned.mts'
import type { PlannedApiReference } from './consumer-usage/planned.mts'

export interface ConsumerUsageAggregate {
  schemaVersion: 2
  complete: true
  producerRevision: string
  generatedAt: string
  roster: { memberCount: number; digest: string }
  sources: { revisionCount: number; digest: string }
  usedLeafSpecifiers: string[]
  plannedApiReferences: PlannedApiReference[]
  contentDigest: string
}

export interface AggregateValidationContext {
  producerRevision: string
  sourceSetDigest: string
  now: number
}

export const AGGREGATE_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const AGGREGATE_FUTURE_SKEW_MS = 5 * 60 * 1000

function invalidAggregate(reason: string): never {
  throw new Error(
    `Consumer usage evidence is invalid. Where: fleet usage aggregate. Saw ${reason}; wanted complete authenticated current evidence. Fix: refresh the verified consumer usage aggregate through its published pipeline.`,
  )
}

function aggregateRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalidAggregate('a non-object record')
  }
  const record = value as Record<string, unknown>
  const actual = Object.keys(record)
  if (
    actual.length !== keys.length ||
    actual.some(key => !keys.includes(key))
  ) {
    invalidAggregate('unexpected schema fields')
  }
  return record
}

function aggregateDigest(value: string): string {
  return `sha256:${hash('sha256', value, 'hex')}`
}

function validateAggregateMetadataPaths(repoRoot: string): void {
  for (const file of ['package.json', '.config/repo/socket-wheelhouse.json']) {
    if (!repositoryContainsTarget(repoRoot, path.join(repoRoot, file))) {
      invalidAggregate('external repository metadata')
    }
  }
}

export function consumerRosterIdentity(
  repoRoot: string,
): ConsumerUsageAggregate['roster'] {
  const slugs = readConsumerRoster(repoRoot)
    .repos.map(member =>
      `${member.owner ?? SOCKET_GITHUB_ORGS[0]}/${member.name}`.toLowerCase(),
    )
    .toSorted()
  if (slugs.length === 0 || new Set(slugs).size !== slugs.length) {
    invalidAggregate('an empty or duplicate roster')
  }
  return {
    memberCount: slugs.length,
    digest: aggregateDigest(`${slugs.join('\n')}\n`),
  }
}

export function consumerAggregateContentDigest(
  aggregate: Omit<ConsumerUsageAggregate, 'contentDigest'>,
): string {
  return aggregateDigest(
    JSON.stringify({
      schemaVersion: aggregate.schemaVersion,
      complete: aggregate.complete,
      producerRevision: aggregate.producerRevision,
      generatedAt: aggregate.generatedAt,
      roster: {
        memberCount: aggregate.roster.memberCount,
        digest: aggregate.roster.digest,
      },
      sources: {
        revisionCount: aggregate.sources.revisionCount,
        digest: aggregate.sources.digest,
      },
      usedLeafSpecifiers: aggregate.usedLeafSpecifiers,
      plannedApiReferences: aggregate.plannedApiReferences.map(reference => ({
        __proto__: null,
        api: reference.api,
        targetVersion: reference.targetVersion,
        ...(reference.pathHint === undefined
          ? {}
          : { pathHint: reference.pathHint }),
      })),
    }),
  )
}

function validateAggregateStructure(value: unknown): ConsumerUsageAggregate {
  const record = aggregateRecord(value, [
    'schemaVersion',
    'complete',
    'producerRevision',
    'generatedAt',
    'roster',
    'sources',
    'usedLeafSpecifiers',
    'plannedApiReferences',
    'contentDigest',
  ])
  const roster = aggregateRecord(record['roster'], ['memberCount', 'digest'])
  const sources = aggregateRecord(record['sources'], [
    'revisionCount',
    'digest',
  ])
  if (record['schemaVersion'] !== 2 || record['complete'] !== true) {
    invalidAggregate('unsupported or incomplete evidence')
  }
  for (const digest of [
    record['contentDigest'],
    roster['digest'],
    sources['digest'],
  ]) {
    if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
      invalidAggregate('an invalid SHA-256 digest')
    }
  }
  for (const count of [roster['memberCount'], sources['revisionCount']]) {
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count <= 0
    ) {
      invalidAggregate('an invalid member count')
    }
  }
  if (
    typeof record['producerRevision'] !== 'string' ||
    !/^[a-f0-9]{40}$/.test(record['producerRevision'])
  ) {
    invalidAggregate('an invalid producer revision')
  }
  if (
    typeof record['generatedAt'] !== 'string' ||
    !Array.isArray(record['usedLeafSpecifiers'])
  ) {
    invalidAggregate('an invalid timestamp or specifier list')
  }
  validatePlannedApiReferences(record['plannedApiReferences'])
  return value as ConsumerUsageAggregate
}

export function consumerAggregateUsedLeaves(
  repoRoot: string,
  specifiers: readonly unknown[],
): string[] {
  validateAggregateMetadataPaths(repoRoot)
  const publicLeaves = new Set(exportLeaves(repoRoot))
  const used = new Set<string>()
  let previous: string | undefined
  for (const specifier of specifiers) {
    if (
      typeof specifier !== 'string' ||
      (previous !== undefined && specifier <= previous)
    ) {
      invalidAggregate('unsorted, duplicate, or non-string specifiers')
    }
    // Match either public Lib package alias and capture its complete subpath.
    const match = /^@socketsecurity\/(?:lib|lib-stable)\/(.+)$/.exec(specifier)
    const leaf = match?.[1]
    if (!leaf || !publicLeaves.has(leaf)) {
      invalidAggregate('a non-public leaf specifier')
    }
    used.add(leaf)
    previous = specifier
  }
  return [...used].toSorted()
}

export function validateConsumerUsageAggregate(
  repoRoot: string,
  value: unknown,
  context: AggregateValidationContext,
): ConsumerUsageAggregate {
  const aggregate = validateAggregateStructure(value)
  const expected = consumerRosterIdentity(repoRoot)
  if (
    aggregate.roster.memberCount !== expected.memberCount ||
    aggregate.roster.digest !== expected.digest ||
    aggregate.sources.revisionCount !== expected.memberCount
  ) {
    invalidAggregate('a roster or source-count mismatch')
  }
  if (aggregate.producerRevision !== context.producerRevision) {
    invalidAggregate('a producer revision mismatch')
  }
  if (
    aggregate.sources.digest !== context.sourceSetDigest ||
    !Number.isFinite(context.now)
  ) {
    invalidAggregate('a source-set binding or clock mismatch')
  }
  const generated = Date.parse(aggregate.generatedAt)
  if (
    !Number.isFinite(generated) ||
    new Date(generated).toISOString() !== aggregate.generatedAt
  ) {
    invalidAggregate('an invalid generation timestamp')
  }
  if (
    generated > context.now + AGGREGATE_FUTURE_SKEW_MS ||
    context.now - generated > AGGREGATE_MAX_AGE_MS
  ) {
    invalidAggregate('stale or future-dated evidence')
  }
  consumerAggregateUsedLeaves(repoRoot, aggregate.usedLeafSpecifiers)
  if (consumerAggregateContentDigest(aggregate) !== aggregate.contentDigest) {
    invalidAggregate('a content digest mismatch')
  }
  return aggregate
}

export function aggregateFleetUsageReport(
  repoRoot: string,
  aggregate: ConsumerUsageAggregate,
): FleetLibUsageReport {
  const used = new Set([
    ...consumerAggregateUsedLeaves(repoRoot, aggregate.usedLeafSpecifiers),
    ...plannedConsumerLeaves(repoRoot, aggregate.plannedApiReferences),
  ])
  const leaves: FleetLibUsageReport['leaves'] = {}
  for (const leaf of used) {
    leaves[leaf] = { named: [], namespace: true, repos: [], typeOnlyNamed: [] }
  }
  const kept = keptLeaves(repoRoot)
  return {
    leaves,
    reposScanned: [],
    unusedLeaves: exportLeaves(repoRoot)
      .filter(leaf => !leaves[leaf] && !kept.has(leaf))
      .toSorted(),
  }
}
