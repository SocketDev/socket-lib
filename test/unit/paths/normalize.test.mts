/**
 * @fileoverview Unit tests for path normalization and manipulation utilities.
 *
 * Tests cross-platform path utilities:
 * - normalizePath() converts paths to forward slashes
 * - isAbsolute() detects absolute paths (Unix/Windows)
 * - isRelative() detects relative paths
 * - isPath() validates path-like inputs
 * - isNodeModules() detects node_modules paths
 * - splitPath() splits paths into segments
 * - trimLeadingDotSlash() removes ./ prefix
 * - pathLikeToString() converts Buffer/URL to string
 * - relativeResolve() resolves relative paths
 * - toUnixPath() converts Windows paths to Unix-style POSIX paths for Git Bash tools
 * Used throughout Socket tools for cross-platform path handling.
 */

import { describe, expect, it } from 'vitest'
import {
  isAbsolute,
  isNodeModules,
  isPath,
  isRelative,
  normalizePath,
  pathLikeToString,
  relativeResolve,
  splitPath,
  toUnixPath,
  trimLeadingDotSlash,
} from '@socketsecurity/lib/paths/normalize'

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
  })

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
  })

  describe('toUnixPath', () => {
    const isWindows = process.platform === 'win32'

    it('should convert Windows drive letter paths with backslashes', () => {
      if (isWindows) {
        expect(toUnixPath('C:\\Users\\name\\file.txt')).toBe(
          '/c/Users/name/file.txt',
        )
        expect(toUnixPath('D:\\projects\\foo\\bar')).toBe('/d/projects/foo/bar')
      }
    })

    it('should convert Windows drive letter paths with forward slashes', () => {
      if (isWindows) {
        expect(toUnixPath('C:/Windows/System32')).toBe('/c/Windows/System32')
        expect(toUnixPath('D:/data/logs')).toBe('/d/data/logs')
      }
    })

    it('should convert uppercase drive letters to lowercase', () => {
      if (isWindows) {
        expect(toUnixPath('C:\\path')).toBe('/c/path')
        expect(toUnixPath('D:\\path')).toBe('/d/path')
        expect(toUnixPath('Z:\\path')).toBe('/z/path')
      }
    })

    it('should handle lowercase drive letters', () => {
      if (isWindows) {
        expect(toUnixPath('c:\\path')).toBe('/c/path')
        expect(toUnixPath('d:\\path')).toBe('/d/path')
      }
    })

    it('should handle mixed case drive letters', () => {
      if (isWindows) {
        expect(toUnixPath('c:\\Windows\\System32')).toBe('/c/Windows/System32')
        expect(toUnixPath('D:\\Users\\John')).toBe('/d/Users/John')
      }
    })

    it('should handle UNC paths', () => {
      if (isWindows) {
        expect(toUnixPath('\\\\server\\share\\file')).toBe(
          '//server/share/file',
        )
        expect(toUnixPath('\\\\server\\share\\path\\to\\file')).toBe(
          '//server/share/path/to/file',
        )
      }
    })

    it('should handle Unix absolute paths on Unix', () => {
      if (!isWindows) {
        expect(toUnixPath('/home/user/file')).toBe('/home/user/file')
        expect(toUnixPath('/usr/local/bin')).toBe('/usr/local/bin')
        expect(toUnixPath('/var/log/app.log')).toBe('/var/log/app.log')
      }
    })

    it('should normalize paths on Unix (collapse .., remove ./, etc)', () => {
      if (!isWindows) {
        // Verify that normalization still happens on Unix
        expect(toUnixPath('/usr/local/../bin')).toBe('/usr/bin')
        expect(toUnixPath('/usr//local///bin')).toBe('/usr/local/bin')
        expect(toUnixPath('./src/index.ts')).toBe('src/index.ts')
        expect(toUnixPath('/usr/./local/bin')).toBe('/usr/local/bin')
      }
    })

    it('should handle relative paths', () => {
      // Relative paths get normalized but don't get drive letter conversion
      const result1 = toUnixPath('./src/index.ts')
      const result2 = toUnixPath('../lib/utils')
      expect(result1).toContain('src')
      expect(result2).toContain('lib')
      // On Unix, should be unchanged. On Windows, backslashes become forward slashes
      expect(result1.includes('\\\\')).toBe(false)
      expect(result2.includes('\\\\')).toBe(false)
    })

    it('should handle Buffer input', () => {
      if (isWindows) {
        const buffer = Buffer.from('C:\\Users\\name')
        expect(toUnixPath(buffer)).toBe('/c/Users/name')
      } else {
        const buffer = Buffer.from('/usr/local')
        expect(toUnixPath(buffer)).toBe('/usr/local')
      }
    })

    it('should handle URL input', () => {
      if (isWindows) {
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
      // Empty string normalizes to '.' on all platforms (consistent with Node.js path.normalize)
      expect(toUnixPath('')).toBe('.')
    })

    it('should handle root paths', () => {
      if (!isWindows) {
        expect(toUnixPath('/')).toBe('/')
      }
    })

    it('should handle paths with spaces', () => {
      if (isWindows) {
        expect(toUnixPath('C:\\Program Files\\App')).toBe(
          '/c/Program Files/App',
        )
        expect(toUnixPath('D:\\My Documents\\file.txt')).toBe(
          '/d/My Documents/file.txt',
        )
      }
    })

    it('should handle paths with special characters', () => {
      if (isWindows) {
        expect(toUnixPath('C:\\Users\\name\\file (1).txt')).toBe(
          '/c/Users/name/file (1).txt',
        )
        expect(toUnixPath('D:\\projects\\@scope\\package')).toBe(
          '/d/projects/@scope/package',
        )
      }
    })

    it('should handle mixed separators in path', () => {
      if (isWindows) {
        expect(toUnixPath('C:\\Users/name\\file.txt')).toBe(
          '/c/Users/name/file.txt',
        )
      }
    })

    it('should handle all drive letters A-Z', () => {
      if (isWindows) {
        expect(toUnixPath('A:\\path')).toBe('/a/path')
        expect(toUnixPath('E:\\path')).toBe('/e/path')
        expect(toUnixPath('Z:\\path')).toBe('/z/path')
      }
    })

    it('should preserve path after drive letter conversion', () => {
      if (isWindows) {
        expect(toUnixPath('C:\\a\\b\\c\\d\\e\\f')).toBe('/c/a/b/c/d/e/f')
        expect(toUnixPath('D:\\projects\\socket-btm\\build\\dev')).toBe(
          '/d/projects/socket-btm/build/dev',
        )
      }
    })

    it('should handle Git Bash tar paths correctly', () => {
      // This is the primary use case: Git for Windows tar.EXE needs POSIX paths
      if (isWindows) {
        // Example from Windows CI: D:\a\socket-btm\build\dev
        expect(toUnixPath('D:\\a\\socket-btm\\build\\dev')).toBe(
          '/d/a/socket-btm/build/dev',
        )
        // tar expects /d/path not D:\path
        const result = toUnixPath('C:\\Windows\\Temp\\archive.tar.gz')
        expect(result.startsWith('/c/')).toBe(true)
        expect(result.includes('\\')).toBe(false)
      }
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
      // Windows drive letters are only recognized as absolute on Windows
      const isWindows = process.platform === 'win32'
      expect(isAbsolute('A:\\path')).toBe(isWindows)
      expect(isAbsolute('Z:\\path')).toBe(isWindows)
      expect(isAbsolute('a:\\path')).toBe(isWindows)
      expect(isAbsolute('z:\\path')).toBe(isWindows)
    })

    it('should handle multiple consecutive slashes correctly', () => {
      expect(splitPath('//usr//local///bin')).toContain('usr')
      expect(splitPath('//usr//local///bin')).toContain('local')
    })
  })
})
