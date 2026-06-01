import { describe, expect, test } from 'vitest'

import {
  TRIVY_VFS_KEY,
  trivyFromVfs,
} from '../../../../src/external-tools/trivy/from-vfs'

describe.sequential('external-tools/trivy/from-vfs', () => {
  test('exports TRIVY_VFS_KEY constant', () => {
    expect(TRIVY_VFS_KEY).toBe('trivy')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    expect(await trivyFromVfs()).toBeUndefined()
  })
})
