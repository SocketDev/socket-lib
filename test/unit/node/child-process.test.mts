/**
 * @fileoverview Unit tests for src/node/child-process.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeChildProcess } from '@socketsecurity/lib/node/child-process'

describe('node/child-process', () => {
  it('returns the node:child_process module', () => {
    const cp = getNodeChildProcess()
    expect(typeof cp.spawn).toBe('function')
    expect(typeof cp.spawnSync).toBe('function')
    expect(typeof cp.exec).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeChildProcess()).toBe(getNodeChildProcess())
  })

  it('does not throw', () => {
    expect(() => getNodeChildProcess()).not.toThrow()
  })
})
