/**
 * @fileoverview Unit tests for bazelFromVfs().
 */

import { describe, expect, it } from 'vitest'

import {
  BAZEL_VFS_KEY,
  bazelFromVfs,
} from '@socketsecurity/lib-stable/external-tools/bazel/from-vfs'

describe('external-tools/bazel/from-vfs', () => {
  it('returns undefined on stock Node (no node:smol-vfs)', async () => {
    expect(await bazelFromVfs()).toBe(undefined)
  })

  it('exports the canonical VFS path constant', () => {
    expect(BAZEL_VFS_KEY).toBe('bazel')
  })
})
