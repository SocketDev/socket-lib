// vitest specs for codify-scan/inventory — the Phase-2 enforcement-surface
// inventory wrapper (splitHooks + buildInventory) AND a regression guard on the
// collectLintRules path: the plugin layout is one fleet/<rule-id>/ dir per rule,
// not a rules/*.mts tree. A wrong path made socketRules silently empty, which
// turned the code-is-law gate's socket arm into an unconditional fail-open.

import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { collectLintRules } from '../../../scripts/fleet/lib/enforcer-inventory.mts'
import {
  buildInventory,
  splitHooks,
} from '../../../scripts/fleet/codify-scan/inventory.mts'
import { REPO_ROOT } from '../../../scripts/fleet/paths.mts'

describe('splitHooks', () => {
  test('buckets by -guard / -reminder suffix; else installer', () => {
    const out = splitHooks([
      'foo-guard',
      'bar-reminder',
      'setup-signing',
      'baz-guard',
    ])
    assert.deepEqual(out.guards, ['baz-guard', 'foo-guard'])
    assert.deepEqual(out.reminders, ['bar-reminder'])
    assert.deepEqual(out.installers, ['setup-signing'])
  })

  test('each bucket is sorted', () => {
    const out = splitHooks(['z-guard', 'a-guard', 'm-reminder', 'b-reminder'])
    assert.deepEqual(out.guards, ['a-guard', 'z-guard'])
    assert.deepEqual(out.reminders, ['b-reminder', 'm-reminder'])
  })
})

describe('collectLintRules (regression: real plugin layout)', () => {
  test('finds socket rules from fleet/<rule-id>/ directories', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'plugin-'))
    const pluginDir = path.join(dir, '.config', 'oxlint-plugin', 'fleet')
    mkdirSync(path.join(pluginDir, 'my-rule'), { recursive: true })
    mkdirSync(path.join(pluginDir, 'other-rule'), { recursive: true })
    const { socketRules } = collectLintRules(dir)
    assert.ok(socketRules.has('my-rule'), 'reads a rule dir as a socket rule')
    assert.ok(socketRules.has('other-rule'))
    assert.equal(socketRules.size, 2)
  })

  test('socketRules empty when the plugin is absent', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'no-plugin-'))
    assert.equal(collectLintRules(dir).socketRules.size, 0)
  })

  test('finds the real socket rules in THIS repo (would catch the path bug)', () => {
    // The bug: collectLintRules read a nonexistent path, so this set was always
    // empty even though the repo ships 80+ rules. Assert it is non-empty.
    const { socketRules } = collectLintRules(REPO_ROOT)
    assert.ok(
      socketRules.size > 0,
      'the wheelhouse ships socket/ rules; an empty set means the plugin path is wrong again',
    )
  })
})

describe('buildInventory', () => {
  test('emits the full enforcement surface for this repo', () => {
    const inv = buildInventory(REPO_ROOT)
    assert.ok(inv.hooks.guards.length > 0, 'has guards')
    assert.ok(inv.hooks.reminders.length > 0, 'has reminders')
    assert.ok(inv.lintRules.socket.length > 0, 'has socket rules')
    assert.ok(inv.checks.length > 0, 'has check scripts')
    assert.ok(
      inv.checks.every(c => c.includes('/check/') || c.startsWith('check/')),
      'every check path is under a check/ dir',
    )
    assert.ok(inv.fleetDocs.length > 0, 'has fleet docs')
  })
})
