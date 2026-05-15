/**
 * @fileoverview Tests for withEnv and withEnvSync — context-isolated env
 * overrides via AsyncLocalStorage. These exercise the isolated-overrides
 * branches of getEnvValue / hasOverride / isInEnv.
 */

import { describe, expect, it } from 'vitest'

import {
  getEnvValue,
  isInEnv,
  withEnv,
  withEnvSync,
} from '@socketsecurity/lib-stable/env/rewire'

describe('env/rewire — withEnv / withEnvSync', () => {
  describe('withEnvSync', () => {
    it('makes overrides visible only inside the callback', () => {
      const before = getEnvValue('SOCKET_REWIRE_PROBE')
      const inside = withEnvSync({ SOCKET_REWIRE_PROBE: 'inside' }, () =>
        getEnvValue('SOCKET_REWIRE_PROBE'),
      )
      const after = getEnvValue('SOCKET_REWIRE_PROBE')
      expect(inside).toBe('inside')
      expect(before).toBe(after)
    })

    it('isInEnv reports true inside the callback', () => {
      const seen = withEnvSync({ SOCKET_REWIRE_KEY: 'x' }, () =>
        isInEnv('SOCKET_REWIRE_KEY'),
      )
      expect(seen).toBe(true)
    })

    it('returns the callback return value', () => {
      const result = withEnvSync({}, () => 42)
      expect(result).toBe(42)
    })
  })

  describe('withEnv (async)', () => {
    it('makes overrides visible only inside the async callback', async () => {
      const inside = await withEnv(
        { SOCKET_ASYNC_PROBE: 'async-inside' },
        async () => getEnvValue('SOCKET_ASYNC_PROBE'),
      )
      expect(inside).toBe('async-inside')
      expect(getEnvValue('SOCKET_ASYNC_PROBE')).not.toBe('async-inside')
    })

    it('awaits the callback', async () => {
      const result = await withEnv({}, async () => 'returned')
      expect(result).toBe('returned')
    })

    it('isolated overrides take precedence over shared overrides', async () => {
      // Inside withEnv, the isolated override masks any shared override.
      const seen = await withEnv({ SOCKET_PRECEDENCE: 'isolated' }, async () =>
        getEnvValue('SOCKET_PRECEDENCE'),
      )
      expect(seen).toBe('isolated')
    })
  })
})
