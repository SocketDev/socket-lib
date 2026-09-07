import { describe, expect, test } from 'vitest'

import {
  TRIVY_VFS_KEY,
  trivyFromVfs,
} from '../../../../src/external-tools/trivy/from-vfs.mjs'

describe('external-tools/trivy/from-vfs', { concurrent: false }, () => {
  test('exports TRIVY_VFS_KEY constant', () => {
    expect(TRIVY_VFS_KEY).toBe('trivy')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    expect(await trivyFromVfs()).toBeUndefined()
  })
})
