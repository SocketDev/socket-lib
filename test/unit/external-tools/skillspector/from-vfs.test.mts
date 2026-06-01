import { describe, expect, test } from 'vitest'

import {
  skillspectorFromVfs,
  SKILLSPECTOR_VFS_KEY,
} from '../../../../src/external-tools/skillspector/from-vfs'

describe.sequential('external-tools/skillspector/from-vfs', () => {
  test('exports SKILLSPECTOR_VFS_KEY constant', () => {
    expect(SKILLSPECTOR_VFS_KEY).toBe('skillspector')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    expect(await skillspectorFromVfs()).toBeUndefined()
  })
})
