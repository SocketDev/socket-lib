import { readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import {
  consumerUsageCachePaths,
  readInstalledConsumerUsage,
  writeInstalledConsumerUsage,
} from '../../../../scripts/repo/consumer-usage/cache.mts'
import { AGGREGATE_MAX_AGE_MS } from '../../../../scripts/repo/consumer-usage-aggregate.mts'
import { makeUsageFixture, USAGE_NOW } from './fixture.mts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) safeDeleteSync(root)
})

function installedFixture() {
  const fixture = makeUsageFixture()
  roots.push(fixture.root)
  writeInstalledConsumerUsage(fixture.root, fixture.verified)
  return fixture
}

test('revalidates fresh aggregate and manifest bytes offline', () => {
  const { root, verified } = installedFixture()
  expect(readInstalledConsumerUsage(root, { now: USAGE_NOW })).toEqual(
    verified.aggregate,
  )
})

test.each(['manifestDigest', 'layerDigest', 'sourcesDigest'] as const)(
  'rejects tampered receipt %s',
  field => {
    const { root, verified } = installedFixture()
    writeFileSync(
      consumerUsageCachePaths(root).receipt,
      JSON.stringify({
        ...verified.receipt,
        [field]: `sha256:${'c'.repeat(64)}`,
      }),
    )
    expect(() => readInstalledConsumerUsage(root, { now: USAGE_NOW })).toThrow()
  },
)

test.each(['aggregate', 'manifest'] as const)(
  'rejects changed cached %s bytes',
  field => {
    const { root } = installedFixture()
    const file = consumerUsageCachePaths(root)[field]
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n`)
    expect(() => readInstalledConsumerUsage(root, { now: USAGE_NOW })).toThrow()
  },
)

test('rejects stale cached evidence', () => {
  const { root } = installedFixture()
  expect(() =>
    readInstalledConsumerUsage(root, {
      now: USAGE_NOW + AGGREGATE_MAX_AGE_MS + 1,
    }),
  ).toThrow()
})

test('rejects an escaping cache before writes', () => {
  const source = makeUsageFixture()
  const external = makeUsageFixture()
  roots.push(source.root, external.root)
  symlinkSync(external.root, path.join(source.root, '.cache'))
  expect(() =>
    writeInstalledConsumerUsage(source.root, source.verified),
  ).toThrow()
})

test('rejects a future-dated verification receipt', () => {
  const { root, verified } = installedFixture()
  writeFileSync(
    consumerUsageCachePaths(root).receipt,
    JSON.stringify({
      ...verified.receipt,
      verifiedAt: new Date(USAGE_NOW + AGGREGATE_MAX_AGE_MS).toISOString(),
    }),
  )
  expect(() => readInstalledConsumerUsage(root, { now: USAGE_NOW })).toThrow()
})

test.each(['sources', 'wrong-content'])(
  'rejects an immutable tag bound to %s instead of aggregate content',
  kind => {
    const { root, verified } = installedFixture()
    const digest =
      kind === 'sources'
        ? verified.receipt.sourcesDigest.slice(7)
        : 'c'.repeat(64)
    writeFileSync(
      consumerUsageCachePaths(root).receipt,
      JSON.stringify({
        ...verified.receipt,
        immutableTag: `lib-usage-${verified.aggregate.producerRevision}-${digest}`,
      }),
    )
    expect(() => readInstalledConsumerUsage(root, { now: USAGE_NOW })).toThrow()
  },
)
