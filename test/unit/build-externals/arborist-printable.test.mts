import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const printable: unknown = createRequire(import.meta.url)(
  '../../../scripts/repo/build-externals/stubs/arborist-printable.cjs',
)
assert.ok(typeof printable === 'function')

describe('arborist printable summary', () => {
  it('serializes a cyclic tree as a minimal record without inherited properties', () => {
    const tree = { name: 'example-package', version: '1.2.3', parent: {} }
    tree.parent = tree
    const summary: unknown = printable(tree)
    expect(Object.getPrototypeOf(summary)).toBeNull()
    expect(JSON.parse(JSON.stringify(summary))).toEqual({
      name: 'example-package',
      version: '1.2.3',
      note: 'socket-lib: printable stub',
    })
  })

  it('accepts a missing tree', () => {
    expect(JSON.parse(JSON.stringify(printable(undefined)))).toEqual({
      note: 'socket-lib: printable stub',
    })
  })
})
