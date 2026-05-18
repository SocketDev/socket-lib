/**
 * @file Unit tests for parse-yarn-descriptor.ts.
 */

import { describe, expect, it } from 'vitest'

import { parseYarnDescriptor } from '@socketsecurity/lib/eco/npm/yarnpkg/yarn/parse-yarn-descriptor'

describe('eco/npm/yarnpkg/yarn/parse-yarn-descriptor', () => {
  it('handles a classic spec', () => {
    expect(parseYarnDescriptor('lodash@^4.17.0')).toEqual({ name: 'lodash' })
  })

  it('handles a scoped classic spec', () => {
    expect(parseYarnDescriptor('@scope/pkg@^1.0.0')).toEqual({
      name: '@scope/pkg',
    })
  })

  it('handles a Berry npm: spec', () => {
    expect(parseYarnDescriptor('lodash@npm:^4.17.0')).toEqual({
      name: 'lodash',
    })
  })

  it('handles a Berry workspace: spec', () => {
    expect(parseYarnDescriptor('my-pkg@workspace:packages/my-pkg')).toEqual({
      name: 'my-pkg',
    })
  })

  it('handles a Berry patch: spec', () => {
    expect(
      parseYarnDescriptor(
        'patch:lodash@npm:4.17.21#~/.yarn/patches/lodash.patch',
      ),
    ).toEqual({ name: 'lodash' })
  })

  it('handles a Berry patch: spec with encoded @npm%3A', () => {
    expect(
      parseYarnDescriptor(
        'patch:lodash@npm%3A4.17.21#~/.yarn/patches/lodash.patch',
      ),
    ).toEqual({ name: 'lodash' })
  })

  it('handles a Berry patch: spec with workspace target', () => {
    expect(
      parseYarnDescriptor('patch:my-pkg@workspace:packages/my-pkg#some.patch'),
    ).toEqual({ name: 'my-pkg' })
  })

  it('handles a descriptor without @', () => {
    expect(parseYarnDescriptor('plainname')).toEqual({ name: 'plainname' })
  })
})
