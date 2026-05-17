/**
 * @fileoverview Unit tests for file name constants.
 *
 * Tests file name constants used throughout Socket tooling:
 * - Common project files (package.json, tsconfig.json, LICENSE, README.md, etc.)
 * - Configuration files (.gitignore, eslint.config.js)
 * - Socket-specific files (manifest.json, extensions.json)
 * - Lock files (.package-lock.json)
 * Used for consistent file name references across the Socket codebase.
 */

import {
  CHANGELOG_MD,
  DOT_PACKAGE_LOCK_JSON,
  ESLINT_CONFIG_JS,
  EXTENSIONS_JSON,
  GITIGNORE,
  LICENSE,
  LICENSE_MD,
  LICENSE_ORIGINAL,
  MANIFEST_JSON,
  PACKAGE_JSON,
  README_MD,
  TSCONFIG_JSON,
} from '@socketsecurity/lib/paths/filenames'
import { describe, expect, it } from 'vitest'

describe('paths/filenames', () => {
  describe('PACKAGE_JSON', () => {
    it('should be package.json', () => {
      expect(PACKAGE_JSON).toBe('package.json')
    })

    it('should be a string', () => {
      expect(typeof PACKAGE_JSON).toBe('string')
    })
  })

  describe('TSCONFIG_JSON', () => {
    it('should be tsconfig.json', () => {
      expect(TSCONFIG_JSON).toBe('tsconfig.json')
    })
  })

  describe('LICENSE', () => {
    it('should be LICENSE', () => {
      expect(LICENSE).toBe('LICENSE')
    })

    it('should not have extension', () => {
      expect(LICENSE).not.toContain('.')
    })
  })

  describe('LICENSE_MD', () => {
    it('should be LICENSE.md', () => {
      expect(LICENSE_MD).toBe('LICENSE.md')
    })

    it('should end with .md', () => {
      expect(LICENSE_MD.endsWith('.md')).toBe(true)
    })
  })

  describe('LICENSE_ORIGINAL', () => {
    it('should be LICENSE.original', () => {
      expect(LICENSE_ORIGINAL).toBe('LICENSE.original')
    })
  })

  describe('README_MD', () => {
    it('should be README.md', () => {
      expect(README_MD).toBe('README.md')
    })

    it('should end with .md', () => {
      expect(README_MD.endsWith('.md')).toBe(true)
    })
  })

  describe('CHANGELOG_MD', () => {
    it('should be CHANGELOG.md', () => {
      expect(CHANGELOG_MD).toBe('CHANGELOG.md')
    })

    it('should end with .md', () => {
      expect(CHANGELOG_MD.endsWith('.md')).toBe(true)
    })
  })

  describe('MANIFEST_JSON', () => {
    it('should be manifest.json', () => {
      expect(MANIFEST_JSON).toBe('manifest.json')
    })

    it('should end with .json', () => {
      expect(MANIFEST_JSON.endsWith('.json')).toBe(true)
    })
  })

  describe('EXTENSIONS_JSON', () => {
    it('should be extensions.json', () => {
      expect(EXTENSIONS_JSON).toBe('extensions.json')
    })

    it('should end with .json', () => {
      expect(EXTENSIONS_JSON.endsWith('.json')).toBe(true)
    })
  })

  describe('ESLINT_CONFIG_JS', () => {
    it('should be eslint.config.js', () => {
      expect(ESLINT_CONFIG_JS).toBe('eslint.config.js')
    })

    it('should end with .js', () => {
      expect(ESLINT_CONFIG_JS.endsWith('.js')).toBe(true)
    })
  })

  describe('GITIGNORE', () => {
    it('should be .gitignore', () => {
      expect(GITIGNORE).toBe('.gitignore')
    })

    it('should start with dot', () => {
      expect(GITIGNORE.startsWith('.')).toBe(true)
    })
  })

  describe('DOT_PACKAGE_LOCK_JSON', () => {
    it('should be .package-lock.json', () => {
      expect(DOT_PACKAGE_LOCK_JSON).toBe('.package-lock.json')
    })

    it('should start with dot', () => {
      expect(DOT_PACKAGE_LOCK_JSON.startsWith('.')).toBe(true)
    })

    it('should end with .json', () => {
      expect(DOT_PACKAGE_LOCK_JSON.endsWith('.json')).toBe(true)
    })
  })

  describe('all constants', () => {
    it('should all be non-empty strings', () => {
      const constants = [
        PACKAGE_JSON,
        TSCONFIG_JSON,
        LICENSE,
        LICENSE_MD,
        LICENSE_ORIGINAL,
        README_MD,
        CHANGELOG_MD,
        MANIFEST_JSON,
        EXTENSIONS_JSON,
        ESLINT_CONFIG_JS,
        GITIGNORE,
        DOT_PACKAGE_LOCK_JSON,
      ]

      for (const constant of constants) {
        expect(typeof constant).toBe('string')
        expect(constant.length).toBeGreaterThan(0)
      }
    })

    it('should not contain path separators', () => {
      const constants = [
        PACKAGE_JSON,
        TSCONFIG_JSON,
        LICENSE,
        LICENSE_MD,
        LICENSE_ORIGINAL,
        README_MD,
        CHANGELOG_MD,
        MANIFEST_JSON,
        EXTENSIONS_JSON,
        ESLINT_CONFIG_JS,
        GITIGNORE,
        DOT_PACKAGE_LOCK_JSON,
      ]

      for (const constant of constants) {
        expect(constant).not.toContain('/')
        expect(constant).not.toContain('\\')
      }
    })
  })
})
