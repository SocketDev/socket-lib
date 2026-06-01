import { describe, expect, test } from 'vitest'

import {
  SYNP_VFS_KEY,
  synpFromVfs,
} from '../../../../src/external-tools/synp/from-vfs'

describe.sequential('external-tools/synp/from-vfs', () => {
  test('exports SYNP_VFS_KEY constant', () => {
    expect(SYNP_VFS_KEY).toBe('synp')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    expect(await synpFromVfs()).toBeUndefined()
  })
})
