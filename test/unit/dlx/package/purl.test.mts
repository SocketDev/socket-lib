/**
 * @file Unit tests for src/dlx/package — purl surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

import { npmPurl } from '../../../../src/dlx/package'

describe('npmPurl', () => {
  // Canonical PURL outputs verified against @socketregistry/packageurl-js

  it('should build PURL for unscoped package', () => {
    expect(npmPurl('lodash', '4.17.21')).toBe('pkg:npm/lodash@4.17.21')
  })

  it('should build PURL for scoped package', () => {
    expect(npmPurl('@babel/core', '7.0.0')).toBe('pkg:npm/%40babel/core@7.0.0')
  })

  it('should encode @ as %40 for scoped packages', () => {
    const purl = npmPurl('@socketsecurity/lib', '5.17.0')
    expect(purl).toBe('pkg:npm/%40socketsecurity/lib@5.17.0')
    expect(purl).not.toContain('@socketsecurity')
    expect(purl).toContain('%40socketsecurity')
  })

  it('should leave / literal in scoped package namespace', () => {
    const purl = npmPurl('@types/node', '20.0.0')
    expect(purl).toBe('pkg:npm/%40types/node@20.0.0')
    expect(purl).not.toContain('%2F')
  })

  it('should handle simple package names without encoding', () => {
    expect(npmPurl('ecc-agentshield', '1.4.0')).toBe(
      'pkg:npm/ecc-agentshield@1.4.0',
    )
  })

  it('should handle single-char package names', () => {
    expect(npmPurl('x', '1.0.0')).toBe('pkg:npm/x@1.0.0')
  })

  it('should handle single-char scoped packages', () => {
    expect(npmPurl('@a/b', '0.0.0')).toBe('pkg:npm/%40a/b@0.0.0')
  })

  it('should handle names with dashes', () => {
    expect(npmPurl('@scope/name-with-dashes', '2.3.4')).toBe(
      'pkg:npm/%40scope/name-with-dashes@2.3.4',
    )
    expect(npmPurl('my-pkg', '0.0.1')).toBe('pkg:npm/my-pkg@0.0.1')
  })

  it('should handle prerelease versions', () => {
    expect(npmPurl('foo', '1.0.0-beta.1')).toBe('pkg:npm/foo@1.0.0-beta.1')
    expect(npmPurl('foo', '0.0.1-alpha')).toBe('pkg:npm/foo@0.0.1-alpha')
  })

  it('should encode + in version as %2B per PURL spec', () => {
    // PURL spec requires + to be percent-encoded in the version segment
    expect(npmPurl('foo', '1.0.0-rc.0+build.123')).toBe(
      'pkg:npm/foo@1.0.0-rc.0%2Bbuild.123',
    )
  })

  it('should not encode + when absent from version', () => {
    const purl = npmPurl('foo', '1.0.0')
    expect(purl).not.toContain('%2B')
  })

  it('should always start with pkg:npm/', () => {
    expect(npmPurl('foo', '1.0.0')).toMatch(/^pkg:npm\//)
    expect(npmPurl('@bar/baz', '2.0.0')).toMatch(/^pkg:npm\//)
  })

  it('should always end with @version', () => {
    expect(npmPurl('foo', '1.2.3')).toMatch(/@1\.2\.3$/)
    expect(npmPurl('@scope/pkg', '0.0.1')).toMatch(/@0\.0\.1$/)
  })

  it('should produce URL-encodable PURLs for firewall API', () => {
    const purl = npmPurl('@babel/core', '7.0.0')
    const encoded = encodeURIComponent(purl)
    // encodeURIComponent double-encodes: %40 → %2540, / → %2F, : → %3A
    expect(encoded).toContain('pkg%3Anpm')
    expect(encoded).toContain('%2540babel')
  })

  it('should match canonical packageurl-js output', () => {
    // These expected values were verified against
    // @socketregistry/packageurl-js PackageURL.toString()
    const cases: Array<[string, string, string]> = [
      ['lodash', '4.17.21', 'pkg:npm/lodash@4.17.21'],
      ['@babel/core', '7.0.0', 'pkg:npm/%40babel/core@7.0.0'],
      ['@types/node', '20.0.0', 'pkg:npm/%40types/node@20.0.0'],
      ['ecc-agentshield', '1.4.0', 'pkg:npm/ecc-agentshield@1.4.0'],
      ['@socketsecurity/lib', '5.17.0', 'pkg:npm/%40socketsecurity/lib@5.17.0'],
      ['x', '1.0.0', 'pkg:npm/x@1.0.0'],
      ['@a/b', '0.0.0', 'pkg:npm/%40a/b@0.0.0'],
      ['foo', '1.0.0-rc.0+build.123', 'pkg:npm/foo@1.0.0-rc.0%2Bbuild.123'],
    ]
    for (const [name, version, expected] of cases) {
      expect(npmPurl(name, version)).toBe(expected)
    }
  })
})
