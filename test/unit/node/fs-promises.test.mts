/**
 * @file Unit tests for src/node/fs-promises.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeFsPromises } from '../../../src/node/fs-promises'

describe('node/fs-promises', () => {
  it('returns the node:fs/promises module', () => {
    const fsp = getNodeFsPromises()
    expect(typeof fsp.readFile).toBe('function')
    expect(typeof fsp.writeFile).toBe('function')
    expect(typeof fsp.stat).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    const first = getNodeFsPromises()
    const second = getNodeFsPromises()
    expect(first).toBe(second)
  })

  it('does not throw', () => {
    const call = () => getNodeFsPromises()
    expect(call).not.toThrow()
  })
})
