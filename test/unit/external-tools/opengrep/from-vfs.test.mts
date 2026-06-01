import { describe, expect, test } from 'vitest'

import {
  OPENGREP_VFS_KEY,
  opengrepFromVfs,
} from '../../../../src/external-tools/opengrep/from-vfs'

describe.sequential('external-tools/opengrep/from-vfs', () => {
  test('exports OPENGREP_VFS_KEY constant', () => {
    expect(OPENGREP_VFS_KEY).toBe('opengrep')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    expect(await opengrepFromVfs()).toBeUndefined()
  })
})
