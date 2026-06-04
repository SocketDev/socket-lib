/**
 * @file Unit tests for resolveNpmPackagePin. Option-validation tests run
 *   offline. The live registry test behind SOCKET_LIB_SKIP_NETWORK_TESTS=1
 *   exercises the full pin generation flow against the real npm registry.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MIN_RELEASE_DAYS,
  DlxLockfileError,
  resolveNpmPackagePin,
} from '../../../src/dlx/lockfile'

import { describeNetworkOnly } from '../util/skip-helpers'

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
    it('returns pin details with both hash formats', async () => {
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
    }, 60_000)

    it('applies default min-release-age of 7 days when no option is provided', async () => {
      // is-odd@3.0.1 was published in 2018 — easily older than 7 days.
      const pin = await resolveNpmPackagePin({ spec: 'is-odd@3.0.1' })
      expect(pin.version).toBe('3.0.1')
    }, 60_000)

    it('respects minReleaseMins path (pnpm-style unit)', async () => {
      const pin = await resolveNpmPackagePin({
        minReleaseMins: 10_080,
        spec: 'is-odd@3.0.1',
      })
      expect(pin.version).toBe('3.0.1')
    }, 60_000)
  })
})
