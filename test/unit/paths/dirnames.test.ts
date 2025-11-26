/**
 * @fileoverview Unit tests for directory name and path pattern constants.
 *
 * Tests directory name constants used throughout Socket tooling:
 * - Directory names (node_modules, .git, .github, .socket, cache, ttl)
 * - Path patterns for globbing and matching
 * - Constants for consistent directory references
 * Used for path operations, file system traversal, and caching throughout Socket tools.
 */

import {
  CACHE_DIR,
  CACHE_TTL_DIR,
  DOT_GIT_DIR,
  DOT_GITHUB,
  DOT_SOCKET_DIR,
  NODE_MODULES,
  NODE_MODULES_GLOB_RECURSIVE,
  SLASH_NODE_MODULES_SLASH,
} from '@socketsecurity/lib/paths/dirnames'
import { describe, expect, it } from 'vitest'

describe('paths/dirnames', () => {
  describe('NODE_MODULES', () => {
    it('should be node_modules', () => {
      expect(NODE_MODULES).toBe('node_modules')
    })

    it('should be a string', () => {
      expect(typeof NODE_MODULES).toBe('string')
    })

    it('should not have path separators', () => {
      expect(NODE_MODULES).not.toContain('/')
      expect(NODE_MODULES).not.toContain('\\')
    })
  })

  describe('DOT_GIT_DIR', () => {
    it('should be .git', () => {
      expect(DOT_GIT_DIR).toBe('.git')
    })

    it('should start with dot', () => {
      expect(DOT_GIT_DIR.startsWith('.')).toBe(true)
    })
  })

  describe('DOT_GITHUB', () => {
    it('should be .github', () => {
      expect(DOT_GITHUB).toBe('.github')
    })

    it('should start with dot', () => {
      expect(DOT_GITHUB.startsWith('.')).toBe(true)
    })
  })

  describe('DOT_SOCKET_DIR', () => {
    it('should be .socket', () => {
      expect(DOT_SOCKET_DIR).toBe('.socket')
    })

    it('should start with dot', () => {
      expect(DOT_SOCKET_DIR.startsWith('.')).toBe(true)
    })
  })

  describe('CACHE_DIR', () => {
    it('should be cache', () => {
      expect(CACHE_DIR).toBe('cache')
    })

    it('should not start with dot', () => {
      expect(CACHE_DIR.startsWith('.')).toBe(false)
    })
  })

  describe('CACHE_TTL_DIR', () => {
    it('should be ttl', () => {
      expect(CACHE_TTL_DIR).toBe('ttl')
    })

    it('should not start with dot', () => {
      expect(CACHE_TTL_DIR.startsWith('.')).toBe(false)
    })
  })

  describe('NODE_MODULES_GLOB_RECURSIVE', () => {
    it('should be **/node_modules', () => {
      expect(NODE_MODULES_GLOB_RECURSIVE).toBe('**/node_modules')
    })

    it('should start with glob pattern', () => {
      expect(NODE_MODULES_GLOB_RECURSIVE.startsWith('**/')).toBe(true)
    })

    it('should be a valid glob pattern', () => {
      expect(NODE_MODULES_GLOB_RECURSIVE).toContain('**')
      expect(NODE_MODULES_GLOB_RECURSIVE).toContain(NODE_MODULES)
    })
  })

  describe('SLASH_NODE_MODULES_SLASH', () => {
    it('should be /node_modules/', () => {
      expect(SLASH_NODE_MODULES_SLASH).toBe('/node_modules/')
    })

    it('should start with slash', () => {
      expect(SLASH_NODE_MODULES_SLASH.startsWith('/')).toBe(true)
    })

    it('should end with slash', () => {
      expect(SLASH_NODE_MODULES_SLASH.endsWith('/')).toBe(true)
    })

    it('should contain node_modules', () => {
      expect(SLASH_NODE_MODULES_SLASH).toContain(NODE_MODULES)
    })
  })

  describe('all directory constants', () => {
    it('should all be non-empty strings', () => {
      const constants = [
        NODE_MODULES,
        DOT_GIT_DIR,
        DOT_GITHUB,
        DOT_SOCKET_DIR,
        CACHE_DIR,
        CACHE_TTL_DIR,
      ]

      for (const constant of constants) {
        expect(typeof constant).toBe('string')
        expect(constant.length).toBeGreaterThan(0)
      }
    })

    it('should have dot directories start with dot', () => {
      const dotDirs = [DOT_GIT_DIR, DOT_GITHUB, DOT_SOCKET_DIR]

      for (const dir of dotDirs) {
        expect(dir.startsWith('.')).toBe(true)
      }
    })

    it('should have regular directories not start with dot', () => {
      const regularDirs = [NODE_MODULES, CACHE_DIR, CACHE_TTL_DIR]

      for (const dir of regularDirs) {
        expect(dir.startsWith('.')).toBe(false)
      }
    })
  })

  describe('path pattern constants', () => {
    it('should all be non-empty strings', () => {
      const patterns = [NODE_MODULES_GLOB_RECURSIVE, SLASH_NODE_MODULES_SLASH]

      for (const pattern of patterns) {
        expect(typeof pattern).toBe('string')
        expect(pattern.length).toBeGreaterThan(0)
      }
    })

    it('should all reference node_modules', () => {
      expect(NODE_MODULES_GLOB_RECURSIVE).toContain('node_modules')
      expect(SLASH_NODE_MODULES_SLASH).toContain('node_modules')
    })
  })
})
