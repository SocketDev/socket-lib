import { describe, expect, test } from 'vitest'

import {
  TRUFFLEHOG_VFS_KEY,
  trufflehogFromVfs,
} from '../../../../src/external-tools/trufflehog/from-vfs.mjs'

describe('external-tools/trufflehog/from-vfs', { concurrent: false }, () => {
  test('exports TRUFFLEHOG_VFS_KEY constant', () => {
    expect(TRUFFLEHOG_VFS_KEY).toBe('trufflehog')
  })

  test('returns undefined when running outside the smol Node binary', async () => {
    expect(await trufflehogFromVfs()).toBeUndefined()
  })
})
