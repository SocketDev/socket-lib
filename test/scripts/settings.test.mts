/**
 * @file Specs for the member-settings writer.
 *   `.config/repo/socket-wheelhouse.json` is a HYBRID surface — the fleet
 *   cascade owns most of it, the member owns its cutouts — so a writer that
 *   serializes only its own section deletes everyone else's. That is the
 *   regression these pin: a whole-document write once cut the file from
 *   seventeen top-level keys to two, taking `bundle.ref` with it, and every CI
 *   run then failed at the fleet payload fetch.
 *   The write is driven through an injected `writeFileSync`, so no case here
 *   touches a real settings file.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  memberSettingsPath,
  readBuildStubs,
  writeUnexposedLeaves,
} from '../../scripts/repo/build-stubs/settings.mts'

// A settings document shaped like the real one: fleet-owned keys, the member's
// own keys, and the buildStubs section the writer targets.
const SETTINGS = {
  $schema: './socket-wheelhouse-schema.json',
  buildStubs: {
    keepExposed: [{ leaf: 'process/spawn/retry/node', reason: 'ships ahead' }],
    unexposed: { leaves: ['alpha/one', 'beta/two'], scannedRoster: ['alpha'] },
  },
  bundle: {
    ref: 'fleet-pack-0000000000000000000000000000000000000000',
    cascadeSha: '0000000000000000000000000000000000000000',
  },
  repoName: 'socket-lib',
  schemaVersion: 1,
}

function setupRepo(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'build-stubs-settings-'))
  const settings = memberSettingsPath(dir)
  mkdirSync(path.dirname(settings), { recursive: true })
  writeFileSync(settings, `${JSON.stringify(SETTINGS, null, 2)}\n`)
  return dir
}

describe('writeUnexposedLeaves', () => {
  test('keeps every sibling key, including the fleet-pack pin', () => {
    // The exact regression. `bundle.ref` is what the payload fetch reads, so
    // losing it fails CI at setup before a single build step runs.
    const dir = setupRepo()
    writeUnexposedLeaves(
      dir,
      { leaves: ['alpha/one'], scannedRoster: ['alpha'] },
      writeFileSync,
    )
    const after = JSON.parse(readFileSync(memberSettingsPath(dir), 'utf8'))
    expect(Object.keys(after).toSorted()).toEqual(
      Object.keys(SETTINGS).toSorted(),
    )
    expect(after.bundle.ref).toBe(SETTINGS.bundle.ref)
    expect(after.repoName).toBe('socket-lib')
  })

  test('replaces only the unexposed record', () => {
    const dir = setupRepo()
    writeUnexposedLeaves(
      dir,
      { leaves: ['gamma/three'], scannedRoster: ['gamma'] },
      writeFileSync,
    )
    const section = readBuildStubs(dir)
    expect(section.unexposed.leaves).toEqual(['gamma/three'])
    expect(section.unexposed.scannedRoster).toEqual(['gamma'])
  })

  test('leaves keepExposed alone, since it is a sibling of unexposed', () => {
    // Both live under buildStubs, so a section-level overwrite would drop
    // keepExposed while looking like it only touched the stub list.
    const dir = setupRepo()
    writeUnexposedLeaves(dir, { leaves: [], scannedRoster: [] }, writeFileSync)
    expect(readBuildStubs(dir).keepExposed).toEqual(
      SETTINGS.buildStubs.keepExposed,
    )
  })

  test('round-trips: writing the record back changes nothing else', () => {
    const dir = setupRepo()
    const before = readFileSync(memberSettingsPath(dir), 'utf8')
    writeUnexposedLeaves(dir, readBuildStubs(dir).unexposed, writeFileSync)
    expect(readFileSync(memberSettingsPath(dir), 'utf8')).toBe(before)
  })

  test('emits a trailing newline so the file stays diff-clean', () => {
    const dir = setupRepo()
    writeUnexposedLeaves(dir, { leaves: [], scannedRoster: [] }, writeFileSync)
    expect(readFileSync(memberSettingsPath(dir), 'utf8')).toMatch(/\}\n$/)
  })

  test('creates the section when the file has no buildStubs yet', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'build-stubs-settings-'))
    const settings = memberSettingsPath(dir)
    mkdirSync(path.dirname(settings), { recursive: true })
    writeFileSync(settings, `${JSON.stringify({ repoName: 'example' })}\n`)
    writeUnexposedLeaves(
      dir,
      { leaves: ['alpha/one'], scannedRoster: [] },
      writeFileSync,
    )
    const after = JSON.parse(readFileSync(settings, 'utf8'))
    expect(after.repoName).toBe('example')
    expect(after.buildStubs.unexposed.leaves).toEqual(['alpha/one'])
  })
})
