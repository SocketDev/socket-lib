/**
 * @fileoverview Unit tests for package extensions.
 *
 * Tests package extension utilities:
 * - packageExtensions - frozen array of package compatibility adjustments
 * - Includes extensions from @yarnpkg/extensions
 * - Custom extensions for Socket-specific compatibility fixes
 * - Array is sorted alphabetically by package name
 * Used by Socket package manager for applying compatibility patches to dependencies.
 */

import { packageExtensions } from '@socketsecurity/lib/package-extensions'
import { describe, expect, it } from 'vitest'

describe('package-extensions', () => {
  describe('packageExtensions', () => {
    it('should be defined', () => {
      expect(packageExtensions).toBeDefined()
    })

    it('should be an array', () => {
      expect(Array.isArray(packageExtensions)).toBe(true)
    })

    it('should be frozen', () => {
      expect(Object.isFrozen(packageExtensions)).toBe(true)
    })

    it('should have at least one extension', () => {
      expect(packageExtensions.length).toBeGreaterThan(0)
    })

    it('should contain @yarnpkg/extensions entry', () => {
      const hasYarnExtension = packageExtensions.some(([name]) =>
        name.startsWith('@yarnpkg/extensions'),
      )
      expect(hasYarnExtension).toBe(true)
    })

    it('should contain abab extension', () => {
      const hasAbab = packageExtensions.some(([name]) =>
        name.startsWith('abab'),
      )
      expect(hasAbab).toBe(true)
    })

    it('should contain is-generator-function extension', () => {
      const hasIsGenFn = packageExtensions.some(([name]) =>
        name.startsWith('is-generator-function'),
      )
      expect(hasIsGenFn).toBe(true)
    })

    it('should have tuple structure [name, config]', () => {
      for (const extension of packageExtensions) {
        expect(Array.isArray(extension)).toBe(true)
        expect(extension).toHaveLength(2)
        expect(typeof extension[0]).toBe('string')
        expect(typeof extension[1]).toBe('object')
        expect(extension[1]).not.toBeNull()
      }
    })

    it('should have package names with version ranges', () => {
      for (const [name] of packageExtensions) {
        expect(name).toContain('@')
        expect(name).toMatch(/^.+@.+$/)
      }
    })

    it('should be sorted alphabetically by package name', () => {
      const packageNames = packageExtensions.map(([name]) =>
        name.slice(0, name.lastIndexOf('@')),
      )

      for (let i = 1; i < packageNames.length; i++) {
        const prev = packageNames[i - 1]
        const current = packageNames[i]
        expect(prev! <= current!).toBe(true)
      }
    })

    it('should have valid extension configs', () => {
      for (const [name, config] of packageExtensions) {
        expect(config).toBeDefined()
        expect(typeof config).toBe('object')
        expect(config).not.toBeNull()

        if (name.startsWith('@yarnpkg/extensions')) {
          expect(config).toHaveProperty('peerDependencies')
        }

        if (name.startsWith('abab')) {
          expect(config).toHaveProperty('devDependencies')
          const devDeps = (config as any).devDependencies
          expect(devDeps).toBeDefined()
          expect(devDeps.webpack).toBe('^3.12.0')
        }

        if (name.startsWith('is-generator-function')) {
          expect(config).toHaveProperty('scripts')
          const scripts = (config as any).scripts
          expect(scripts).toBeDefined()
          expect(scripts['test:uglified']).toBe('')
        }
      }
    })

    it('should not be modifiable (frozen array)', () => {
      expect(() => {
        ;(packageExtensions as any).push(['test@1.0.0', {}])
      }).toThrow()
    })

    it('should include extensions from @yarnpkg/extensions', () => {
      const yarnExtensions = packageExtensions.filter(([name]) =>
        name.startsWith('@yarnpkg/extensions'),
      )
      expect(yarnExtensions.length).toBeGreaterThanOrEqual(1)
    })

    it('should have socket-specific extensions', () => {
      const socketExtensions = packageExtensions.filter(([name]) => {
        return (
          name.startsWith('abab') || name.startsWith('is-generator-function')
        )
      })
      expect(socketExtensions.length).toBeGreaterThanOrEqual(2)
    })

    it('should have @yarnpkg/extensions with undefined peerDependencies', () => {
      const yarnExt = packageExtensions.find(([name]) =>
        name.startsWith('@yarnpkg/extensions'),
      )
      expect(yarnExt).toBeDefined()
      const [, config] = yarnExt!
      expect(config).toHaveProperty('peerDependencies')
      expect((config as any).peerDependencies).toBeUndefined()
    })

    it('should have abab with webpack devDependency override', () => {
      const ababExt = packageExtensions.find(([name]) =>
        name.startsWith('abab'),
      )
      expect(ababExt).toBeDefined()
      const [, config] = ababExt!
      expect(config).toHaveProperty('devDependencies')
      const devDeps = (config as any).devDependencies
      expect(devDeps).toHaveProperty('webpack')
      expect(devDeps.webpack).toBe('^3.12.0')
    })

    it('should have is-generator-function with silenced test script', () => {
      const isGenFnExt = packageExtensions.find(([name]) =>
        name.startsWith('is-generator-function'),
      )
      expect(isGenFnExt).toBeDefined()
      const [, config] = isGenFnExt!
      expect(config).toHaveProperty('scripts')
      const scripts = (config as any).scripts
      expect(scripts).toHaveProperty('test:uglified')
      expect(scripts['test:uglified']).toBe('')
    })

    it('should have consistent sorting with String.prototype.sort behavior', () => {
      const packageNames = packageExtensions.map(([name]) =>
        name.slice(0, name.lastIndexOf('@')),
      )

      const manualSort = [...packageNames].sort((a, b) => {
        if (a < b) {
          return -1
        }
        if (a > b) {
          return 1
        }
        return 0
      })

      expect(packageNames).toEqual(manualSort)
    })
  })
})
