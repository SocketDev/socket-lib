/**
 * @file Unit tests for sbtFromVfs().
 */

import { describe, expect, it } from 'vitest'

import {
  SBT_VFS_KEY,
  sbtFromVfs,
} from '../../../../src/external-tools/sbt/from-vfs'

describe('external-tools/sbt/from-vfs', () => {
  it('returns undefined on stock Node (no node:smol-vfs)', async () => {
    expect(await sbtFromVfs()).toBe(undefined)
  })

  it('exports the canonical VFS path constant', () => {
    expect(SBT_VFS_KEY).toBe('sbt-launch.jar')
  })
})
