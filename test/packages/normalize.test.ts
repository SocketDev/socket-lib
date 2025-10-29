/**
 * @fileoverview Unit tests for package.json normalization utilities.
 */

import { describe, expect, it } from 'vitest'

import {
  normalizePackageJson,
  resolveEscapedScope,
  resolveOriginalPackageName,
  unescapeScope,
} from '@socketsecurity/lib/packages/normalize'
import type { PackageJson } from '@socketsecurity/lib/packages'

describe('packages/normalize', () => {
  describe('normalizePackageJson', () => {
    it('should export normalizePackageJson function', () => {
      expect(typeof normalizePackageJson).toBe('function')
    })

    it('should add default version if not present', () => {
      const pkg: PackageJson = {
        name: 'test-package',
      }
      const result = normalizePackageJson(pkg)
      expect(result.version).toBe('0.0.0')
    })

    it('should preserve existing version', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.2.3',
      }
      const result = normalizePackageJson(pkg)
      expect(result.version).toBe('1.2.3')
    })

    it('should normalize package.json data', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package',
      }
      const result = normalizePackageJson(pkg)
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('version')
      expect(result).toHaveProperty('description')
    })

    it('should handle minimal package.json', () => {
      const pkg: PackageJson = {}
      const result = normalizePackageJson(pkg)
      expect(result.version).toBe('0.0.0')
    })

    it('should preserve specified fields', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        custom: 'value',
      } as PackageJson
      const result = normalizePackageJson(pkg, {
        preserve: ['custom'],
      })
      expect(result).toHaveProperty('custom', 'value')
    })

    it('should handle preserve option with multiple fields', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        custom1: 'value1',
        custom2: 'value2',
      } as PackageJson
      const result = normalizePackageJson(pkg, {
        preserve: ['custom1', 'custom2'],
      })
      expect(result).toHaveProperty('custom1', 'value1')
      expect(result).toHaveProperty('custom2', 'value2')
    })

    it('should handle preserve option with non-existent fields', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
      }
      const result = normalizePackageJson(pkg, {
        preserve: ['nonexistent'],
      })
      expect(result).toBeDefined()
    })

    it('should handle package with dependencies', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          lodash: '^4.17.21',
        },
      }
      const result = normalizePackageJson(pkg)
      expect(result.dependencies).toEqual({ lodash: '^4.17.21' })
    })

    it('should handle package with devDependencies', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        devDependencies: {
          vitest: '^1.0.0',
        },
      }
      const result = normalizePackageJson(pkg)
      expect(result.devDependencies).toEqual({ vitest: '^1.0.0' })
    })

    it('should handle package with scripts', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        scripts: {
          test: 'vitest',
          build: 'tsc',
        },
      }
      const result = normalizePackageJson(pkg)
      expect(result.scripts).toEqual({ test: 'vitest', build: 'tsc' })
    })

    it('should handle package with existing bugs field', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        bugs: {
          url: 'https://github.com/test/issues',
        },
      }
      const result = normalizePackageJson(pkg)
      expect(result.bugs).toEqual({ url: 'https://github.com/test/issues' })
    })

    it('should handle package with existing homepage field', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        homepage: 'https://github.com/test',
      }
      const result = normalizePackageJson(pkg)
      expect(result.homepage).toBe('https://github.com/test')
    })

    it('should handle scoped package names', () => {
      const pkg: PackageJson = {
        name: '@scope/test-package',
        version: '1.0.0',
      }
      const result = normalizePackageJson(pkg)
      expect(result.name).toBe('@scope/test-package')
    })
  })

  describe('resolveEscapedScope', () => {
    it('should export resolveEscapedScope function', () => {
      expect(typeof resolveEscapedScope).toBe('function')
    })

    it('should return undefined for non-scoped package', () => {
      const result = resolveEscapedScope('lodash')
      expect(result).toBeUndefined()
    })

    it('should extract escaped scope with delimiter', () => {
      const result = resolveEscapedScope('scope__pkg')
      expect(result).toBe('scope__')
    })

    it('should return undefined for standard npm scope', () => {
      const result = resolveEscapedScope('@scope/pkg')
      expect(result).toBeUndefined()
    })

    it('should handle complex escaped scope names', () => {
      const result = resolveEscapedScope('my-org__my-package')
      expect(result).toBe('my-org__')
    })

    it('should return undefined for packages without delimiter', () => {
      const result = resolveEscapedScope('simple-package')
      expect(result).toBeUndefined()
    })
  })

  describe('unescapeScope', () => {
    it('should export unescapeScope function', () => {
      expect(typeof unescapeScope).toBe('function')
    })

    it('should convert escaped scope to npm scope format', () => {
      const result = unescapeScope('scope__')
      expect(result).toBe('@scope')
    })

    it('should handle multi-part scope names', () => {
      const result = unescapeScope('my-org__')
      expect(result).toBe('@my-org')
    })

    it('should handle single character scopes', () => {
      const result = unescapeScope('s__')
      expect(result).toBe('@s')
    })

    it('should handle scope with hyphens', () => {
      const result = unescapeScope('my-long-scope__')
      expect(result).toBe('@my-long-scope')
    })
  })

  describe('resolveOriginalPackageName', () => {
    it('should export resolveOriginalPackageName function', () => {
      expect(typeof resolveOriginalPackageName).toBe('function')
    })

    it('should return unchanged for non-Socket registry packages', () => {
      const result = resolveOriginalPackageName('lodash')
      expect(result).toBe('lodash')
    })

    it('should resolve Socket registry package without scope', () => {
      const result = resolveOriginalPackageName('@socketregistry/lodash')
      expect(result).toBe('lodash')
    })

    it('should resolve Socket registry package with escaped scope', () => {
      const result = resolveOriginalPackageName('@socketregistry/scope__pkg')
      expect(result).toBe('@scope/pkg')
    })

    it('should handle Socket registry package with complex scope', () => {
      const result = resolveOriginalPackageName('@socketregistry/my-org__pkg')
      expect(result).toBe('@my-org/pkg')
    })

    it('should handle non-Socket scoped packages', () => {
      const result = resolveOriginalPackageName('@babel/core')
      expect(result).toBe('@babel/core')
    })

    it('should handle Socket registry with hyphenated package names', () => {
      const result = resolveOriginalPackageName(
        '@socketregistry/my-package-name',
      )
      expect(result).toBe('my-package-name')
    })

    it('should handle Socket registry with scope and hyphenated package', () => {
      const result = resolveOriginalPackageName(
        '@socketregistry/my-scope__my-package',
      )
      expect(result).toBe('@my-scope/my-package')
    })
  })

  describe('integration', () => {
    it('should work together: unescape and resolve', () => {
      const escaped = 'scope__'
      const unescaped = unescapeScope(escaped)
      expect(unescaped).toBe('@scope')

      const socketPkg = '@socketregistry/scope__pkg'
      const original = resolveOriginalPackageName(socketPkg)
      expect(original).toBe('@scope/pkg')
    })

    it('should handle round-trip normalization', () => {
      const original: PackageJson = {
        name: 'test-package',
        description: 'Test',
      }
      const normalized = normalizePackageJson(original)
      expect(normalized.name).toBe('test-package')
      expect(normalized.version).toBe('0.0.0')
      expect(normalized.description).toBe('Test')
    })

    it('should preserve custom fields during normalization', () => {
      const original: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        socketSecurity: { enabled: true },
      } as PackageJson
      const normalized = normalizePackageJson(original, {
        preserve: ['socketSecurity'],
      })
      expect(normalized).toHaveProperty('socketSecurity')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string package name', () => {
      const result = resolveOriginalPackageName('')
      expect(result).toBe('')
    })

    it('should handle package name with multiple delimiters', () => {
      const result = resolveOriginalPackageName(
        '@socketregistry/scope__sub__pkg',
      )
      // First delimiter creates the scope, rest remain in package name
      expect(result).toContain('/')
    })

    it('should handle normalization with empty dependencies', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        dependencies: {},
      }
      const result = normalizePackageJson(pkg)
      expect(result.dependencies).toEqual({})
    })

    it('should handle normalization with null values', () => {
      const pkg: PackageJson = {
        name: 'test-package',
        version: '1.0.0',
        description: undefined,
      }
      const result = normalizePackageJson(pkg)
      expect(result.name).toBe('test-package')
    })

    it('should handle Socket registry package at root level', () => {
      const result = resolveOriginalPackageName('@socketregistry/')
      expect(result).toBe('')
    })
  })
})
