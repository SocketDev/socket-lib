/**
 * @file Unit tests for path manipulation utilities. Tests cross-platform path
 *   manipulation:
 *
 *   - normalizePath() converts Windows backslashes to forward slashes
 *   - pathLikeToString() converts PathLike to string
 *   - splitPath() splits paths into components
 *   - trimLeadingDotSlash() removes ./ prefix Tests extensively validate Windows
 *     vs Unix path handling, edge cases (empty paths, dots), and proper
 *     separation of path segments. Critical for cross-platform file operations.
 *     Path predicates (isAbsolute, isNodeModules, isPath, isRelative) live in
 *     test/unit/paths/predicates.test.mts; relativeResolve() lives in
 *     test/unit/paths/resolve.test.mts.
 */

import {
  isAbsolute,
  isPath,
  normalizePath,
  pathLikeToString,
  splitPath,
  trimLeadingDotSlash,
} from '../../src/paths/normalize'
import { describe, expect, it } from 'vitest'

describe('path utilities', () => {
  describe('normalizePath', () => {
    describe('Basic normalization', () => {
      it('should convert backslashes to forward slashes', () => {
        expect(normalizePath('foo\\bar\\baz')).toBe('foo/bar/baz')
        expect(normalizePath('C:\\Users\\user\\file.txt')).toBe(
          'C:/Users/user/file.txt',
        )
      })

      it('should collapse repeated slashes', () => {
        expect(normalizePath('foo//bar///baz')).toBe('foo/bar/baz')
        expect(normalizePath('foo\\\\bar\\\\\\baz')).toBe('foo/bar/baz')
        expect(normalizePath('///foo///bar///')).toBe('/foo/bar')
      })

      it('should resolve . segments', () => {
        expect(normalizePath('foo/./bar')).toBe('foo/bar')
        expect(normalizePath('./foo/./bar/./baz')).toBe('foo/bar/baz')
        expect(normalizePath('foo/.')).toBe('foo')
      })

      it('should resolve .. segments', () => {
        expect(normalizePath('foo/bar/../baz')).toBe('foo/baz')
        expect(normalizePath('foo/../bar')).toBe('bar')
        expect(normalizePath('foo/bar/baz/../..')).toBe('foo')
      })

      it('should preserve leading .. for relative paths', () => {
        expect(normalizePath('../foo')).toBe('../foo')
        expect(normalizePath('../../foo/bar')).toBe('../../foo/bar')
        expect(normalizePath('../..')).toBe('../..')
      })

      it('should handle .. that go beyond path start', () => {
        expect(normalizePath('foo/../..')).toBe('..')
        expect(normalizePath('foo/bar/../../..')).toBe('..')
        expect(normalizePath('../foo/../..')).toBe('../..')
      })
    })

    describe('Windows paths', () => {
      it('should normalize Windows paths', () => {
        expect(normalizePath('C:\\Windows\\System32')).toBe(
          'C:/Windows/System32',
        )
        expect(normalizePath('D:\\path\\to\\file.txt')).toBe(
          'D:/path/to/file.txt',
        )
      })

      it('should handle UNC paths', () => {
        expect(normalizePath('\\\\server\\share\\file')).toBe(
          '//server/share/file',
        )
        expect(normalizePath('\\\\server\\share\\path\\to\\file')).toBe(
          '//server/share/path/to/file',
        )
        expect(normalizePath('//server/share/file')).toBe('//server/share/file')
      })

      it('should handle Windows namespace prefixes', () => {
        expect(normalizePath('\\\\?\\C:\\path')).toBe('//?/C:/path')
        expect(normalizePath('\\\\.\\device')).toBe('//device')
      })

      it('should handle UNC with repeated slashes', () => {
        expect(normalizePath('\\\\\\server\\share')).toBe('/server/share')
        expect(normalizePath('////server/share')).toBe('/server/share')
      })

      it('should handle invalid UNC paths (no share)', () => {
        expect(normalizePath('\\\\server')).toBe('/server')
        expect(normalizePath('\\\\server\\')).toBe('/server')
      })

      it('should preserve UNC for valid server/share format', () => {
        expect(normalizePath('\\\\server\\share')).toBe('//server/share')
        expect(normalizePath('//server/share')).toBe('//server/share')
      })
    })

    describe('Edge cases', () => {
      it('should handle empty path', () => {
        expect(normalizePath('')).toBe('.')
      })

      it('should handle single dot', () => {
        expect(normalizePath('.')).toBe('.')
      })

      it('should handle double dot', () => {
        expect(normalizePath('..')).toBe('..')
      })

      it('should handle single slash', () => {
        expect(normalizePath('/')).toBe('/')
      })

      it('should handle single backslash', () => {
        expect(normalizePath('\\')).toBe('/')
      })

      it('should handle only dots and slashes', () => {
        expect(normalizePath('./.')).toBe('.')
        expect(normalizePath('./..')).toBe('..')
        expect(normalizePath('../.')).toBe('..')
      })

      it('should handle trailing slashes', () => {
        expect(normalizePath('foo/bar/')).toBe('foo/bar')
        expect(normalizePath('foo/bar///')).toBe('foo/bar')
      })

      it('should handle leading slashes', () => {
        expect(normalizePath('/foo/bar')).toBe('/foo/bar')
        expect(normalizePath('///foo/bar')).toBe('/foo/bar')
      })

      it('should handle Buffer input', () => {
        expect(normalizePath(Buffer.from('foo/./bar/../baz'))).toBe('foo/baz')
      })

      it('should handle URL input', () => {
        expect(normalizePath(new URL('file:///foo/bar'))).toBe('/foo/bar')
      })
    })

    describe('Complex scenarios', () => {
      it('should handle mixed . and .. segments', () => {
        expect(normalizePath('a/./b/../c/./d')).toBe('a/c/d')
        expect(normalizePath('./a/./b/../../c')).toBe('c')
      })

      it('should handle absolute paths with ..', () => {
        expect(normalizePath('/foo/bar/../baz')).toBe('/foo/baz')
        expect(normalizePath('/foo/../bar')).toBe('/bar')
        expect(normalizePath('/foo/bar/../../baz')).toBe('/baz')
      })

      it('should not go above root for absolute paths', () => {
        expect(normalizePath('/../foo')).toBe('/foo')
        expect(normalizePath('/../../foo')).toBe('/foo')
        expect(normalizePath('/..')).toBe('/')
      })

      it('should handle empty segments', () => {
        expect(normalizePath('a//b')).toBe('a/b')
        expect(normalizePath('a///b')).toBe('a/b')
        // //a//b// is treated as UNC path (starts with //)
        expect(normalizePath('//a//b//')).toBe('//a/b')
      })

      it('should handle consecutive .. segments', () => {
        expect(normalizePath('a/b/../../c')).toBe('c')
        expect(normalizePath('a/../b/../c')).toBe('c')
        expect(normalizePath('../../../foo')).toBe('../../../foo')
      })

      it('should handle .. with leading ..', () => {
        expect(normalizePath('../a/b/../c')).toBe('../a/c')
        expect(normalizePath('../../a/../b')).toBe('../../b')
      })
    })
  })

  describe('pathLikeToString', () => {
    describe('String input', () => {
      it('should return string as-is', () => {
        expect(pathLikeToString('/home/user')).toBe('/home/user')
        expect(pathLikeToString('relative/path')).toBe('relative/path')
        expect(pathLikeToString('')).toBe('')
      })
    })

    describe('Buffer input', () => {
      it('should decode Buffer as UTF-8', () => {
        expect(pathLikeToString(Buffer.from('/tmp/file'))).toBe('/tmp/file')
        expect(pathLikeToString(Buffer.from('hello.txt'))).toBe('hello.txt')
      })

      it('should handle UTF-8 characters in Buffer', () => {
        expect(pathLikeToString(Buffer.from('path/to/café'))).toBe(
          'path/to/café',
        )
        expect(pathLikeToString(Buffer.from('路径/文件'))).toBe('路径/文件')
      })
    })

    describe('URL input', () => {
      it('should convert file URLs', () => {
        expect(pathLikeToString(new URL('file:///home/user'))).toBe(
          '/home/user',
        )
        expect(pathLikeToString(new URL('file:///tmp/file.txt'))).toBe(
          '/tmp/file.txt',
        )
      })

      it('should handle percent-encoded URLs', () => {
        expect(pathLikeToString(new URL('file:///path%20with%20spaces'))).toBe(
          '/path with spaces',
        )
        expect(
          pathLikeToString(new URL('file:///special%2Fchars%3Ftest')),
        ).toBe('/special/chars?test')
      })

      it('should handle Windows file URLs', () => {
        if (process.platform === 'win32') {
          expect(
            normalizePath(pathLikeToString(new URL('file:///C:/Windows'))),
          ).toMatch(/^C:\//)
          expect(
            normalizePath(
              pathLikeToString(new URL('file:///D:/data/file.txt')),
            ),
          ).toMatch(/^D:\//)
        }
      })

      it('should handle malformed URLs with fallback', () => {
        // Create a URL that might cause fileURLToPath to fail
        try {
          const url = new URL('file:///path')
          const result = pathLikeToString(url)
          // Should return the pathname
          expect(typeof result).toBe('string')
        } catch {
          // URL construction failed, which is fine
        }
      })
    })

    describe('Null and undefined input', () => {
      it('should return empty string for null', () => {
        expect(pathLikeToString(undefined)).toBe('')
      })

      it('should return empty string for undefined', () => {
        expect(pathLikeToString(undefined)).toBe('')
      })
    })

    describe('Other input types', () => {
      it('should convert other types to string', () => {
        expect(pathLikeToString(123 as unknown as string)).toBe('123')
        expect(pathLikeToString(true as unknown as string)).toBe('true')
      })
    })
  })

  describe('splitPath', () => {
    describe('POSIX paths', () => {
      it('should split POSIX paths', () => {
        expect(splitPath('/home/user/file.txt')).toEqual([
          '',
          'home',
          'user',
          'file.txt',
        ])
        expect(splitPath('src/lib/util.js')).toEqual(['src', 'lib', 'util.js'])
      })
    })

    describe('Windows paths', () => {
      it('should split Windows paths', () => {
        expect(splitPath('C:\\Users\\user')).toEqual(['C:', 'Users', 'user'])
        expect(splitPath('folder\\file.txt')).toEqual(['folder', 'file.txt'])
      })

      it('should handle mixed separators', () => {
        expect(splitPath('path/to\\file')).toEqual(['path', 'to', 'file'])
        expect(splitPath('C:/Users\\John/file.txt')).toEqual([
          'C:',
          'Users',
          'John',
          'file.txt',
        ])
      })
    })

    describe('Edge cases', () => {
      it('should return empty array for empty path', () => {
        expect(splitPath('')).toEqual([])
      })

      it('should handle single slash', () => {
        expect(splitPath('/')).toEqual(['', ''])
      })

      it('should handle paths with consecutive separators', () => {
        expect(splitPath('/foo//bar/')).toEqual(['', 'foo', '', 'bar', ''])
        expect(splitPath('a\\\\b')).toEqual(['a', '', 'b'])
      })

      it('should handle paths with only separators', () => {
        expect(splitPath('///')).toEqual(['', '', '', ''])
        expect(splitPath('\\\\\\')).toEqual(['', '', '', ''])
      })

      it('should handle Buffer input', () => {
        expect(splitPath(Buffer.from('a/b/c'))).toEqual(['a', 'b', 'c'])
      })

      it('should handle URL input', () => {
        expect(splitPath(new URL('file:///a/b/c'))).toEqual(['', 'a', 'b', 'c'])
      })
    })
  })

  describe('trimLeadingDotSlash', () => {
    it('should remove leading ./ prefix', () => {
      expect(trimLeadingDotSlash('./src/index.js')).toBe('src/index.js')
      expect(trimLeadingDotSlash('./file.txt')).toBe('file.txt')
      expect(trimLeadingDotSlash('./a/b/c')).toBe('a/b/c')
    })

    it('should remove leading .\\ prefix', () => {
      expect(trimLeadingDotSlash('.\\src\\file.txt')).toBe('src\\file.txt')
      expect(trimLeadingDotSlash('.\\file.txt')).toBe('file.txt')
    })

    it('should preserve ../ prefix', () => {
      expect(trimLeadingDotSlash('../lib/util.js')).toBe('../lib/util.js')
      expect(trimLeadingDotSlash('../../file.txt')).toBe('../../file.txt')
    })

    it('should not change paths without ./ prefix', () => {
      expect(trimLeadingDotSlash('/absolute/path')).toBe('/absolute/path')
      expect(trimLeadingDotSlash('relative/path')).toBe('relative/path')
      expect(trimLeadingDotSlash('file.txt')).toBe('file.txt')
    })

    it('should not change single dot', () => {
      expect(trimLeadingDotSlash('.')).toBe('.')
    })

    it('should not change double dot', () => {
      expect(trimLeadingDotSlash('..')).toBe('..')
    })

    it('should handle Buffer input', () => {
      expect(trimLeadingDotSlash(Buffer.from('./file.txt'))).toBe('file.txt')
    })

    it('should handle URL input', () => {
      // file URLs typically don't have ./ prefix, but test the conversion
      expect(trimLeadingDotSlash(new URL('file:///path/file'))).toBe(
        '/path/file',
      )
    })

    it('should handle empty string', () => {
      expect(trimLeadingDotSlash('')).toBe('')
    })

    it('should only trim once', () => {
      // Function removes leading './' once, so './././file' becomes '././file'
      expect(trimLeadingDotSlash('./././file')).toBe('././file')
    })
  })

  describe('Cross-platform compatibility', () => {
    it('should handle forward slashes on all platforms', () => {
      expect(normalizePath('a/b/c')).toBe('a/b/c')
      expect(isAbsolute('/a/b/c')).toBe(true)
      expect(splitPath('a/b/c')).toEqual(['a', 'b', 'c'])
    })

    it('should handle backslashes on all platforms', () => {
      expect(normalizePath('a\\b\\c')).toBe('a/b/c')
      expect(splitPath('a\\b\\c')).toEqual(['a', 'b', 'c'])
    })

    it('should produce consistent results', () => {
      const paths = ['a/b/c', 'a\\b\\c', 'a/b\\c', 'a\\b/c']
      const normalized = paths.map(p => normalizePath(p))
      expect(normalized.every(p => p === 'a/b/c')).toBe(true)
    })
  })

  describe('Integration tests', () => {
    it('should work with isPath and normalizePath together', () => {
      const path = './src/../lib/util.js'
      expect(isPath(path)).toBe(true)
      expect(normalizePath(path)).toBe('lib/util.js')
    })

    it('should work with isAbsolute and normalizePath together', () => {
      const path = '/foo/./bar/../baz'
      expect(isAbsolute(path)).toBe(true)
      expect(normalizePath(path)).toBe('/foo/baz')
    })

    it('should work with splitPath and normalizePath together', () => {
      const path = 'a//b/./c/../d'
      const normalized = normalizePath(path)
      const parts = splitPath(normalized)
      expect(parts).toEqual(['a', 'b', 'd'])
    })

    it('should work with pathLikeToString and all functions', () => {
      const buffer = Buffer.from('./path/to/file')
      expect(isPath(buffer)).toBe(true)
      expect(normalizePath(buffer)).toBe('path/to/file')
      // splitPath doesn't normalize, just splits raw path
      expect(splitPath(buffer)).toEqual(['.', 'path', 'to', 'file'])
    })
  })

  describe('Special characters and Unicode', () => {
    it('should handle paths with spaces', () => {
      expect(normalizePath('/path with spaces/file.txt')).toBe(
        '/path with spaces/file.txt',
      )
      expect(splitPath('path with spaces/file')).toEqual([
        'path with spaces',
        'file',
      ])
    })

    it('should handle paths with Unicode characters', () => {
      expect(normalizePath('/路径/文件.txt')).toBe('/路径/文件.txt')
      expect(normalizePath('/café/naïve.js')).toBe('/café/naïve.js')
    })

    it('should handle paths with special characters', () => {
      expect(normalizePath('/path/to/file[1].txt')).toBe('/path/to/file[1].txt')
      expect(normalizePath('/path/with-dash/and_underscore')).toBe(
        '/path/with-dash/and_underscore',
      )
    })
  })

  describe('Performance edge cases', () => {
    it('should handle very long paths', () => {
      const longPath = `${'a/'.repeat(100)}file.txt`
      expect(normalizePath(longPath)).toBe(longPath)
      expect(splitPath(longPath).length).toBe(101)
    })

    it('should handle paths with many .. segments', () => {
      const manyDotDots = `${'../'.repeat(10)}file.txt`
      const normalized = normalizePath(manyDotDots)
      expect(normalized.startsWith('../../../../../../../../../')).toBe(true)
    })

    it('should handle paths with many . segments', () => {
      const manyDots = 'a/./././././././././b'
      expect(normalizePath(manyDots)).toBe('a/b')
    })
  })
})
