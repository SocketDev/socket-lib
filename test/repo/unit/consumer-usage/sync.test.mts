import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { writeConsumerStubList } from '../../../../scripts/repo/consumer-usage/sync.mts'
import { makeUsageFixture } from './fixture.mts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    safeDeleteSync(root)
  }
})

test('writes verified candidates while preserving unrelated settings', () => {
  const { root, verified } = makeUsageFixture()
  roots.push(root)
  const settingsPath = path.join(root, '.config/repo/socket-wheelhouse.json')
  writeFileSync(
    settingsPath,
    JSON.stringify({ bundle: { ref: 'verified-pack' }, repoOwned: true }),
  )

  writeConsumerStubList(root, verified.aggregate)

  expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({
    bundle: { ref: 'verified-pack' },
    repoOwned: true,
    buildStubs: {
      unexposed: {
        leaves: [],
        scannedRoster: ['example-consumer'],
      },
    },
  })
})
