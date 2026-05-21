import { describe, expect, test } from 'vitest'

import {
  janusFromVfs,
  JANUS_VFS_KEY,
} from '../../../../src/external-tools/janus/from-vfs'

describe.sequential('external-tools/janus/from-vfs', () => {
  test('exports JANUS_VFS_KEY constant', () => {
    expect(JANUS_VFS_KEY).toBe('janus')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    // The host running this test is regular Node, not the smol binary; the
    // VFS lookup returns undefined and the helper short-circuits.
    expect(await janusFromVfs()).toBeUndefined()
  })
})
