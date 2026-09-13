import { Buffer } from 'node:buffer'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sha256Hex } from '../../../../scripts/repo/bootstrap/fleet.mjs'
import {
  consumerAggregateContentDigest,
  consumerRosterIdentity,
} from '../../../../scripts/repo/consumer-usage-aggregate.mts'
import {
  consumerUsageImmutableTag,
  USAGE_ARTIFACT_TYPE,
  USAGE_LAYER_TYPE,
  USAGE_REGISTRY,
  USAGE_REPOSITORY,
} from '../../../../scripts/repo/consumer-usage/registry.mts'
import type { VerifiedConsumerUsage } from '../../../../scripts/repo/consumer-usage/registry.mts'

export const USAGE_NOW = Date.parse('2026-09-12T12:00:00.000Z')

export function makeUsageFixture(): {
  root: string
  verified: VerifiedConsumerUsage
} {
  const root = mkdtempSync(path.join(os.tmpdir(), 'consumer-usage-transport-'))
  const roster = path.join(root, '.claude/skills/fleet/cascading-commits/lib')
  mkdirSync(roster, { recursive: true })
  mkdirSync(path.join(root, '.config/repo'), { recursive: true })
  writeFileSync(
    path.join(roster, 'fleet-repos.json'),
    JSON.stringify({
      repos: [{ name: 'example-consumer', owner: 'example-owner' }],
    }),
  )
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ exports: { './entry': './dist/entry.js' } }),
  )
  writeFileSync(path.join(root, '.config/repo/socket-wheelhouse.json'), '{}')
  const payload = {
    schemaVersion: 1 as const,
    complete: true as const,
    producerRevision: 'a'.repeat(40),
    generatedAt: new Date(USAGE_NOW).toISOString(),
    roster: consumerRosterIdentity(root),
    sources: { revisionCount: 1, digest: `sha256:${'b'.repeat(64)}` },
    usedLeafSpecifiers: ['@socketsecurity/lib-stable/entry'],
  }
  const aggregate = {
    ...payload,
    contentDigest: consumerAggregateContentDigest(payload),
  }
  const bytes = Buffer.from(JSON.stringify(aggregate))
  const layerDigest = `sha256:${sha256Hex(bytes)}`
  const manifestBytes = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      artifactType: USAGE_ARTIFACT_TYPE,
      annotations: {
        'org.opencontainers.image.revision': payload.producerRevision,
      },
      layers: [
        {
          mediaType: USAGE_LAYER_TYPE,
          digest: layerDigest,
          size: bytes.length,
        },
      ],
    }),
  )
  return {
    root,
    verified: {
      aggregate,
      bytes,
      manifestBytes,
      receipt: {
        schemaVersion: 1,
        repository: `${USAGE_REGISTRY}/${USAGE_REPOSITORY}`,
        immutableTag: consumerUsageImmutableTag(
          payload.producerRevision,
          payload.sources.digest,
        ),
        manifestDigest: `sha256:${sha256Hex(manifestBytes)}`,
        layerDigest,
        producerRevision: payload.producerRevision,
        sourcesDigest: payload.sources.digest,
        verifiedAt: new Date(USAGE_NOW).toISOString(),
      },
    },
  }
}
