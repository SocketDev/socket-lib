/**
 * @file Unit tests for cross-platform path conversion utilities:
 *
 *   - normalizePath() converts paths to forward slashes
 *   - toUnixPath() converts Windows paths to Unix-style POSIX paths for Git Bash
 *     tools
 *   - fromUnixPath() converts MSYS/Unix-style paths back to native Windows paths
 *     Predicates (isAbsolute/isRelative/isUnixPath/isPath/isNodeModules) and
 *     path manipulation
 *     (splitPath/trimLeadingDotSlash/pathLikeToString/relativeResolve) plus
 *     shared edge cases live in normalize-predicates.test.mts. Used throughout
 *     Socket tools for cross-platform path handling.
 */

import { WIN32 } from '@socketsecurity/lib-stable/constants/platform'
import { describe, expect, it } from 'vitest'

import {
  fromUnixPath,
  normalizePath,
  toUnixPath,
} from '../../../src/paths/normalize'

import { itUnixOnly, itWindowsOnly } from '../util/skip-helpers'

describe('paths/normalize', () => {
  describe('normalizePath', () => {
    it('should normalize Unix paths', () => {
      expect(normalizePath('/usr/local/bin')).toBe('/usr/local/bin')
      expect(normalizePath('/home/user/file.txt')).toBe('/home/user/file.txt')
    })

    it('should normalize Windows paths to forward slashes', () => {
      expect(normalizePath('C:\\Users\\user')).toBe('C:/Users/user')
      expect(normalizePath('D:\\projects\\app')).toBe('D:/projects/app')
    })

    it('should keep the root slash on a bare drive root', () => {
      // A drive ROOT keeps its trailing slash — `D:` alone means "current
      // directory on D:", a different location from the root `D:/`.
      expect(normalizePath('D:\\')).toBe('D:/')
      expect(normalizePath('C:/')).toBe('C:/')
    })

    it('should not add a slash to a drive-relative path', () => {
      // `D:foo` (no separator after the colon) is drive-relative, not a root.
      expect(normalizePath('D:foo')).toBe('D:foo')
    })

    it('should normalize mixed slashes', () => {
      expect(normalizePath('C:\\Users/user\\file.txt')).toBe(
        'C:/Users/user/file.txt',
      )
    })

    it('should handle relative paths', () => {
      // normalizePath trims leading ./
      expect(normalizePath('./src/index.ts')).toBe('src/index.ts')
      expect(normalizePath('../lib/utils')).toBe('../lib/utils')
    })

    it('should handle empty string', () => {
      expect(normalizePath('')).toBe('.')
    })

    it('should handle single slash', () => {
      expect(normalizePath('/')).toBe('/')
    })

    it('should handle Buffer input', () => {
      const buffer = Buffer.from('/usr/local/bin')
      expect(normalizePath(buffer)).toBe('/usr/local/bin')
    })

    it('should handle URL input', () => {
      const url = new URL('file:///usr/local/bin')
      expect(normalizePath(url)).toContain('usr/local/bin')
    })

    it('should handle paths with multiple consecutive slashes', () => {
      expect(normalizePath('/usr//local///bin')).toContain('usr')
      expect(normalizePath('/usr//local///bin')).toContain('local')
    })

    it('should handle Windows UNC paths', () => {
      const result = normalizePath('\\\\server\\share\\file')
      expect(result).toContain('server')
    })

    itWindowsOnly('should convert MSYS drive letter paths on Windows', () => {
      expect(normalizePath('/c/projects/app')).toBe('C:/projects/app')
      expect(normalizePath('/d/tools/bin')).toBe('D:/tools/bin')
      expect(normalizePath('/z/path')).toBe('Z:/path')
    })

    itWindowsOnly('should convert bare MSYS drive letter on Windows', () => {
      expect(normalizePath('/c')).toBe('C:/')
    })

    itUnixOnly('should not convert MSYS-like paths on Unix', () => {
      expect(normalizePath('/c/projects/app')).toBe('/c/projects/app')
      expect(normalizePath('/d/tools/bin')).toBe('/d/tools/bin')
    })

    itWindowsOnly('should keep forward slashes (unlike fromUnixPath)', () => {
      expect(normalizePath('/c/projects/app')).toBe('C:/projects/app')
      expect(fromUnixPath('/c/projects/app')).toBe('C:\\projects\\app')
    })
  })

  describe('fromUnixPath', () => {
    itWindowsOnly('should convert MSYS paths to native Windows format', () => {
      expect(fromUnixPath('/c/projects/app/file.txt')).toBe(
        'C:\\projects\\app\\file.txt',
      )
      expect(fromUnixPath('/d/projects/foo/bar')).toBe('D:\\projects\\foo\\bar')
    })

    itWindowsOnly('should convert lowercase drive letters to uppercase', () => {
      expect(fromUnixPath('/c/path')).toBe('C:\\path')
      expect(fromUnixPath('/d/path')).toBe('D:\\path')
      expect(fromUnixPath('/z/path')).toBe('Z:\\path')
    })

    itWindowsOnly('should handle all drive letters a-z', () => {
      expect(fromUnixPath('/a/path')).toBe('A:\\path')
      expect(fromUnixPath('/e/path')).toBe('E:\\path')
      expect(fromUnixPath('/z/path')).toBe('Z:\\path')
    })

    itWindowsOnly('should handle bare drive letter path', () => {
      expect(fromUnixPath('/c')).toBe('C:\\')
    })

    itWindowsOnly('should convert forward slashes to backslashes', () => {
      expect(fromUnixPath('C:/Windows/System32')).toBe('C:\\Windows\\System32')
    })

    itWindowsOnly('should convert non-drive paths too', () => {
      expect(fromUnixPath('/tmp/build/output')).toBe('\\tmp\\build\\output')
      expect(fromUnixPath('/usr/local/bin')).toBe('\\usr\\local\\bin')
    })

    itUnixOnly('should leave Unix paths unchanged on Unix', () => {
      expect(fromUnixPath('/tmp/build/output')).toBe('/tmp/build/output')
      expect(fromUnixPath('/usr/local/bin')).toBe('/usr/local/bin')
      expect(fromUnixPath('/c/projects/app')).toBe('/c/projects/app')
    })

    itUnixOnly('should normalize paths on Unix', () => {
      expect(fromUnixPath('/usr/local/../bin')).toBe('/usr/bin')
      expect(fromUnixPath('/usr//local///bin')).toBe('/usr/local/bin')
    })

    itUnixOnly('should handle relative paths on Unix', () => {
      expect(fromUnixPath('./src/index.ts')).toBe('src/index.ts')
      expect(fromUnixPath('../lib/utils')).toBe('../lib/utils')
    })

    itWindowsOnly('should handle relative paths on Windows', () => {
      expect(fromUnixPath('./src/index.ts')).toBe('src\\index.ts')
      expect(fromUnixPath('../lib/utils')).toBe('..\\lib\\utils')
    })

    it('should handle empty string', () => {
      expect(fromUnixPath('')).toBe('.')
    })

    itWindowsOnly('should handle paths with spaces', () => {
      expect(fromUnixPath('/c/Program Files/App')).toBe(
        'C:\\Program Files\\App',
      )
    })

    itWindowsOnly('should handle paths with special characters', () => {
      expect(fromUnixPath('/c/projects/file (1).txt')).toBe(
        'C:\\projects\\file (1).txt',
      )
      expect(fromUnixPath('/d/projects/@scope/package')).toBe(
        'D:\\projects\\@scope\\package',
      )
    })

    it('should handle Buffer input', () => {
      if (WIN32) {
        const buffer = Buffer.from('/c/projects/app')
        expect(fromUnixPath(buffer)).toBe('C:\\projects\\app')
      } else {
        const buffer = Buffer.from('/usr/local')
        expect(fromUnixPath(buffer)).toBe('/usr/local')
      }
    })

    itWindowsOnly('should be the inverse of toUnixPath on Windows', () => {
      const original = 'C:\\projects\\app\\file.txt'
      const unix = toUnixPath(original)
      const backToWindows = fromUnixPath(unix)
      expect(backToWindows).toBe(original)
    })

    itUnixOnly('should handle root path', () => {
      expect(fromUnixPath('/')).toBe('/')
    })

    itWindowsOnly('should handle root path on Windows', () => {
      expect(fromUnixPath('/')).toBe('\\')
    })
  })

  describe('toUnixPath', () => {
    itWindowsOnly(
      'should convert Windows drive letter paths with backslashes',
      () => {
        expect(toUnixPath('C:\\projects\\app\\file.txt')).toBe(
          '/c/projects/app/file.txt',
        )
        expect(toUnixPath('D:\\projects\\foo\\bar')).toBe('/d/projects/foo/bar')
      },
    )

    itWindowsOnly(
      'should convert Windows drive letter paths with forward slashes',
      () => {
        expect(toUnixPath('C:/Windows/System32')).toBe('/c/Windows/System32')
        expect(toUnixPath('D:/data/logs')).toBe('/d/data/logs')
      },
    )

    itWindowsOnly('should convert uppercase drive letters to lowercase', () => {
      expect(toUnixPath('C:\\path')).toBe('/c/path')
      expect(toUnixPath('D:\\path')).toBe('/d/path')
      expect(toUnixPath('Z:\\path')).toBe('/z/path')
    })

    itWindowsOnly('should handle lowercase drive letters', () => {
      expect(toUnixPath('c:\\path')).toBe('/c/path')
      expect(toUnixPath('d:\\path')).toBe('/d/path')
    })

    itWindowsOnly('should handle mixed case drive letters', () => {
      expect(toUnixPath('c:\\Windows\\System32')).toBe('/c/Windows/System32')
      expect(toUnixPath('D:\\projects\\app')).toBe('/d/projects/app')
    })

    itWindowsOnly('should handle UNC paths', () => {
      expect(toUnixPath('\\\\server\\share\\file')).toBe('//server/share/file')
      expect(toUnixPath('\\\\server\\share\\path\\to\\file')).toBe(
        '//server/share/path/to/file',
      )
    })

    itUnixOnly('should handle Unix absolute paths on Unix', () => {
      expect(toUnixPath('/tmp/build/output')).toBe('/tmp/build/output')
      expect(toUnixPath('/usr/local/bin')).toBe('/usr/local/bin')
      expect(toUnixPath('/var/log/app.log')).toBe('/var/log/app.log')
    })

    itUnixOnly(
      'should normalize paths on Unix (collapse .., remove ./, etc)',
      () => {
        expect(toUnixPath('/usr/local/../bin')).toBe('/usr/bin')
        expect(toUnixPath('/usr//local///bin')).toBe('/usr/local/bin')
        expect(toUnixPath('./src/index.ts')).toBe('src/index.ts')
        expect(toUnixPath('/usr/./local/bin')).toBe('/usr/local/bin')
      },
    )

    it('should handle relative paths', () => {
      const result1 = toUnixPath('./src/index.ts')
      const result2 = toUnixPath('../lib/utils')
      expect(result1).toContain('src')
      expect(result2).toContain('lib')
      expect(result1.includes('\\\\')).toBe(false)
      expect(result2.includes('\\\\')).toBe(false)
    })

    it('should handle Buffer input', () => {
      if (WIN32) {
        const buffer = Buffer.from('C:\\projects\\app')
        expect(toUnixPath(buffer)).toBe('/c/projects/app')
      } else {
        const buffer = Buffer.from('/usr/local')
        expect(toUnixPath(buffer)).toBe('/usr/local')
      }
    })

    it('should handle URL input', () => {
      if (WIN32) {
        const url = new URL('file:///C:/Windows/System32')
        const result = toUnixPath(url)
        expect(result).toContain('/c/')
        expect(result).toContain('Windows')
      } else {
        const url = new URL('file:///usr/local')
        const result = toUnixPath(url)
        expect(result).toContain('/usr/local')
      }
    })

    it('should handle empty string', () => {
      expect(toUnixPath('')).toBe('.')
    })

    itUnixOnly('should handle root paths', () => {
      expect(toUnixPath('/')).toBe('/')
    })

    itWindowsOnly('should handle paths with spaces', () => {
      expect(toUnixPath('C:\\Program Files\\App')).toBe('/c/Program Files/App')
      expect(toUnixPath('D:\\My Documents\\file.txt')).toBe(
        '/d/My Documents/file.txt',
      )
    })

    itWindowsOnly('should handle paths with special characters', () => {
      expect(toUnixPath('C:\\projects\\file (1).txt')).toBe(
        '/c/projects/file (1).txt',
      )
      expect(toUnixPath('D:\\projects\\@scope\\package')).toBe(
        '/d/projects/@scope/package',
      )
    })

    itWindowsOnly('should handle mixed separators in path', () => {
      expect(toUnixPath('C:\\projects/app\\file.txt')).toBe(
        '/c/projects/app/file.txt',
      )
    })

    itWindowsOnly('should handle all drive letters A-Z', () => {
      expect(toUnixPath('A:\\path')).toBe('/a/path')
      expect(toUnixPath('E:\\path')).toBe('/e/path')
      expect(toUnixPath('Z:\\path')).toBe('/z/path')
    })

    itWindowsOnly('should preserve path after drive letter conversion', () => {
      expect(toUnixPath('C:\\a\\b\\c\\d\\e\\f')).toBe('/c/a/b/c/d/e/f')
      expect(toUnixPath('D:\\projects\\socket-btm\\build\\dev')).toBe(
        '/d/projects/socket-btm/build/dev',
      )
    })

    itWindowsOnly('should handle MSYS/Git Bash tar paths correctly', () => {
      expect(toUnixPath('D:\\a\\socket-btm\\build\\dev')).toBe(
        '/d/a/socket-btm/build/dev',
      )
      const result = toUnixPath('C:\\Windows\\Temp\\archive.tar.gz')
      expect(result.startsWith('/c/')).toBe(true)
      expect(result.includes('\\')).toBe(false)
    })
  })
})
