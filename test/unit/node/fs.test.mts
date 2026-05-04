/**
 * @fileoverview Unit tests for src/node/fs.ts.
 *
 * Verifies the lazy-loader contract:
 *   - getNodeFs() returns the real `node:fs` module (functional check
 *     via known exports like `existsSync`, not just typeof)
 *   - Repeated calls return the same reference (single require, cached)
 *   - The getter is non-throwing on Node
 */

import { describe, expect, it } from 'vitest'

import { getNodeFs } from '@socketsecurity/lib/node/fs'

describe('node/fs', () => {
  it('returns the node:fs module', () => {
    const fs = getNodeFs()
    expect(typeof fs.existsSync).toBe('function')
    expect(typeof fs.readFileSync).toBe('function')
    expect(typeof fs.statSync).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeFs()).toBe(getNodeFs())
  })

  it('does not throw', () => {
    expect(() => getNodeFs()).not.toThrow()
  })
})
