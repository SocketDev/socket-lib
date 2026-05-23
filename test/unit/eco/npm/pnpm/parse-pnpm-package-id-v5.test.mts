/**
 * @file Unit tests for parse-pnpm-package-id-v5.ts.
 */

import { describe, expect, it } from 'vitest'

import { parsePnpmPackageIdV5 } from '../../../../../src/eco/npm/pnpm/parse-pnpm-package-id-v5'

describe('eco/npm/pnpm/parse-pnpm-package-id-v5', () => {
  it('parses an unscoped /name/version', () => {
    expect(parsePnpmPackageIdV5('/lodash/4.17.21')).toEqual({
      name: 'lodash',
      version: '4.17.21',
    })
  })

  it('parses a scoped /@scope/name/version', () => {
    expect(parsePnpmPackageIdV5('/@babel/core/7.23.0')).toEqual({
      name: '@babel/core',
      version: '7.23.0',
    })
  })

  it('strips a peer-dep suffix after underscore', () => {
    expect(parsePnpmPackageIdV5('/foo/1.0.0_peer-1.2.3')).toEqual({
      name: 'foo',
      version: '1.0.0',
    })
  })

  it('handles inputs without a leading slash', () => {
    expect(parsePnpmPackageIdV5('lodash/4.17.21')).toEqual({
      name: 'lodash',
      version: '4.17.21',
    })
  })

  it('defaults version to "0.0.0" when missing', () => {
    expect(parsePnpmPackageIdV5('/loner')).toEqual({
      name: 'loner',
      version: '0.0.0',
    })
  })

  it('handles a single-segment scoped name fallback', () => {
    expect(parsePnpmPackageIdV5('/@scope')).toEqual({
      name: '@scope',
      version: '0.0.0',
    })
  })
})
