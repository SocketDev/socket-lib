import { describe, expect, test } from 'vitest'

import {
  uvFromVfs,
  UV_VFS_KEY,
} from '../../../../src/external-tools/uv/from-vfs'

describe.sequential('external-tools/uv/from-vfs', () => {
  test('exports UV_VFS_KEY constant', () => {
    expect(UV_VFS_KEY).toBe('uv')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    expect(await uvFromVfs()).toBeUndefined()
  })
})
