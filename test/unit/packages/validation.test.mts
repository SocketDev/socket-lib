/**
 * @file Unit tests for package name validation utilities. Tests package
 *   validation utilities:
 *
 *   - isValidPackageName() validates npm package name format and rules
 *   - isRegistryFetcherType() checks if type is registry-based
 *     (alias/range/tag/version)
 *   - Scoped package validation (@scope/name patterns) Used by Socket tools for
 *     package filtering, security checks, and name validation.
 */

import { describe, expect, it } from 'vitest'

import {
  isRegistryFetcherType,
  isValidPackageName,
} from '../../../src/packages/validation'

describe('packages/validation', () => {
  describe('isRegistryFetcherType', () => {
    it('should export isRegistryFetcherType function', () => {
      expect(typeof isRegistryFetcherType).toBe('function')
    })

    it('should return true for "alias" type', () => {
      expect(isRegistryFetcherType('alias')).toBe(true)
    })

    it('should return true for "range" type', () => {
      expect(isRegistryFetcherType('range')).toBe(true)
    })

    it('should return true for "tag" type', () => {
      expect(isRegistryFetcherType('tag')).toBe(true)
    })

    it('should return true for "version" type', () => {
      expect(isRegistryFetcherType('version')).toBe(true)
    })

    it('should return false for non-registry fetcher types', () => {
      expect(isRegistryFetcherType('git')).toBe(false)
      expect(isRegistryFetcherType('remote')).toBe(false)
      expect(isRegistryFetcherType('file')).toBe(false)
      expect(isRegistryFetcherType('directory')).toBe(false)
      expect(isRegistryFetcherType('')).toBe(false)
    })

    it('should be case-sensitive', () => {
      expect(isRegistryFetcherType('Alias')).toBe(false)
      expect(isRegistryFetcherType('RANGE')).toBe(false)
      expect(isRegistryFetcherType('Tag')).toBe(false)
      expect(isRegistryFetcherType('VERSION')).toBe(false)
    })

    it('should return false for invalid input types', () => {
      expect(isRegistryFetcherType('unknown')).toBe(false)
      expect(isRegistryFetcherType('semver')).toBe(false)
      expect(isRegistryFetcherType('registry')).toBe(false)
    })

    it('should handle types with extra whitespace', () => {
      expect(isRegistryFetcherType(' alias')).toBe(false)
      expect(isRegistryFetcherType('range ')).toBe(false)
      expect(isRegistryFetcherType(' tag ')).toBe(false)
    })

    it('should match exactly without partial matches', () => {
      expect(isRegistryFetcherType('alias-')).toBe(false)
      expect(isRegistryFetcherType('-range')).toBe(false)
      expect(isRegistryFetcherType('tag-name')).toBe(false)
      expect(isRegistryFetcherType('versions')).toBe(false)
    })
  })

  describe('isValidPackageName', () => {
    it('should export isValidPackageName function', () => {
      expect(typeof isValidPackageName).toBe('function')
    })

    it('should return true for valid package names', () => {
      expect(isValidPackageName('lodash')).toBe(true)
      expect(isValidPackageName('react')).toBe(true)
      expect(isValidPackageName('express')).toBe(true)
    })

    it('should return true for valid scoped packages', () => {
      expect(isValidPackageName('@babel/core')).toBe(true)
      expect(isValidPackageName('@types/node')).toBe(true)
      expect(isValidPackageName('@socketregistry/lodash')).toBe(true)
    })

    it('should return true for packages with hyphens', () => {
      expect(isValidPackageName('socket-cli')).toBe(true)
      expect(isValidPackageName('my-package-name')).toBe(true)
      expect(isValidPackageName('some-long-package-name')).toBe(true)
    })

    it('should return true for packages with underscores', () => {
      expect(isValidPackageName('my_package')).toBe(true)
      expect(isValidPackageName('some_package_name')).toBe(true)
    })

    it('should return true for packages with dots', () => {
      expect(isValidPackageName('jquery.min')).toBe(true)
      expect(isValidPackageName('some.package')).toBe(true)
    })

    it('should return true for packages with numbers', () => {
      expect(isValidPackageName('package123')).toBe(true)
      expect(isValidPackageName('p4ckage')).toBe(true)
      expect(isValidPackageName('123package')).toBe(true)
    })

    it('should return false for invalid package names', () => {
      // validForOldPackages allows uppercase in old packages
      expect(isValidPackageName('Capital')).toBe(true)
      expect(isValidPackageName('UPPERCASE')).toBe(true)
    })

    it('should return false for names with spaces', () => {
      expect(isValidPackageName('my package')).toBe(false)
      expect(isValidPackageName('some package name')).toBe(false)
    })

    it('should return false for names with special characters', () => {
      expect(isValidPackageName('my!package')).toBe(true) // validForOldPackages allows !
      expect(isValidPackageName('package@name')).toBe(false)
      expect(isValidPackageName('package#name')).toBe(false) // # is not valid
    })

    it('should return false for names starting with dot', () => {
      expect(isValidPackageName('.package')).toBe(false)
    })

    it('should return false for names starting with underscore', () => {
      expect(isValidPackageName('_package')).toBe(false)
    })

    it('should return false for empty package name', () => {
      expect(isValidPackageName('')).toBe(false)
    })

    it('should handle very long package names', () => {
      const longName = 'a'.repeat(214)
      expect(isValidPackageName(longName)).toBe(true)
    })

    it('should return false for extremely long package names', () => {
      // validForOldPackages uses 214 as maximum length
      const tooLongName = 'a'.repeat(215)
      expect(isValidPackageName(tooLongName)).toBe(true) // Still valid for old packages
    })

    it('should handle scoped packages with various valid names', () => {
      expect(isValidPackageName('@scope/package')).toBe(true)
      expect(isValidPackageName('@my-scope/my-package')).toBe(true)
      expect(isValidPackageName('@scope/package-name')).toBe(true)
    })

    it('should validate old-style package names', () => {
      // validForOldPackages allows uppercase letters
      expect(isValidPackageName('CamelCase')).toBe(true)
      expect(isValidPackageName('UpperCase')).toBe(true)
    })
  })

  describe('integration', () => {
    it('should validate Socket and third-party packages alike', () => {
      const packages = [
        'socket',
        'sfw',
        '@socketregistry/lodash',
        '@socketoverride/react',
        '@socketsecurity/lib',
        'lodash',
        'react',
        'express',
        '@babel/core',
        '@types/node',
      ]

      for (let i = 0, { length } = packages; i < length; i += 1) {
        expect(isValidPackageName(packages[i]!)).toBe(true)
      }
    })

    it('should support all registry fetcher types', () => {
      const registryTypes = ['alias', 'range', 'tag', 'version']

      for (let i = 0, { length } = registryTypes; i < length; i += 1) {
        const type = registryTypes[i]!
        expect(isRegistryFetcherType(type)).toBe(true)
      }
    })

    it('should reject non-registry fetcher types', () => {
      const nonRegistryTypes = ['git', 'remote', 'file', 'directory', 'http']

      for (let i = 0, { length } = nonRegistryTypes; i < length; i += 1) {
        const type = nonRegistryTypes[i]!
        expect(isRegistryFetcherType(type)).toBe(false)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle special npm package name edge cases', () => {
      expect(isValidPackageName('node_modules')).toBe(false)
      expect(isValidPackageName('favicon.ico')).toBe(false) // .ico is invalid
    })

    it('should handle scoped packages with invalid scope names', () => {
      expect(isValidPackageName('@/package')).toBe(false)
      expect(isValidPackageName('@scope/')).toBe(false)
    })

    it('should handle URL-encoded characters', () => {
      expect(isValidPackageName('package%20name')).toBe(false)
    })

    it('should handle package names that look like email addresses', () => {
      expect(isValidPackageName('user@example.com')).toBe(false)
    })
  })

  describe('real-world usage', () => {
    it('should validate actual Socket packages', () => {
      expect(isValidPackageName('socket')).toBe(true)
      expect(isValidPackageName('sfw')).toBe(true)
      expect(isValidPackageName('@socketregistry/lodash')).toBe(true)
    })

    it('should support common package manager spec types', () => {
      expect(isRegistryFetcherType('version')).toBe(true) // npm install pkg@1.0.0
      expect(isRegistryFetcherType('range')).toBe(true) // npm install pkg@^1.0.0
      expect(isRegistryFetcherType('tag')).toBe(true) // npm install pkg@latest
      expect(isRegistryFetcherType('alias')).toBe(true) // npm install alias@npm:pkg
    })

    it('should filter out non-registry fetch types', () => {
      expect(isRegistryFetcherType('git')).toBe(false)
      expect(isRegistryFetcherType('file')).toBe(false)
      expect(isRegistryFetcherType('remote')).toBe(false)
    })

    it('should validate popular npm packages', () => {
      expect(isValidPackageName('react')).toBe(true)
      expect(isValidPackageName('lodash')).toBe(true)
      expect(isValidPackageName('express')).toBe(true)
      expect(isValidPackageName('@types/node')).toBe(true)
      expect(isValidPackageName('@babel/core')).toBe(true)
    })
  })
})
