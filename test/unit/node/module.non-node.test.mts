/**
 * @file Coverage for the browser / non-Node guards in src/node/module.ts.
 *   IS_NODE is mocked false so the early-return branches run (no `require`,
 *   no node: built-ins). Kept in its own file because the mock is module-wide.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  getNodeModule,
  isNodeBuiltin,
  requireBuiltin,
} from '../../../src/node/module'

vi.mock(import('../../../src/constants/runtime'), () => ({ IS_NODE: false }))

describe('node/module (non-Node runtime)', () => {
  it('getNodeModule returns undefined when node:module is unavailable', () => {
    expect(getNodeModule()).toBeUndefined()
  })

  it('isNodeBuiltin returns false (no built-ins off Node)', () => {
    expect(isNodeBuiltin('node:fs')).toBe(false)
    expect(isNodeBuiltin('node:smol-util')).toBe(false)
  })

  it('requireBuiltin returns undefined without loading anything', () => {
    expect(requireBuiltin('node:fs')).toBeUndefined()
    expect(requireBuiltin('node:smol-util')).toBeUndefined()
  })
})
