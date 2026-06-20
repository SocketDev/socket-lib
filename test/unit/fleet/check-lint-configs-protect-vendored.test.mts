// vitest spec for check-lint-configs-protect-vendored — the pure
// reexposedVendored detector. The directory scan (main / findReexposedVendored)
// is exercised by the check running in `check --all`.

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { reexposedVendored } from '../../../scripts/fleet/check/lint-configs-protect-vendored.mts'

describe('lint-configs-protect-vendored — reexposedVendored', () => {
  test('a vendored glob BEFORE the last negation is flagged (re-exposed)', () => {
    assert.deepEqual(
      reexposedVendored(['**/node_modules', '**/vendor/**', '!**/template/**']),
      ['**/vendor/**'],
    )
  })

  test('a vendored glob AFTER the last negation is safe', () => {
    assert.deepEqual(
      reexposedVendored(['**/node_modules', '!**/template/**', '**/vendor/**']),
      [],
    )
  })

  test('no negation → nothing re-exposed', () => {
    assert.deepEqual(reexposedVendored(['**/vendor/**', '**/node_modules']), [])
  })

  test('mixed positions — only the pre-negation vendored glob is flagged', () => {
    assert.deepEqual(
      reexposedVendored([
        '**/vendor/**',
        '!**/template/**',
        '**/acorn-bindgen.cjs',
        '**/acorn.wasm',
      ]),
      ['**/vendor/**'],
    )
  })

  test('the real dogfood shape (all vendored re-excluded after the negation) is safe', () => {
    assert.deepEqual(
      reexposedVendored([
        '**/node_modules',
        '**/vendor/**',
        '!**/template/**',
        '**/acorn-bindgen.cjs',
        '**/acorn.wasm',
        '**/wasm_exec.js',
        '**/vendor/**',
        '**/external/**',
      ]),
      [],
    )
  })
})
