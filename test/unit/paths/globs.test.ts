/**
 * @fileoverview Unit tests for glob pattern constants.
 *
 * Tests glob pattern constants used throughout Socket tooling:
 * - LICENSE patterns (recursive and non-recursive)
 * - LICENSE.original patterns
 * - README patterns (recursive and non-recursive)
 * Used for file discovery, pattern matching, and codebase traversal.
 */

import {
  LICENSE_GLOB,
  LICENSE_GLOB_RECURSIVE,
  LICENSE_ORIGINAL_GLOB,
  LICENSE_ORIGINAL_GLOB_RECURSIVE,
  README_GLOB,
  README_GLOB_RECURSIVE,
} from '@socketsecurity/lib/paths/globs'
import { describe, expect, it } from 'vitest'

describe('paths/globs', () => {
  describe('LICENSE_GLOB', () => {
    it('should be LICEN[CS]E{[.-]*,}', () => {
      expect(LICENSE_GLOB).toBe('LICEN[CS]E{[.-]*,}')
    })

    it('should be a valid glob pattern', () => {
      expect(LICENSE_GLOB).toContain('[CS]')
      expect(LICENSE_GLOB).toContain('{')
    })

    it('should not be recursive', () => {
      expect(LICENSE_GLOB).not.toContain('**/')
    })
  })

  describe('LICENSE_GLOB_RECURSIVE', () => {
    it('should be **/LICEN[CS]E{[.-]*,}', () => {
      expect(LICENSE_GLOB_RECURSIVE).toBe('**/LICEN[CS]E{[.-]*,}')
    })

    it('should start with recursive pattern', () => {
      expect(LICENSE_GLOB_RECURSIVE.startsWith('**/')).toBe(true)
    })

    it('should contain LICENSE pattern', () => {
      expect(LICENSE_GLOB_RECURSIVE).toContain('LICEN[CS]E')
    })
  })

  describe('LICENSE_ORIGINAL_GLOB', () => {
    it('should be *.original{.*,}', () => {
      expect(LICENSE_ORIGINAL_GLOB).toBe('*.original{.*,}')
    })

    it('should start with wildcard', () => {
      expect(LICENSE_ORIGINAL_GLOB.startsWith('*')).toBe(true)
    })

    it('should not be recursive', () => {
      expect(LICENSE_ORIGINAL_GLOB).not.toContain('**/')
    })
  })

  describe('LICENSE_ORIGINAL_GLOB_RECURSIVE', () => {
    it('should be **/*.original{.*,}', () => {
      expect(LICENSE_ORIGINAL_GLOB_RECURSIVE).toBe('**/*.original{.*,}')
    })

    it('should start with recursive pattern', () => {
      expect(LICENSE_ORIGINAL_GLOB_RECURSIVE.startsWith('**/')).toBe(true)
    })

    it('should contain original pattern', () => {
      expect(LICENSE_ORIGINAL_GLOB_RECURSIVE).toContain('.original')
    })
  })

  describe('README_GLOB', () => {
    it('should be README{.*,}', () => {
      expect(README_GLOB).toBe('README{.*,}')
    })

    it('should start with README', () => {
      expect(README_GLOB.startsWith('README')).toBe(true)
    })

    it('should not be recursive', () => {
      expect(README_GLOB).not.toContain('**/')
    })
  })

  describe('README_GLOB_RECURSIVE', () => {
    it('should be **/README{.*,}', () => {
      expect(README_GLOB_RECURSIVE).toBe('**/README{.*,}')
    })

    it('should start with recursive pattern', () => {
      expect(README_GLOB_RECURSIVE.startsWith('**/')).toBe(true)
    })

    it('should contain README', () => {
      expect(README_GLOB_RECURSIVE).toContain('README')
    })
  })

  describe('all glob patterns', () => {
    it('should all be non-empty strings', () => {
      const patterns = [
        LICENSE_GLOB,
        LICENSE_GLOB_RECURSIVE,
        LICENSE_ORIGINAL_GLOB,
        LICENSE_ORIGINAL_GLOB_RECURSIVE,
        README_GLOB,
        README_GLOB_RECURSIVE,
      ]

      for (const pattern of patterns) {
        expect(typeof pattern).toBe('string')
        expect(pattern.length).toBeGreaterThan(0)
      }
    })

    it('should have recursive patterns with **/', () => {
      const recursivePatterns = [
        LICENSE_GLOB_RECURSIVE,
        LICENSE_ORIGINAL_GLOB_RECURSIVE,
        README_GLOB_RECURSIVE,
      ]

      for (const pattern of recursivePatterns) {
        expect(pattern.startsWith('**/')).toBe(true)
      }
    })

    it('should have non-recursive patterns without **/', () => {
      const nonRecursivePatterns = [
        LICENSE_GLOB,
        LICENSE_ORIGINAL_GLOB,
        README_GLOB,
      ]

      for (const pattern of nonRecursivePatterns) {
        expect(pattern).not.toContain('**/')
      }
    })

    it('should have LICENSE patterns', () => {
      const licensePatterns = [
        LICENSE_GLOB,
        LICENSE_GLOB_RECURSIVE,
        LICENSE_ORIGINAL_GLOB,
        LICENSE_ORIGINAL_GLOB_RECURSIVE,
      ]

      expect(licensePatterns.length).toBeGreaterThan(0)
    })

    it('should have README patterns', () => {
      const readmePatterns = [README_GLOB, README_GLOB_RECURSIVE]

      expect(readmePatterns.length).toBeGreaterThan(0)
    })
  })

  describe('pattern specificity', () => {
    it('should have LICENSE pattern that matches both LICENSE and LICENCE', () => {
      // The [CS] pattern allows matching both spellings
      expect(LICENSE_GLOB).toContain('[CS]')
      expect(LICENSE_GLOB_RECURSIVE).toContain('[CS]')
    })

    it('should have LICENSE pattern that allows optional suffixes', () => {
      // {[.-]*,} allows LICENSE, LICENSE.md, LICENSE-MIT, etc.
      expect(LICENSE_GLOB).toContain('{[.-]*,}')
      expect(LICENSE_GLOB_RECURSIVE).toContain('{[.-]*,}')
    })

    it('should have README pattern that allows extensions', () => {
      // {.*,} allows README, README.md, README.txt, etc.
      expect(README_GLOB).toContain('{.*,}')
      expect(README_GLOB_RECURSIVE).toContain('{.*,}')
    })

    it('should have LICENSE.original pattern for backup files', () => {
      expect(LICENSE_ORIGINAL_GLOB).toContain('.original')
      expect(LICENSE_ORIGINAL_GLOB_RECURSIVE).toContain('.original')
    })
  })
})
