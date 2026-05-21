import { describe, expect, test } from 'vitest'

import { getSynpPackageSpec } from '../../../../src/external-tools/synp/asset-names'

describe('external-tools/synp/asset-names', () => {
  test('getSynpPackageSpec builds an npm package spec', () => {
    expect(getSynpPackageSpec({ version: '1.9.14' })).toBe('synp@1.9.14')
  })

  test('interpolates any version verbatim (no v prefix, no transformation)', () => {
    expect(getSynpPackageSpec({ version: '2.0.0-beta.1' })).toBe(
      'synp@2.0.0-beta.1',
    )
  })

  test('handles empty version (degenerate but not blocked)', () => {
    expect(getSynpPackageSpec({ version: '' })).toBe('synp@')
  })
})
