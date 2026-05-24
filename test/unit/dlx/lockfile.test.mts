/**
 * @file Unit tests for dlx/lockfile.ts pure helpers `specName` and `specRange`.
 *   The orchestrator `generatePackagePin` hits the registry via pacote and is
 *   covered separately in generate-package-pin.test.mts.
 */

import { describe, expect, it } from 'vitest'

import { specName, specRange } from '../../../src/dlx/lockfile'

describe.sequential('dlx/lockfile — specName', () => {
  it('returns the name from a versioned spec', () => {
    expect(specName('lodash@4.17.21')).toBe('lodash')
  })

  it('returns the name from a scoped versioned spec', () => {
    expect(specName('@socketsecurity/cli@1.0.0')).toBe('@socketsecurity/cli')
  })

  it('returns the bare spec when no version separator is present', () => {
    expect(specName('lodash')).toBe('lodash')
  })

  it('returns the bare spec for a scoped name with no version', () => {
    expect(specName('@scope/pkg')).toBe('@scope/pkg')
  })

  it('returns empty string for empty input', () => {
    expect(specName('')).toBe('')
  })

  it('preserves the @ when the only @ is at position 0 (scoped, no version)', () => {
    // lastIndexOf('@') === 0 → atIdx <= 0 → return spec verbatim.
    expect(specName('@org/leaf')).toBe('@org/leaf')
  })
})

describe.sequential('dlx/lockfile — specRange', () => {
  it('returns the range from a versioned spec', () => {
    expect(specRange('lodash@4.17.21')).toBe('4.17.21')
  })

  it('returns the range from a scoped versioned spec', () => {
    expect(specRange('@socketsecurity/cli@^1.0.0')).toBe('^1.0.0')
  })

  it('returns "latest" when no version separator is present', () => {
    expect(specRange('lodash')).toBe('latest')
  })

  it('returns "latest" for a scoped name with no version', () => {
    expect(specRange('@scope/pkg')).toBe('latest')
  })

  it('returns "latest" when the range slice is empty (trailing @)', () => {
    expect(specRange('lodash@')).toBe('latest')
  })

  it('handles a tag range like "next"', () => {
    expect(specRange('lodash@next')).toBe('next')
  })
})
