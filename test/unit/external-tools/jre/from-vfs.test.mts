/**
 * @file Unit tests for jreFromVfs(). On stock Node, `getSmolVfs()` returns
 *   `undefined`, so `jreFromVfs()` must return `undefined` without throwing.
 *   The smol-binary path is covered by socket-btm's integration tests.
 */

import { describe, expect, it } from 'vitest'

import {
  JRE_VFS_KEY,
  jreFromVfs,
} from '@socketsecurity/lib/external-tools/jre/from-vfs'

describe('external-tools/jre/from-vfs', () => {
  it('returns undefined on stock Node (no node:smol-vfs)', async () => {
    expect(await jreFromVfs()).toBe(undefined)
  })

  it('exports the canonical VFS path constant', () => {
    expect(JRE_VFS_KEY).toBe('jre')
  })

  it('does not throw when no VFS is available', async () => {
    await expect(jreFromVfs()).resolves.toBe(undefined)
  })
})
