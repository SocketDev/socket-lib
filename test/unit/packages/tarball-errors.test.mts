// Rejection paths for extract/pack, split out of tarball.test.mts.
//
// These need no registry, no fixtures and no temp dirs - they only assert that
// a bad spec or a missing path rejects. Keeping them beside the offline-mocked
// extract/pack suite meant one file carried two unrelated setups, and it sat
// on the 500-line cap; the extension migration was the push that made the
// split worth doing rather than another line of deferral.

import { describe, expect, it } from 'vitest'

import { extractPackage, packPackage } from '../../../src/packages/tarball.mjs'
import { tolerantTimeout } from '../../_shared/fleet/lib/timing.mts'

describe('packages/tarball — error handling', () => {
  it(
    'should handle extractPackage with invalid spec',
    async () => {
      await expect(
        extractPackage('non-existent-package-xyz-123', { dest: '/tmp/test' }),
      ).rejects.toThrow()
    },
    tolerantTimeout(30_000),
  )

  it(
    'should handle packPackage with invalid path',
    async () => {
      await expect(packPackage('/non/existent/path')).rejects.toThrow()
    },
    tolerantTimeout(30_000),
  )

  it(
    'packPackage rejects for non-existent directory',
    async () => {
      await expect(packPackage('/non/existent')).rejects.toThrow()
    },
    tolerantTimeout(30_000),
  )

  it(
    'extractPackage rejects for invalid spec',
    async () => {
      await expect(
        extractPackage('invalid-spec-xyz', { dest: '/tmp/test' }),
      ).rejects.toThrow()
    },
    tolerantTimeout(30_000),
  )
})
