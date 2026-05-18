/**
 * @file Unit tests for parse-manifest dispatcher.
 */

import { describe, expect, it } from 'vitest'

import { ManifestError } from '@socketsecurity/lib/eco/manifest/manifest-error'
import { parseManifest } from '@socketsecurity/lib/eco/manifest/parse-manifest'

describe('eco/manifest/parse-manifest', () => {
  it('routes npm to parsePackageJson', () => {
    const result = parseManifest(
      JSON.stringify({ name: 'foo', version: '1.0.0' }),
      'npm',
    )
    expect(result.type).toBe('manifest')
    expect(result.name).toBe('foo')
  })

  it('throws ManifestError(ERR_UNSUPPORTED) for unknown ecosystems', () => {
    try {
      parseManifest('{}', 'composer' as 'npm')
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ManifestError)
      expect((e as ManifestError).code).toBe('ERR_UNSUPPORTED')
    }
  })
})
