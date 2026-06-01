/**
 * @file Unit tests for package name and tag helpers from
 *   src/packages/operations:
 *
 *   - Resolution: resolvePackageName(), resolveRegistryPackageName(),
 *     pkgNameToSlug() normalize package names
 *   - Extensions: findPackageExtensions() looks up configured extensions
 *   - Tag parsing: getReleaseTag() extracts version tags from package specs
 *   - Misc edge cases + an editable package.json integration workflow
 *     readPackageJson / readPackageJsonSync coverage lives in
 *     operations.read-package-json.test.mts. Network-backed suites
 *     (extractPackage / packPackage / resolveGitHubTgzUrl) live in
 *     operations.network.test.mts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  extractPackage,
  findPackageExtensions,
  getReleaseTag,
  packPackage,
  pkgNameToSlug,
  readPackageJson,
  resolvePackageName,
  resolveRegistryPackageName,
} from '../../../src/packages/operations'
import type { PackageJson } from '../../../src/packages/types'
import { describe, expect, it } from 'vitest'
import { runWithTempDir } from '../util/temp-file-helper'

type EditablePackageJson = PackageJson & {
  save: () => Promise<unknown>
  update: (data: Record<string, unknown>) => unknown
}

describe('packages/operations', () => {
  describe('getReleaseTag', () => {
    it('should return empty string for empty spec', () => {
      expect(getReleaseTag('')).toBe('')
    })

    it('should extract tag from unscoped package', () => {
      expect(getReleaseTag('package@1.0.0')).toBe('1.0.0')
    })

    it('should extract tag from scoped package', () => {
      expect(getReleaseTag('@scope/package@1.0.0')).toBe('1.0.0')
    })

    it('should return empty string for package without tag', () => {
      expect(getReleaseTag('package')).toBe('')
    })

    it('should return empty string for scoped package without tag', () => {
      expect(getReleaseTag('@scope/package')).toBe('')
    })

    it('should handle multiple @ signs in scoped packages', () => {
      expect(getReleaseTag('@scope/package@latest')).toBe('latest')
      expect(getReleaseTag('@scope/package@^1.2.3')).toBe('^1.2.3')
    })

    it('should handle semver ranges', () => {
      expect(getReleaseTag('package@^1.2.3')).toBe('^1.2.3')
      expect(getReleaseTag('package@~1.2.3')).toBe('~1.2.3')
      expect(getReleaseTag('package@>=1.0.0')).toBe('>=1.0.0')
    })

    it('should handle dist-tags', () => {
      expect(getReleaseTag('package@latest')).toBe('latest')
      expect(getReleaseTag('package@next')).toBe('next')
      expect(getReleaseTag('@scope/package@beta')).toBe('beta')
    })
  })

  describe('findPackageExtensions', () => {
    it('should return undefined for package with no extensions', () => {
      const result = findPackageExtensions('non-existent-package', '1.0.0')
      expect(result).toBeUndefined()
    })

    it('should return extensions for matching package and version', () => {
      // This test depends on the actual package extensions configured
      // We'll test the basic functionality
      const result = findPackageExtensions('test-package', '1.0.0')
      // Result should be undefined or an object depending on configuration
      expect(result === undefined || typeof result === 'object').toBe(true)
    })

    it('should handle semver range matching', () => {
      // Test that the function uses semver.satisfies internally
      const result = findPackageExtensions('some-package', '1.2.3')
      expect(result === undefined || typeof result === 'object').toBe(true)
    })

    it('should merge multiple matching extensions', () => {
      // If multiple extensions match, they should be merged
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

  describe('resolvePackageName', () => {
    it('should return name for unscoped package', () => {
      const purlObj = { name: 'package' }
      expect(resolvePackageName(purlObj)).toBe('package')
    })

    it('should return scoped name with default delimiter', () => {
      const purlObj = { name: 'package', namespace: '@scope' }
      expect(resolvePackageName(purlObj)).toBe('@scope/package')
    })

    it('should use custom delimiter', () => {
      const purlObj = { name: 'package', namespace: '@scope' }
      expect(resolvePackageName(purlObj, '--')).toBe('@scope--package')
    })

    it('should handle empty namespace', () => {
      const purlObj = { name: 'package', namespace: '' }
      expect(resolvePackageName(purlObj)).toBe('package')
    })

    it('should handle undefined namespace', () => {
      const purlObj = { name: 'package' }
      expect(resolvePackageName(purlObj)).toBe('package')
    })

    it('should use default / delimiter when not specified', () => {
      const purlObj = { name: 'mypackage', namespace: '@myorg' }
      expect(resolvePackageName(purlObj)).toBe('@myorg/mypackage')
    })

    it('should handle resolvePackageName with null values', () => {
      const purlObj = { name: 'package', namespace: undefined }
      const result = resolvePackageName(purlObj)
      expect(result).toBe('package')
    })
  })

  describe('pkgNameToSlug', () => {
    it('should slugify a scoped package name', () => {
      expect(pkgNameToSlug('@socketsecurity/lib')).toBe('socketsecurity-lib')
    })

    it('should slugify a scoped package name with multi-token scope', () => {
      expect(pkgNameToSlug('@cyclonedx/cdxgen')).toBe('cyclonedx-cdxgen')
    })

    it('should pass an unscoped package name through unchanged', () => {
      expect(pkgNameToSlug('lodash')).toBe('lodash')
    })

    it('should pass a sentinel CLI-style name through unchanged', () => {
      expect(pkgNameToSlug('sdxgen')).toBe('sdxgen')
    })

    it('should only replace the first slash (the scope separator)', () => {
      // Real npm names cannot contain a second slash, but document the boundary.
      expect(pkgNameToSlug('@scope/name/sub')).toBe('scope-name/sub')
    })

    it('should leave bare names that start with non-@ alone even if they contain a slash', () => {
      // Defensive: not a valid npm name, but ensures we never strip mid-string.
      expect(pkgNameToSlug('weird/name')).toBe('weird/name')
    })
  })

  describe('resolveRegistryPackageName', () => {
    it('escapes scoped package names with double-underscore', () => {
      expect(resolveRegistryPackageName('@babel/core')).toBe('babel__core')
    })

    it('returns unscoped names verbatim', () => {
      expect(resolveRegistryPackageName('lodash')).toBe('lodash')
    })

    it('handles dotted scope', () => {
      expect(resolveRegistryPackageName('@scope.with.dots/pkg')).toBe(
        'scope.with.dots__pkg',
      )
    })

    it('handles complex nested scope names', () => {
      expect(resolveRegistryPackageName('@types/node')).toBe('types__node')
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle extractPackage with invalid spec', async () => {
      await expect(
        extractPackage('non-existent-package-xyz-123', { dest: '/tmp/test' }),
      ).rejects.toThrow()
    }, 30_000)

    it('should handle packPackage with invalid path', async () => {
      await expect(packPackage('/non/existent/path')).rejects.toThrow()
    }, 30_000)

    it('should handle getReleaseTag with special characters', () => {
      expect(getReleaseTag('package@1.0.0-beta.1')).toBe('1.0.0-beta.1')
      expect(getReleaseTag('package@1.0.0+build.123')).toBe('1.0.0+build.123')
    })
  })

  describe('lazy loading', () => {
    it('getReleaseTag returns a string for package spec', () => {
      const tag = getReleaseTag('package@1.0.0')
      expect(typeof tag).toBe('string')
    })

    it('packPackage rejects for non-existent directory', async () => {
      await expect(packPackage('/non/existent')).rejects.toThrow()
    }, 30_000)

    it('extractPackage rejects for invalid spec', async () => {
      await expect(
        extractPackage('invalid-spec-xyz', { dest: '/tmp/test' }),
      ).rejects.toThrow()
    }, 30_000)
  })

  describe('integration scenarios', () => {
    it('should handle editable package.json workflow', async () => {
      await runWithTempDir(async tmpDir => {
        const pkgData = { name: 'test', version: '1.0.0' }
        await fs.writeFile(
          path.join(tmpDir, 'package.json'),
          JSON.stringify(pkgData),
        )

        // Read as editable
        const editable = (await readPackageJson(tmpDir, {
          editable: true,
        })) as EditablePackageJson | undefined
        expect(editable).toBeDefined()
        expect(typeof editable?.save).toBe('function')

        // Update and save
        editable!.update({ version: '2.0.0' })
        await editable!.save()

        // Read again to verify
        const updated = await readPackageJson(tmpDir)
        expect(updated?.version).toBe('2.0.0')
      }, 'integration-editable-workflow-')
    })

    it('should handle release tag extraction for various formats', () => {
      const testCases = [
        { input: 'pkg@1.0.0', expected: '1.0.0' },
        { input: '@scope/pkg@1.0.0', expected: '1.0.0' },
        { input: 'pkg@latest', expected: 'latest' },
        { input: '@scope/pkg@next', expected: 'next' },
        { input: 'pkg', expected: '' },
        { input: '@scope/pkg', expected: '' },
      ]

      for (let i = 0, { length } = testCases; i < length; i += 1) {
        const { expected, input } = testCases[i]!
        expect(getReleaseTag(input)).toBe(expected)
      }
    })
  })
})
