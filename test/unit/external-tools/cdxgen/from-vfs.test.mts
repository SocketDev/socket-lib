import { describe, expect, test } from 'vitest'

import {
  cdxgenFromVfs,
  CDXGEN_VFS_KEY,
} from '../../../../src/external-tools/cdxgen/from-vfs'

describe.sequential('external-tools/cdxgen/from-vfs', () => {
  test('exports CDXGEN_VFS_KEY constant', () => {
    expect(CDXGEN_VFS_KEY).toBe('cdxgen')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    expect(await cdxgenFromVfs()).toBeUndefined()
  })
})
