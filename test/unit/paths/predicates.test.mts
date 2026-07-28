/**
 * @file Unit tests for path predicate utilities. Tests cross-platform path
 *   classification:
 *
 *   - isNodeModules() detects node_modules in paths (Unix and Windows separators)
 *   - isAbsolute() checks for absolute paths (handles both / and C:\ styles)
 *   - isPath() validates path-like strings
 *   - isRelative() validates relative paths Tests extensively validate Windows vs
 *     Unix path handling and edge cases (empty paths, dots). Critical for
 *     cross-platform file operations.
 */

import process from 'node:process'
import {
  isAbsolute,
  isNodeModules,
  isPath,
  isRelative,
} from '../../../src/paths/predicates'
import { describe, expect, it } from 'vitest'

describe('path predicates', () => {
  describe('isNodeModules', () => {
    it('should detect node_modules in path', () => {
      expect(isNodeModules('/project/node_modules/package')).toBe(true)
      expect(isNodeModules('node_modules/package/index.js')).toBe(true)
      expect(isNodeModules('/a/b/node_modules/c/d')).toBe(true)
      expect(isNodeModules('node_modules')).toBe(true)
    })

    it('should detect node_modules with Windows separators', () => {
      expect(isNodeModules('C:\\project\\node_modules\\package')).toBe(true)
      expect(isNodeModules('node_modules\\package\\index.js')).toBe(true)
    })

    it('should handle node_modules at start of path', () => {
      expect(isNodeModules('node_modules/package')).toBe(true)
      expect(isNodeModules('node_modules')).toBe(true)
    })

    it('should handle node_modules at end of path', () => {
      expect(isNodeModules('/path/to/node_modules')).toBe(true)
      expect(isNodeModules('src/node_modules')).toBe(true)
    })

    it('should not match partial node_modules names', () => {
      expect(isNodeModules('/src/my_node_modules_backup')).toBe(false)
      expect(isNodeModules('/project/node_modules_old/file')).toBe(false)
      expect(isNodeModules('/old_node_modules/file')).toBe(false)
      expect(isNodeModules('notnode_modules')).toBe(false)
    })

    it('should not detect node_modules in regular paths', () => {
      expect(isNodeModules('/project/src/index.js')).toBe(false)
      expect(isNodeModules('/home/user/file.txt')).toBe(false)
      expect(isNodeModules('src/lib/util.js')).toBe(false)
    })

    it('should handle Buffer input', () => {
      expect(isNodeModules(Buffer.from('node_modules/pkg'))).toBe(true)
      expect(isNodeModules(Buffer.from('/src/file.js'))).toBe(false)
    })

    it('should handle URL input', () => {
      expect(isNodeModules(new URL('file:///project/node_modules/pkg'))).toBe(
        true,
      )
      expect(isNodeModules(new URL('file:///project/src/file.js'))).toBe(false)
    })

    it('should handle empty paths', () => {
      expect(isNodeModules('')).toBe(false)
    })
  })

  describe('isAbsolute', () => {
    describe('POSIX paths', () => {
      it('should detect POSIX absolute paths', () => {
        expect(isAbsolute('/home/user')).toBe(true)
        expect(isAbsolute('/usr/bin/node')).toBe(true)
        expect(isAbsolute('/')).toBe(true)
        expect(isAbsolute('/a')).toBe(true)
      })

      it('should detect POSIX relative paths', () => {
        expect(isAbsolute('relative/path')).toBe(false)
        expect(isAbsolute('./relative')).toBe(false)
        expect(isAbsolute('../parent')).toBe(false)
        expect(isAbsolute('.')).toBe(false)
        expect(isAbsolute('..')).toBe(false)
      })
    })

    describe('Windows paths', () => {
      it('should detect Windows drive letter absolute paths', () => {
        // Only on Windows platform
        if (process.platform === 'win32') {
          expect(isAbsolute('C:\\Windows')).toBe(true)
          expect(isAbsolute('D:/data')).toBe(true)
          expect(isAbsolute('c:\\Program Files')).toBe(true)
          expect(isAbsolute('Z:\\path')).toBe(true)
          expect(isAbsolute('a:/file')).toBe(true)
        }
      })

      it('should detect backslash as absolute', () => {
        expect(isAbsolute('\\Windows')).toBe(true)
        expect(isAbsolute('\\')).toBe(true)
      })

      it('should detect UNC paths', () => {
        expect(isAbsolute('\\\\server\\share')).toBe(true)
        expect(isAbsolute('\\\\server\\share\\file')).toBe(true)
        expect(isAbsolute('\\\\?\\C:\\path')).toBe(true)
        expect(isAbsolute('\\\\.\\device')).toBe(true)
      })

      it('should reject relative Windows paths', () => {
        expect(isAbsolute('relative\\path')).toBe(false)
        expect(isAbsolute('.\\relative')).toBe(false)
        expect(isAbsolute('..\\parent')).toBe(false)
      })

      it('should reject paths with colon but no separator', () => {
        expect(isAbsolute('C:')).toBe(false)
        expect(isAbsolute('D:file')).toBe(false)
      })

      it('should reject paths with colon in wrong position', () => {
        expect(isAbsolute(':C\\path')).toBe(false)
        expect(isAbsolute('1C:\\path')).toBe(false)
      })
    })

    describe('Edge cases', () => {
      it('should handle empty path', () => {
        expect(isAbsolute('')).toBe(false)
      })

      it('should handle single character paths', () => {
        expect(isAbsolute('/')).toBe(true)
        expect(isAbsolute('\\')).toBe(true)
        expect(isAbsolute('a')).toBe(false)
        expect(isAbsolute('.')).toBe(false)
      })

      it('should handle two character paths', () => {
        expect(isAbsolute('//')).toBe(true)
        expect(isAbsolute('\\\\')).toBe(true)
        expect(isAbsolute('/a')).toBe(true)
        expect(isAbsolute('ab')).toBe(false)
        expect(isAbsolute('..')).toBe(false)
      })

      it('should handle Buffer input', () => {
        expect(isAbsolute(Buffer.from('/absolute'))).toBe(true)
        expect(isAbsolute(Buffer.from('relative'))).toBe(false)
      })

      it('should handle URL input', () => {
        expect(isAbsolute(new URL('file:///absolute/path'))).toBe(true)
      })
    })
  })

  describe('isPath', () => {
    describe('Valid paths', () => {
      it('should detect absolute paths', () => {
        expect(isPath('/absolute/path')).toBe(true)
        expect(isPath('/home/user')).toBe(true)
        expect(isPath('/')).toBe(true)
      })

      it('should detect relative paths with separators', () => {
        expect(isPath('./relative/path')).toBe(true)
        expect(isPath('../parent/dir')).toBe(true)
        expect(isPath('relative/path')).toBe(true)
        expect(isPath('a/b')).toBe(true)
      })

      it('should detect special relative paths', () => {
        expect(isPath('.')).toBe(true)
        expect(isPath('..')).toBe(true)
      })

      it('should detect paths starting with @ that have subpaths', () => {
        expect(isPath('@scope/name/subpath')).toBe(true)
        expect(isPath('@scope/name/file.js')).toBe(true)
        expect(isPath('@scope/name/a/b/c')).toBe(true)
        expect(isPath('@/path')).toBe(true)
      })

      it('should detect Windows paths', () => {
        if (process.platform === 'win32') {
          expect(isPath('C:\\Windows')).toBe(true)
          expect(isPath('D:/data')).toBe(true)
        }
        expect(isPath('path\\to\\file')).toBe(true)
      })

      it('should detect paths with backslashes', () => {
        expect(isPath('path\\file')).toBe(true)
        expect(isPath('folder\\subfolder\\file')).toBe(true)
      })
    })

    describe('Not paths', () => {
      it('should reject bare package names', () => {
        expect(isPath('lodash')).toBe(false)
        expect(isPath('react')).toBe(false)
        expect(isPath('express')).toBe(false)
      })

      it('should reject scoped package names without subpaths', () => {
        expect(isPath('@scope/package')).toBe(false)
        expect(isPath('@babel/core')).toBe(false)
        expect(isPath('@types/node')).toBe(false)
      })

      it('should reject URLs with protocols', () => {
        expect(isPath('http://example.com')).toBe(false)
        expect(isPath('https://example.com/path')).toBe(false)
        expect(isPath('file://path')).toBe(false)
        expect(isPath('git://github.com/repo')).toBe(false)
        expect(isPath('ftp://server.com')).toBe(false)
        expect(isPath('data:text/plain,hello')).toBe(false)
      })

      it('should reject empty string', () => {
        expect(isPath('')).toBe(false)
      })

      it('should allow Windows drive letters', () => {
        // Windows drive letters are 2 chars before colon, not URLs
        if (process.platform === 'win32') {
          expect(isPath('C:\\path')).toBe(true)
          expect(isPath('D:/path')).toBe(true)
        }
      })
    })

    describe('Edge cases', () => {
      it('should handle Buffer input', () => {
        expect(isPath(Buffer.from('./path'))).toBe(true)
        expect(isPath(Buffer.from('lodash'))).toBe(false)
      })

      it('should handle URL input', () => {
        expect(isPath(new URL('file:///path'))).toBe(true)
      })

      it('should handle protocol-like strings', () => {
        expect(isPath('scheme:value')).toBe(false)
        expect(isPath('http+ssh://url')).toBe(false)
        expect(isPath('git+https://url')).toBe(false)
      })

      it('should handle scoped packages with different slash counts', () => {
        expect(isPath('@scope')).toBe(false)
        expect(isPath('@scope/name')).toBe(false)
        expect(isPath('@scope/name/file')).toBe(true)
        expect(isPath('@scope/name/a/b')).toBe(true)
      })

      it('should handle mixed separators in scoped packages', () => {
        // @scope/name\file has backslash in parts[1], so it's detected as path
        expect(isPath('@scope/name\\file')).toBe(true)
        // @scope\name\file is only 1 part when split by '/', not detected as path
        expect(isPath('@scope\\name\\file')).toBe(false)
      })
    })
  })

  describe('isRelative', () => {
    it('should detect relative paths', () => {
      expect(isRelative('./src/index.js')).toBe(true)
      expect(isRelative('../lib/util.js')).toBe(true)
      expect(isRelative('src/file.js')).toBe(true)
      expect(isRelative('file.js')).toBe(true)
      expect(isRelative('.')).toBe(true)
      expect(isRelative('..')).toBe(true)
    })

    it('should detect empty string as relative', () => {
      expect(isRelative('')).toBe(true)
    })

    it('should detect absolute paths as not relative', () => {
      expect(isRelative('/home/user')).toBe(false)
      expect(isRelative('/')).toBe(false)
      expect(isRelative('\\Windows')).toBe(false)
      expect(isRelative('\\\\')).toBe(false)
    })

    it('should handle Windows drive paths', () => {
      if (process.platform === 'win32') {
        expect(isRelative('C:\\Windows')).toBe(false)
        expect(isRelative('D:/data')).toBe(false)
      }
    })

    it('should handle Buffer input', () => {
      expect(isRelative(Buffer.from('relative'))).toBe(true)
      expect(isRelative(Buffer.from('/absolute'))).toBe(false)
    })

    it('should handle URL input', () => {
      expect(isRelative(new URL('file:///absolute'))).toBe(false)
    })

    it('should handle non-string types', () => {
      // pathLikeToString returns '' for null/undefined, which is relative
      expect(isRelative(undefined as unknown as string)).toBe(true)
      expect(isRelative(undefined as unknown as string)).toBe(true)
    })
  })
})
