/**
 * @fileoverview Unit tests for src/node/fs-promises.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeFsPromises } from '@socketsecurity/lib/node/fs-promises'

describe('node/fs-promises', () => {
  it('returns the node:fs/promises module', () => {
    const fsp = getNodeFsPromises()
    expect(typeof fsp.readFile).toBe('function')
    expect(typeof fsp.writeFile).toBe('function')
    expect(typeof fsp.stat).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeFsPromises()).toBe(getNodeFsPromises())
  })

  it('does not throw', () => {
    expect(() => getNodeFsPromises()).not.toThrow()
  })
})
