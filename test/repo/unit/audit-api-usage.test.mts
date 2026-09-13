import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { collectConsumerReferences } from '../../../scripts/repo/audit-api-usage.mts'
import { consumerEvidencePath } from '../../../scripts/repo/consumer-evidence.mts'

const fixtures: string[] = []

function makeConsumerFixture(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'consumer-api-usage-'))
  fixtures.push(root)
  const rosterDir = path.join(
    root,
    '.claude/skills/fleet/cascading-commits/lib',
  )
  mkdirSync(rosterDir, { recursive: true })
  writeFileSync(
    path.join(rosterDir, 'fleet-repos.json'),
    JSON.stringify({
      repos: [{ name: 'example-consumer', owner: 'example-owner' }],
    }),
  )
  return root
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    safeDeleteSync(root)
  }
})

test('rejects unavailable evidence instead of reporting no consumer references', () => {
  const root = makeConsumerFixture()
  expect(() => collectConsumerReferences(['example-consumer'], root)).toThrow()
})

test('accepts a complete snapshot with no consumer references', () => {
  const root = makeConsumerFixture()
  const file = consumerEvidencePath(root, 'example-consumer')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      repo: 'example-consumer',
      slug: 'example-owner/example-consumer',
      revision: 'a'.repeat(40),
      complete: true,
      files: [{ path: 'src/example.ts', text: 'export const example = 1' }],
    }),
  )
  expect(collectConsumerReferences(['example-consumer'], root)).toEqual([])
})
