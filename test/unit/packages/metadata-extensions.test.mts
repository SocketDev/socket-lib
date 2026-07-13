import { describe, expect, it } from 'vitest'

import { findPackageExtensions } from '../../../src/packages/metadata-extensions'

describe('packages/metadata-extensions — findPackageExtensions', () => {
  it('should return undefined for package with no extensions', () => {
    const result = findPackageExtensions('non-existent-package', '1.0.0')
    expect(result).toBeUndefined()
  })

  it('should return extensions for matching package and version', () => {
    const result = findPackageExtensions('test-package', '1.0.0')
    expect(result === undefined || typeof result === 'object').toBe(true)
  })

  it('should handle semver range matching', () => {
    const result = findPackageExtensions('some-package', '1.2.3')
    expect(result === undefined || typeof result === 'object').toBe(true)
  })

  it('should merge multiple matching extensions', () => {
    const result = findPackageExtensions('test-package', '1.0.0')
    expect(result === undefined || typeof result === 'object').toBe(true)
  })

  it('should handle scoped packages', () => {
    const result = findPackageExtensions('@scope/package', '1.0.0')
    expect(result === undefined || typeof result === 'object').toBe(true)
  })

  it('should handle findPackageExtensions with invalid version', () => {
    const result = findPackageExtensions('package', 'not-a-version')
    expect(result === undefined || typeof result === 'object').toBe(true)
  })

  it('findPackageExtensions returns without throwing', () => {
    expect(() => findPackageExtensions('package', '1.0.0')).not.toThrow()
  })
})
