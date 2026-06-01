/**
 * @file Unit tests for src/node/child-process.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeChildProcess } from '../../../src/node/child-process'

describe('node/child-process', () => {
  it('returns the node:child_process module', () => {
    const cp = getNodeChildProcess()
    expect(typeof cp.spawn).toBe('function')
    expect(typeof cp.spawnSync).toBe('function')
    expect(typeof cp.exec).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    const first = getNodeChildProcess()
    const second = getNodeChildProcess()
    expect(first).toBe(second)
  })

  it('does not throw', () => {
    const call = () => getNodeChildProcess()
    expect(call).not.toThrow()
  })
})
