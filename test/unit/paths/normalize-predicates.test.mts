/**
 * @file Unit tests for cross-platform path predicates and manipulation:
 *
 *   - isAbsolute() detects absolute paths (Unix/Windows)
 *   - isRelative() detects relative paths
 *   - isUnixPath() detects MSYS/Git Bash drive letter paths
 *   - isPath() validates path-like inputs
 *   - isNodeModules() detects node_modules paths
 *   - splitPath() splits paths into segments
 *   - trimLeadingDotSlash() removes ./ prefix
 *   - pathLikeToString() converts Buffer/URL to string
 *   - relativeResolve() resolves relative paths
 *
 *   Conversion utilities (normalizePath/toUnixPath/fromUnixPath) live in
 *   normalize.test.mts. Used throughout Socket tools for cross-platform path
 *   handling.
 */

import { WIN32 } from '@socketsecurity/lib-stable/constants/platform'
import { describe, expect, it } from 'vitest'

import {
  isAbsolute,
  isNodeModules,
  isPath,
  isRelative,
  isUnixPath,
  normalizePath,
  pathLikeToString,
  relativeResolve,
  splitPath,
  trimLeadingDotSlash,
} from '../../../src/paths/normalize'

describe('paths/normalize predicates', () => {
  describe('isAbsolute', () => {
    it('should detect Unix absolute paths', () => {
      expect(isAbsolute('/usr/local')).toBe(true)
      expect(isAbsolute('/home/user')).toBe(true)
      expect(isAbsolute('/')).toBe(true)
    })

    it('should detect relative paths as not absolute', () => {
      expect(isAbsolute('./src')).toBe(false)
      expect(isAbsolute('../lib')).toBe(false)
      expect(isAbsolute('src/index.ts')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(isAbsolute('')).toBe(false)
    })

    it('should handle Buffer input', () => {
      expect(isAbsolute(Buffer.from('/usr/local'))).toBe(true)
      expect(isAbsolute(Buffer.from('./relative'))).toBe(false)
    })

    it('should handle URL input', () => {
      const url = new URL('file:///usr/local')
      expect(isAbsolute(url)).toBe(true)
    })
  })

  describe('isRelative', () => {
    it('should detect relative paths', () => {
      expect(isRelative('./src')).toBe(true)
      expect(isRelative('../lib')).toBe(true)
      expect(isRelative('src/index.ts')).toBe(true)
    })

    it('should detect absolute paths as not relative', () => {
      expect(isRelative('/usr/local')).toBe(false)
    })

    it('should handle empty string as relative', () => {
      // Empty string is considered relative
      expect(isRelative('')).toBe(true)
    })

    it('should handle dot path', () => {
      expect(isRelative('.')).toBe(true)
    })

    it('should handle Buffer input', () => {
      expect(isRelative(Buffer.from('./src'))).toBe(true)
      expect(isRelative(Buffer.from('/usr/local'))).toBe(false)
    })

    it('should handle paths without leading ./', () => {
      expect(isRelative('src/file.ts')).toBe(true)
      expect(isRelative('lib/utils.js')).toBe(true)
    })
  })

  describe('isUnixPath', () => {
    it('should detect MSYS drive letter paths', () => {
      expect(isUnixPath('/c/tools/bin')).toBe(true)
      expect(isUnixPath('/d/projects/app')).toBe(true)
      expect(isUnixPath('/z/path')).toBe(true)
      expect(isUnixPath('/C/Windows')).toBe(true)
    })

    it('should detect bare drive letter paths', () => {
      expect(isUnixPath('/c')).toBe(true)
      expect(isUnixPath('/D')).toBe(true)
    })

    it('should reject non-drive Unix paths', () => {
      expect(isUnixPath('/tmp/build')).toBe(false)
      expect(isUnixPath('/usr/local/bin')).toBe(false)
      expect(isUnixPath('/home/user')).toBe(false)
    })

    it('should reject Windows-style paths', () => {
      expect(isUnixPath('C:/Windows')).toBe(false)
      expect(isUnixPath('C:\\Windows')).toBe(false)
    })

    it('should reject relative paths', () => {
      expect(isUnixPath('./relative')).toBe(false)
      expect(isUnixPath('../parent')).toBe(false)
      expect(isUnixPath('src/file.ts')).toBe(false)
    })

    it('should reject empty and root paths', () => {
      expect(isUnixPath('')).toBe(false)
      expect(isUnixPath('/')).toBe(false)
    })

    it('should handle Buffer input', () => {
      expect(isUnixPath(Buffer.from('/c/projects'))).toBe(true)
      expect(isUnixPath(Buffer.from('/tmp/build'))).toBe(false)
    })
  })

  describe('isPath', () => {
    it('should validate string paths', () => {
      expect(isPath('/usr/local')).toBe(true)
      expect(isPath('./src')).toBe(true)
      expect(isPath('src/file.txt')).toBe(true)
    })

    it('should validate Buffer paths', () => {
      expect(isPath(Buffer.from('/usr/local'))).toBe(true)
    })

    it('should validate URL paths', () => {
      expect(isPath(new URL('file:///usr/local'))).toBe(true)
    })

    it('should reject empty string', () => {
      expect(isPath('')).toBe(false)
    })

    it('should validate paths with special characters', () => {
      expect(isPath('/usr/local/file (1).txt')).toBe(true)
      expect(isPath('./src/@types')).toBe(true)
    })
  })

  describe('isNodeModules', () => {
    it('should detect node_modules in Unix paths', () => {
      expect(isNodeModules('/project/node_modules/package')).toBe(true)
      expect(isNodeModules('./node_modules/lib')).toBe(true)
    })

    it('should detect node_modules in Windows paths', () => {
      expect(isNodeModules('C:\\project\\node_modules\\package')).toBe(true)
    })

    it('should detect node_modules at path start', () => {
      expect(isNodeModules('node_modules/package')).toBe(true)
    })

    it('should detect node_modules at path end', () => {
      expect(isNodeModules('/project/node_modules')).toBe(true)
    })

    it('should not detect node_modules in filename', () => {
      expect(isNodeModules('/project/node_modules_backup')).toBe(false)
      expect(isNodeModules('/project/my_node_modules')).toBe(false)
    })

    it('should handle paths without node_modules', () => {
      expect(isNodeModules('/usr/local/lib')).toBe(false)
      expect(isNodeModules('./src/index.ts')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(isNodeModules('')).toBe(false)
    })

    it('should handle Buffer input', () => {
      expect(isNodeModules(Buffer.from('/project/node_modules/pkg'))).toBe(true)
      expect(isNodeModules(Buffer.from('/project/src'))).toBe(false)
    })

    it('should detect nested node_modules', () => {
      expect(isNodeModules('/project/node_modules/pkg/node_modules/dep')).toBe(
        true,
      )
    })
  })

  describe('splitPath', () => {
    it('should split Unix paths', () => {
      expect(splitPath('/usr/local/bin')).toEqual(['', 'usr', 'local', 'bin'])
      expect(splitPath('/home/user/file.txt')).toEqual([
        '',
        'home',
        'user',
        'file.txt',
      ])
    })

    it('should split Windows paths', () => {
      expect(splitPath('C:\\Users\\user')).toContain('Users')
      expect(splitPath('D:\\projects\\app')).toContain('projects')
    })

    it('should split relative paths', () => {
      expect(splitPath('./src/index.ts')).toContain('src')
      expect(splitPath('../lib/utils')).toContain('lib')
    })

    it('should handle single segment', () => {
      expect(splitPath('file.txt')).toEqual(['file.txt'])
    })

    it('should handle empty string', () => {
      expect(splitPath('')).toEqual([])
    })

    it('should handle root path', () => {
      expect(splitPath('/')).toEqual(['', ''])
    })

    it('should handle Buffer input', () => {
      const result = splitPath(Buffer.from('/usr/local'))
      expect(result).toContain('usr')
      expect(result).toContain('local')
    })

    it('should handle mixed slashes', () => {
      const result = splitPath('C:\\Users/user\\file')
      expect(result).toContain('C:')
      expect(result).toContain('Users')
      expect(result).toContain('user')
    })

    it('should handle trailing slashes', () => {
      const result = splitPath('/usr/local/')
      expect(result).toContain('usr')
      expect(result).toContain('local')
    })
  })

  describe('trimLeadingDotSlash', () => {
    it('should trim ./ prefix', () => {
      expect(trimLeadingDotSlash('./src/index.ts')).toBe('src/index.ts')
      expect(trimLeadingDotSlash('./lib/utils')).toBe('lib/utils')
    })

    it('should trim .\\ prefix on Windows', () => {
      expect(trimLeadingDotSlash('.\\src\\index.ts')).toBe('src\\index.ts')
    })

    it('should not trim ../ prefix', () => {
      expect(trimLeadingDotSlash('../lib/utils')).toBe('../lib/utils')
    })

    it('should not trim absolute paths', () => {
      expect(trimLeadingDotSlash('/usr/local')).toBe('/usr/local')
      expect(trimLeadingDotSlash('C:\\Users')).toBe('C:\\Users')
    })

    it('should not trim paths without ./ prefix', () => {
      expect(trimLeadingDotSlash('src/index.ts')).toBe('src/index.ts')
    })

    it('should handle empty string', () => {
      expect(trimLeadingDotSlash('')).toBe('')
    })

    it('should handle just dot', () => {
      expect(trimLeadingDotSlash('.')).toBe('.')
    })

    it('should handle Buffer input', () => {
      expect(trimLeadingDotSlash(Buffer.from('./src/file'))).toBe('src/file')
    })

    it('should handle URL input', () => {
      const url = new URL('file://./src/file', 'file:///')
      const result = trimLeadingDotSlash(url)
      expect(typeof result).toBe('string')
    })
  })

  describe('pathLikeToString', () => {
    it('should convert string to string', () => {
      expect(pathLikeToString('/usr/local')).toBe('/usr/local')
    })

    it('should convert Buffer to string', () => {
      const buffer = Buffer.from('/usr/local')
      expect(pathLikeToString(buffer)).toBe('/usr/local')
    })

    it('should convert URL to string', () => {
      const url = new URL('file:///usr/local')
      const result = pathLikeToString(url)
      expect(typeof result).toBe('string')
      expect(result).toContain('usr/local')
    })

    it('should handle empty string', () => {
      expect(pathLikeToString('')).toBe('')
    })

    it('should handle Buffer with UTF-8', () => {
      const buffer = Buffer.from('tëst/pâth', 'utf8')
      expect(pathLikeToString(buffer)).toBe('tëst/pâth')
    })
  })

  describe('relativeResolve', () => {
    it('should resolve paths', () => {
      // relativeResolve uses path.resolve so results depend on cwd
      const result = relativeResolve('/usr/local', 'bin')
      expect(typeof result).toBe('string')
      expect(result).toBeTruthy()
    })

    it('should handle different path combinations', () => {
      expect(typeof relativeResolve('/usr/local', './bin')).toBe('string')
      expect(typeof relativeResolve('/usr/local/bin', '../lib')).toBe('string')
      expect(typeof relativeResolve('/usr/local', '/usr/bin')).toBe('string')
    })

    it('should handle relative paths', () => {
      const result1 = relativeResolve('/a/b/c', '../d')
      const result2 = relativeResolve('/a/b/c', './d')
      expect(typeof result1).toBe('string')
      expect(typeof result2).toBe('string')
    })

    it('should normalize output paths', () => {
      const result = relativeResolve('/usr/local', 'bin')
      // Result should not contain backslashes
      expect(result.includes('\\\\')).toBe(false)
    })

    it('returns empty string when from and to resolve to the same path', () => {
      // After path.resolve, identical inputs are exactly equal —
      // the same-path early return fires.
      const result = relativeResolve('/foo/bar', '/foo/bar')
      expect(result).toBe('')
    })

    it('returns empty string when paths normalize to the same target', () => {
      // resolve() collapses trailing-slash and "." segments — the
      // post-resolve same-path branch fires.
      const result = relativeResolve('/foo/bar', '/foo/bar/.')
      expect(result).toBe('')
    })

    it('returns empty for trailing-slash normalization', () => {
      const result = relativeResolve('/foo/bar/', '/foo/bar')
      expect(result).toBe('')
    })

    it('returns descendant path when from is the root and to is a child', () => {
      // from='/'; to='/foo/bar' → 'foo/bar' (the i===0 destination-longer branch)
      const result = relativeResolve('/', '/foo/bar')
      expect(result).toBe('foo/bar')
    })

    it('returns ../.. when from is a descendant and to is the root', () => {
      // from='/foo/bar'; to='/' → '../..' (the i===0 source-longer branch)
      const result = relativeResolve('/foo/bar', '/')
      expect(result).toBe('../..')
    })

    it('returns base segment when from is exact ancestor of to', () => {
      // from='/foo/bar'; to='/foo/bar/baz' → 'baz' (separator-following branch)
      const result = relativeResolve('/foo/bar', '/foo/bar/baz')
      expect(result).toBe('baz')
    })

    it('returns .. when to is exact ancestor of from', () => {
      // from='/foo/bar/baz'; to='/foo/bar' → '..' (separator-after-last-common)
      const result = relativeResolve('/foo/bar/baz', '/foo/bar')
      expect(result).toBe('..')
    })
  })

  describe('Edge cases', () => {
    it('should handle very long paths', () => {
      const longPath = `/usr/${'a/'.repeat(100)}file.txt`
      expect(normalizePath(longPath)).toContain('usr')
      expect(isAbsolute(longPath)).toBe(true)
    })

    it('should handle paths with special characters', () => {
      expect(normalizePath('/usr/local/file (1).txt')).toContain('file (1)')
      expect(isAbsolute('/usr/local/@types')).toBe(true)
    })

    it('should handle Unicode in paths', () => {
      expect(normalizePath('/usr/tëst/文件.txt')).toContain('tëst')
      expect(splitPath('/usr/tëst/文件.txt')).toContain('tëst')
    })

    it('should handle URLs with query strings', () => {
      const url = new URL('file:///usr/local?query=value')
      expect(isPath(url)).toBe(true)
    })

    it('should handle Windows drive letters A-Z', () => {
      // Windows drive letters are only recognized as absolute on Windows.
      expect(isAbsolute('A:\\path')).toBe(WIN32)
      expect(isAbsolute('Z:\\path')).toBe(WIN32)
      expect(isAbsolute('a:\\path')).toBe(WIN32)
      expect(isAbsolute('z:\\path')).toBe(WIN32)
    })

    it('should handle multiple consecutive slashes correctly', () => {
      expect(splitPath('//usr//local///bin')).toContain('usr')
      expect(splitPath('//usr//local///bin')).toContain('local')
    })
  })
})
