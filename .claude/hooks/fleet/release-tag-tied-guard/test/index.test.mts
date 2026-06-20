// node --test specs for the release-tag-tied-guard hook.

import test from 'node:test'
import assert from 'node:assert/strict'

import { detectReleaseCreate, formatBlock } from '../index.mts'

test('detectReleaseCreate: backfill with --verify-tag + value flags', () => {
  const d = detectReleaseCreate(
    'gh release create v0.0.18 --verify-tag --title v0.0.18 --notes-file /tmp/x.md',
  )
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.ref, 'v0.0.18')
  assert.strictEqual(d.hasTarget, false)
})

test('detectReleaseCreate: bare tag', () => {
  const d = detectReleaseCreate('gh release create v1.2.3')
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.ref, 'v1.2.3')
  assert.strictEqual(d.hasTarget, false)
})

test('detectReleaseCreate: --target flips hasTarget', () => {
  const d = detectReleaseCreate('gh release create v1.2.3 --target main')
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.ref, 'v1.2.3')
  assert.strictEqual(d.hasTarget, true)
})

test('detectReleaseCreate: --target=<sha> form', () => {
  const d = detectReleaseCreate('gh release create v1.2.3 --target=abc1234')
  assert.strictEqual(d.hasTarget, true)
})

test('detectReleaseCreate: value flag before the ref is not mistaken for it', () => {
  const d = detectReleaseCreate(
    'gh release create --title "My Release" v2.0.0 --generate-notes',
  )
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.ref, 'v2.0.0')
})

test('detectReleaseCreate: generate-notes (no ref value) keeps ref empty-safe', () => {
  const d = detectReleaseCreate('gh release create v3.0.0 --generate-notes')
  assert.strictEqual(d.ref, 'v3.0.0')
})

test('detectReleaseCreate: in a pipeline still detected', () => {
  const d = detectReleaseCreate('gh release create v1.0.0 && echo done')
  assert.strictEqual(d.detected, true)
  assert.strictEqual(d.ref, 'v1.0.0')
})

test('detectReleaseCreate: gh release list is not a create', () => {
  assert.strictEqual(detectReleaseCreate('gh release list').detected, false)
})

test('detectReleaseCreate: gh release view is not a create', () => {
  assert.strictEqual(
    detectReleaseCreate('gh release view v1.0.0').detected,
    false,
  )
})

test('detectReleaseCreate: unrelated gh subcommand', () => {
  assert.strictEqual(detectReleaseCreate('gh pr create').detected, false)
})

test('detectReleaseCreate: quoted in an echo is not a real invocation', () => {
  assert.strictEqual(
    detectReleaseCreate('echo "gh release create v1.0.0"').detected,
    false,
  )
})

test('formatBlock: names the phrase and the missing-tag reason', () => {
  const msg = formatBlock({ detected: true, hasTarget: false, ref: 'v9.9.9' })
  assert.match(msg, /release-tag-tied-guard/)
  assert.match(msg, /Allow arbitrary-release bypass/)
  assert.match(msg, /v9\.9\.9/)
})

test('formatBlock: --target reason', () => {
  const msg = formatBlock({ detected: true, hasTarget: true, ref: 'v1.0.0' })
  assert.match(msg, /--target/)
})

test('formatBlock: no-ref reason', () => {
  const msg = formatBlock({ detected: true, hasTarget: false, ref: '' })
  assert.match(msg, /no release ref/)
})
