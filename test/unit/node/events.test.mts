/**
 * @fileoverview Unit tests for src/node/events.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeEvents } from '@socketsecurity/lib/node/events'

describe('node/events', () => {
  it('returns the node:events module', () => {
    const events = getNodeEvents()
    expect(typeof events.EventEmitter).toBe('function')
    // `events.once` exists at runtime but isn't always on the
    // namespace TS type; check via `defaultMaxListeners` which IS
    // in @types/node.
    expect(typeof events.defaultMaxListeners).toBe('number')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeEvents()).toBe(getNodeEvents())
  })

  it('does not throw', () => {
    expect(() => getNodeEvents()).not.toThrow()
  })
})
