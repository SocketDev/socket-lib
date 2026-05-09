/**
 * @fileoverview Tests for ai/ profiles — verifies the lockdown
 * shapes are what callers expect.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EDIT_ONLY_PROFILE,
  FULL_FIX_PROFILE,
  READ_ONLY_PROFILE,
} from '../profiles.mts'

test('READ_ONLY_PROFILE: bash explicitly denied', () => {
  assert.ok(READ_ONLY_PROFILE.disallow.includes('Bash'))
  assert.ok(READ_ONLY_PROFILE.disallow.includes('Edit'))
  assert.ok(READ_ONLY_PROFILE.disallow.includes('Write'))
})

test('READ_ONLY_PROFILE: dontAsk permission', () => {
  assert.strictEqual(READ_ONLY_PROFILE.permissionMode, 'dontAsk')
})

test('READ_ONLY_PROFILE: read tools allowed', () => {
  assert.ok(READ_ONLY_PROFILE.tools.includes('Read'))
  assert.ok(READ_ONLY_PROFILE.tools.includes('Grep'))
  assert.ok(READ_ONLY_PROFILE.tools.includes('Glob'))
})

test('EDIT_ONLY_PROFILE: bash denied, edit allowed', () => {
  assert.ok(EDIT_ONLY_PROFILE.disallow.includes('Bash'))
  assert.ok(EDIT_ONLY_PROFILE.tools.includes('Edit'))
  assert.ok(EDIT_ONLY_PROFILE.tools.includes('Write'))
})

test('EDIT_ONLY_PROFILE: acceptEdits permission', () => {
  assert.strictEqual(EDIT_ONLY_PROFILE.permissionMode, 'acceptEdits')
})

test('FULL_FIX_PROFILE: bash allowed but allowlisted', () => {
  assert.ok(FULL_FIX_PROFILE.tools.includes('Bash'))
  assert.ok(FULL_FIX_PROFILE.allow.length > 0)
  for (const entry of FULL_FIX_PROFILE.allow) {
    assert.match(entry, /^Bash\(/, `expected Bash(...) glob, got: ${entry}`)
  }
})

test('FULL_FIX_PROFILE: webfetch / websearch denied', () => {
  assert.ok(FULL_FIX_PROFILE.disallow.includes('WebFetch'))
  assert.ok(FULL_FIX_PROFILE.disallow.includes('WebSearch'))
})

test('all profiles: tools alphabetically sorted', () => {
  for (const [name, profile] of [
    ['READ_ONLY', READ_ONLY_PROFILE],
    ['EDIT_ONLY', EDIT_ONLY_PROFILE],
    ['FULL_FIX', FULL_FIX_PROFILE],
  ] as const) {
    const sorted = [...profile.tools].sort()
    assert.deepStrictEqual(
      profile.tools,
      sorted,
      `${name} tools should be alphabetically sorted`,
    )
  }
})

test('all profiles: disallow alphabetically sorted', () => {
  for (const [name, profile] of [
    ['READ_ONLY', READ_ONLY_PROFILE],
    ['EDIT_ONLY', EDIT_ONLY_PROFILE],
    ['FULL_FIX', FULL_FIX_PROFILE],
  ] as const) {
    const sorted = [...profile.disallow].sort()
    assert.deepStrictEqual(
      profile.disallow,
      sorted,
      `${name} disallow should be alphabetically sorted`,
    )
  }
})
