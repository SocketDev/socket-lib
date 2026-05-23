/**
 * @file Unit tests for parse-pnpm-package-id-v6-v9.ts.
 */

import { describe, expect, it } from 'vitest'

import { parsePnpmPackageIdV6V9 } from '../../../../../src/eco/npm/pnpm/parse-pnpm-package-id-v6-v9'

describe('eco/npm/pnpm/parse-pnpm-package-id-v6-v9', () => {
  it('parses an unscoped name@version', () => {
    expect(parsePnpmPackageIdV6V9('lodash@4.17.21')).toEqual({
      name: 'lodash',
      version: '4.17.21',
    })
  })

  it('parses a scoped @scope/name@version', () => {
    expect(parsePnpmPackageIdV6V9('@babel/core@7.23.0')).toEqual({
      name: '@babel/core',
      version: '7.23.0',
    })
  })

  it('strips a peer-dep paren suffix', () => {
    expect(parsePnpmPackageIdV6V9('foo@1.0.0(bar@2.0.0)')).toEqual({
      name: 'foo',
      version: '1.0.0',
    })
  })

  it('defaults to "0.0.0" when there is no @ separator', () => {
    expect(parsePnpmPackageIdV6V9('plainname')).toEqual({
      name: 'plainname',
      version: '0.0.0',
    })
  })

  it('falls back when a scoped pkg has no version', () => {
    expect(parsePnpmPackageIdV6V9('@scope/pkg')).toEqual({
      name: '@scope/pkg',
      version: '0.0.0',
    })
  })
})
