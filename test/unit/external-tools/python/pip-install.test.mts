import { describe, expect, test } from 'vitest'

import { pipTargetDir } from '../../../../src/external-tools/python/pip-install'

describe('external-tools/python/pip-install — pipTargetDir', () => {
  test('lands under _dlx/<cacheKey>/site-packages', () => {
    const dir = pipTargetDir('git+https://github.com/NVIDIA/skillspector.git@abc1234')
    const norm = dir.replace(/\\/g, '/')
    expect(norm).toMatch(/\/_dlx\/[a-f0-9]{16}\/site-packages$/)
  })

  test('is deterministic per spec and differs across specs', () => {
    const a = pipTargetDir('skillspector==1.0.0')
    const b = pipTargetDir('skillspector==1.0.0')
    const c = pipTargetDir('skillspector==2.0.0')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
