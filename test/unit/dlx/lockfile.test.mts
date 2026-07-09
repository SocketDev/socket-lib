/**
 * @file Unit tests for dlx/lockfile: pure helpers `specName` and `specRange`,
 *   plus `resolveNpmPackagePin` option-validation and live-registry coverage.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MIN_RELEASE_DAYS,
  DlxLockfileError,
  resolveNpmPackagePin,
  specName,
  specRange,
} from '../../../src/dlx/lockfile'

import { tolerantTimeout } from '../../_shared/fleet/lib/timing.mts'

import { describeNetworkOnly } from '../util/skip-helpers'

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

describe('dlx/lockfile/resolveNpmPackagePin', () => {
  describe('option validation', () => {
    it('exposes DEFAULT_MIN_RELEASE_DAYS = 7', () => {
      expect(DEFAULT_MIN_RELEASE_DAYS).toBe(7)
    })

    it('throws DlxLockfileError when package spec is missing', async () => {
      await expect(
        // @ts-expect-error — intentionally missing required field.
        resolveNpmPackagePin({}),
      ).rejects.toThrow(DlxLockfileError)
    })

    it('throws DlxLockfileError when package spec is empty', async () => {
      await expect(resolveNpmPackagePin({ spec: '' })).rejects.toThrow(
        DlxLockfileError,
      )
    })

    it('throws when both minReleaseDays and minReleaseMins are set', async () => {
      await expect(
        resolveNpmPackagePin({
          minReleaseDays: 7,
          minReleaseMins: 1440,
          spec: 'is-odd@3.0.1',
        }),
      ).rejects.toThrow(/mutually exclusive/)
    })

    it('throws DlxLockfileError when package spec is a non-string', async () => {
      await expect(
        resolveNpmPackagePin({
          // @ts-expect-error — intentional invalid type.
          spec: 42,
        }),
      ).rejects.toThrow(DlxLockfileError)
    })
  })

  describeNetworkOnly('live registry (network)', () => {
    it(
      'returns pin details with both hash formats',
      async () => {
        const pin = await resolveNpmPackagePin({
          minReleaseDays: 0,
          spec: 'is-odd@3.0.1',
        })
        expect(pin.name).toBe('is-odd')
        expect(pin.version).toBe('3.0.1')
        expect(pin.hash.integrity).toMatch(/^sha512-[A-Za-z0-9+/=]+$/)
        expect(pin.hash.checksum).toMatch(/^[a-f0-9]{64}$/)
        expect(pin.packageJson).toContain('"is-odd": "3.0.1"')
        const lock = JSON.parse(pin.lockfile)
        expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2)
        expect(lock.packages).toBeTypeOf('object')
      },
      tolerantTimeout(60_000),
    )

    it(
      'applies default min-release-age of 7 days when no option is provided',
      async () => {
        // is-odd@3.0.1 was published in 2018 — easily older than 7 days.
        const pin = await resolveNpmPackagePin({ spec: 'is-odd@3.0.1' })
        expect(pin.version).toBe('3.0.1')
      },
      tolerantTimeout(60_000),
    )

    it(
      'respects minReleaseMins path (pnpm-style unit)',
      async () => {
        const pin = await resolveNpmPackagePin({
          minReleaseMins: 10_080,
          spec: 'is-odd@3.0.1',
        })
        expect(pin.version).toBe('3.0.1')
      },
      tolerantTimeout(60_000),
    )
  })
})
