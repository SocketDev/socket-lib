// node --test specs for the no-hand-edit-registry-pin-guard hook.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  detectRegistryPinChange,
  formatBlock,
  isGuardedWorkflowFile,
  registryPins,
} from '../index.mts'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const WF = 'SocketDev/socket-registry/.github/workflows/ci.yml'
const ACT = 'SocketDev/socket-registry/.github/actions/setup-and-install'

test('isGuardedWorkflowFile: workflow yml/yaml', () => {
  assert.strictEqual(
    isGuardedWorkflowFile('/repo/.github/workflows/ci.yml'),
    true,
  )
  assert.strictEqual(isGuardedWorkflowFile('.github/workflows/release.yaml'), true)
})

test('isGuardedWorkflowFile: composite action', () => {
  assert.strictEqual(
    isGuardedWorkflowFile('/repo/.github/actions/setup/action.yml'),
    true,
  )
})

test('isGuardedWorkflowFile: non-workflow file', () => {
  assert.strictEqual(isGuardedWorkflowFile('/repo/src/index.mts'), false)
  assert.strictEqual(isGuardedWorkflowFile('/repo/README.md'), false)
})

test('registryPins: extracts uses-path → sha', () => {
  const pins = registryPins(`      uses: ${WF}@${SHA_A} # main (2026-01-01)\n`)
  assert.strictEqual(pins.get(WF), SHA_A)
})

test('detectRegistryPinChange: same path, different sha → changed', () => {
  const c = detectRegistryPinChange(
    `uses: ${WF}@${SHA_A}`,
    `uses: ${WF}@${SHA_B}`,
  )
  assert.strictEqual(c.changed, true)
  assert.strictEqual(c.from, SHA_A)
  assert.strictEqual(c.to, SHA_B)
  assert.strictEqual(c.usesPath, WF)
})

test('detectRegistryPinChange: action pin change is caught too', () => {
  const c = detectRegistryPinChange(
    `uses: ${ACT}@${SHA_A}`,
    `uses: ${ACT}@${SHA_B}`,
  )
  assert.strictEqual(c.changed, true)
  assert.strictEqual(c.usesPath, ACT)
})

test('detectRegistryPinChange: unchanged sha → not changed', () => {
  const c = detectRegistryPinChange(
    `uses: ${WF}@${SHA_A}`,
    `uses: ${WF}@${SHA_A} # comment reworded`,
  )
  assert.strictEqual(c.changed, false)
})

test('detectRegistryPinChange: new pin where none existed → not a change', () => {
  const c = detectRegistryPinChange('name: ci\n', `uses: ${WF}@${SHA_A}`)
  assert.strictEqual(c.changed, false)
})

test('detectRegistryPinChange: a non-registry uses pin is ignored', () => {
  const c = detectRegistryPinChange(
    'uses: actions/checkout@1111111111111111111111111111111111111111',
    'uses: actions/checkout@2222222222222222222222222222222222222222',
  )
  assert.strictEqual(c.changed, false)
})

test('formatBlock: names the phrase + the from/to shas', () => {
  const msg = formatBlock({
    changed: true,
    from: SHA_A,
    to: SHA_B,
    usesPath: WF,
  })
  assert.match(msg, /no-hand-edit-registry-pin-guard/)
  assert.match(msg, /Allow registry-pin-edit bypass/)
  assert.match(msg, /sync-registry-workflow-pins\.mts/)
})
