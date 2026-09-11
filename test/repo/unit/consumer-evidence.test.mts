import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import {
  consumerEvidencePath,
  readConsumerEvidence,
} from '../../../scripts/repo/consumer-evidence.mts'

const fixtures: string[] = []
function fixtureRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'consumer-evidence-'))
  const rosterDir = path.join(root, '.claude/skills/fleet/cascading-fleet/lib')
  mkdirSync(rosterDir, { recursive: true })
  writeFileSync(
    path.join(rosterDir, 'fleet-repos.json'),
    JSON.stringify({
      repos: [{ name: 'example-consumer', owner: 'example-owner' }],
    }),
  )
  fixtures.push(root)
  return root
}
function writeEvidence(root: string, changes: object = {}): string {
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
      files: [],
      ...changes,
    }),
  )
  return file
}
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    safeDeleteSync(root)
  }
})

test('accepts complete revision-bearing evidence', () => {
  const root = fixtureRoot()
  writeEvidence(root)
  expect(readConsumerEvidence(root, 'example-consumer').revision).toBe(
    'a'.repeat(40),
  )
})
test.each([
  { revision: 'branch' },
  { complete: false },
  { repo: 'wrong-consumer' },
  { slug: 'other-owner/example-consumer' },
  {
    files: [
      { path: 'src/example.mts', text: '' },
      { path: 'src/example.mts', text: '' },
    ],
  },
  { files: [{ path: '../outside.mts', text: '' }] },
])('rejects incomplete or escaping metadata %j', changes => {
  const root = fixtureRoot()
  writeEvidence(root, changes)
  expect(() => readConsumerEvidence(root, 'example-consumer')).toThrow()
})
test('rejects a symlink to external evidence', () => {
  const root = fixtureRoot()
  const external = writeEvidence(fixtureRoot())
  const file = consumerEvidencePath(root, 'example-consumer')
  mkdirSync(path.dirname(file), { recursive: true })
  symlinkSync(external, file)
  expect(() => readConsumerEvidence(root, 'example-consumer')).toThrow()
})
