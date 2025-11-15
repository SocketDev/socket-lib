/**
 * @fileoverview Unit tests for argument quoting utilities.
 *
 * Tests quoting functions for shell execution with spawn():
 * - win32Quote() for Windows cmd.exe (double quotes, escape by doubling)
 * - posixQuote() for POSIX shells (single quotes, escape as '\''
 * - Tests special character handling and edge cases
 * - Only needed when shell: true (with shell: false, no quoting needed)
 */

import { posixQuote, win32Quote } from '@socketsecurity/lib/argv/quote'
import { describe, expect, it } from 'vitest'

describe('argv/quote', () => {
  describe('win32Quote', () => {
    it('should return unquoted string when no special characters present', () => {
      expect(win32Quote('simple')).toBe('simple')
      expect(win32Quote('path/to/file')).toBe('path/to/file')
      expect(win32Quote('C:\\simple\\path')).toBe('C:\\simple\\path')
    })

    it('should quote paths with spaces', () => {
      expect(win32Quote('C:\\Program Files\\app.exe')).toBe(
        '"C:\\Program Files\\app.exe"',
      )
      expect(win32Quote('path with spaces')).toBe('"path with spaces"')
    })

    it('should quote strings with ampersands', () => {
      expect(win32Quote('foo&bar')).toBe('"foo&bar"')
    })

    it('should quote strings with pipes', () => {
      expect(win32Quote('foo|bar')).toBe('"foo|bar"')
    })

    it('should quote strings with redirects', () => {
      expect(win32Quote('foo<bar')).toBe('"foo<bar"')
      expect(win32Quote('foo>bar')).toBe('"foo>bar"')
    })

    it('should quote strings with carets', () => {
      expect(win32Quote('foo^bar')).toBe('"foo^bar"')
    })

    it('should quote strings with percent signs', () => {
      expect(win32Quote('foo%bar')).toBe('"foo%bar"')
    })

    it('should quote strings with parentheses', () => {
      expect(win32Quote('foo(bar)')).toBe('"foo(bar)"')
    })

    it('should quote strings with exclamation marks', () => {
      expect(win32Quote('foo!bar')).toBe('"foo!bar"')
    })

    it('should escape internal double quotes by doubling them', () => {
      expect(win32Quote('foo"bar')).toBe('"foo""bar"')
      expect(win32Quote('C:\\Program Files\\"quoted"\\app.exe')).toBe(
        '"C:\\Program Files\\""quoted""\\app.exe"',
      )
    })

    it('should handle multiple special characters', () => {
      expect(win32Quote('foo & bar | baz')).toBe('"foo & bar | baz"')
      expect(win32Quote('C:\\Program Files\\app (x86)\\tool.exe')).toBe(
        '"C:\\Program Files\\app (x86)\\tool.exe"',
      )
    })

    it('should handle empty string', () => {
      expect(win32Quote('')).toBe('')
    })

    it('should handle string with only special characters', () => {
      expect(win32Quote('&|<>^%()')).toBe('"&|<>^%()"')
    })
  })

  describe('posixQuote', () => {
    it('should return unquoted string when no special characters present', () => {
      expect(posixQuote('simple')).toBe('simple')
      expect(posixQuote('path/to/file')).toBe('path/to/file')
      expect(posixQuote('/usr/local/bin')).toBe('/usr/local/bin')
    })

    it('should quote paths with spaces', () => {
      expect(posixQuote('/path/with spaces/file.txt')).toBe(
        "'/path/with spaces/file.txt'",
      )
      expect(posixQuote('path with spaces')).toBe("'path with spaces'")
    })

    it('should quote strings with ampersands', () => {
      expect(posixQuote('foo&bar')).toBe("'foo&bar'")
    })

    it('should quote strings with pipes', () => {
      expect(posixQuote('foo|bar')).toBe("'foo|bar'")
    })

    it('should quote strings with redirects', () => {
      expect(posixQuote('foo<bar')).toBe("'foo<bar'")
      expect(posixQuote('foo>bar')).toBe("'foo>bar'")
    })

    it('should quote strings with dollar signs', () => {
      expect(posixQuote('foo$bar')).toBe("'foo$bar'")
      expect(posixQuote('$HOME/bin')).toBe("'$HOME/bin'")
    })

    it('should quote strings with backticks', () => {
      expect(posixQuote('foo`bar`')).toBe("'foo`bar`'")
    })

    it('should quote strings with backslashes', () => {
      expect(posixQuote('foo\\bar')).toBe("'foo\\bar'")
    })

    it('should quote strings with wildcards', () => {
      expect(posixQuote('*.txt')).toBe("'*.txt'")
      expect(posixQuote('test?.log')).toBe("'test?.log'")
    })

    it('should quote strings with brackets', () => {
      expect(posixQuote('foo[bar]')).toBe("'foo[bar]'")
      expect(posixQuote('foo{bar}')).toBe("'foo{bar}'")
      expect(posixQuote('foo(bar)')).toBe("'foo(bar)'")
    })

    it('should quote strings with semicolons', () => {
      expect(posixQuote('foo;bar')).toBe("'foo;bar'")
    })

    it('should quote strings with quotes', () => {
      expect(posixQuote('foo"bar"')).toBe('\'foo"bar"\'')
    })

    it('should quote strings with tildes', () => {
      expect(posixQuote('~/bin')).toBe("'~/bin'")
    })

    it('should quote strings with exclamation marks', () => {
      expect(posixQuote('foo!bar')).toBe("'foo!bar'")
    })

    it('should quote strings with hash symbols', () => {
      expect(posixQuote('foo#bar')).toBe("'foo#bar'")
    })

    it("should escape internal single quotes using '\\''", () => {
      // "it's" becomes 'it'\''s' which the shell parses as: 'it' + \' + 's'
      expect(posixQuote("it's")).toBe("'it'\\''s'")
      expect(posixQuote("don't")).toBe("'don'\\''t'")
      expect(posixQuote("/path/with'quote/file.txt")).toBe(
        "'/path/with'\\''quote/file.txt'",
      )
    })

    it('should handle multiple single quotes', () => {
      expect(posixQuote("it's a 'test'")).toBe("'it'\\''s a '\\''test'\\'''")
    })

    it('should handle multiple special characters', () => {
      expect(posixQuote('foo & bar | baz')).toBe("'foo & bar | baz'")
      expect(posixQuote('$HOME/bin/*.sh')).toBe("'$HOME/bin/*.sh'")
    })

    it('should handle empty string', () => {
      expect(posixQuote('')).toBe('')
    })

    it('should handle string with only special characters', () => {
      expect(posixQuote('&|<>$`\\*?[](){};"\'~!#')).toBe(
        "'&|<>$`\\*?[](){};\"'\\''~!#'",
      )
    })
  })

  describe('cross-platform scenarios', () => {
    it('should handle typical patch file paths on Windows', () => {
      const patchPath =
        'C:\\Program Files\\Socket\\patches\\fix-v8-headers.patch'
      expect(win32Quote(patchPath)).toBe(
        '"C:\\Program Files\\Socket\\patches\\fix-v8-headers.patch"',
      )
    })

    it('should handle typical patch file paths on Unix', () => {
      const patchPath = '/tmp/test with spaces/fix-v8-headers.patch'
      expect(posixQuote(patchPath)).toBe(
        "'/tmp/test with spaces/fix-v8-headers.patch'",
      )
    })

    it('should handle paths with no special characters on both platforms', () => {
      const simplePath = '/usr/local/bin/tool'
      expect(win32Quote(simplePath)).toBe(simplePath)
      expect(posixQuote(simplePath)).toBe(simplePath)
    })
  })

  describe('edge cases', () => {
    it('should handle very long paths', () => {
      // Long path with spaces to trigger quoting
      const longPath = `C:\\Program Files\\${'very\\'.repeat(50)}long path\\file.txt`
      const quotedWin32 = win32Quote(longPath)
      expect(quotedWin32.startsWith('"')).toBe(true)
      expect(quotedWin32.endsWith('"')).toBe(true)

      const longUnixPath = `/${'very/'.repeat(50)}long/path/file.txt`
      expect(posixQuote(longUnixPath)).toBe(longUnixPath) // No special chars
    })

    it('should handle paths with consecutive spaces', () => {
      expect(win32Quote('path  with   spaces')).toBe('"path  with   spaces"')
      expect(posixQuote('path  with   spaces')).toBe("'path  with   spaces'")
    })

    it('should handle paths with leading/trailing spaces', () => {
      expect(win32Quote(' path ')).toBe('" path "')
      expect(posixQuote(' path ')).toBe("' path '")
    })

    it('should handle Unicode characters', () => {
      expect(win32Quote('文件.txt')).toBe('文件.txt')
      expect(posixQuote('文件.txt')).toBe('文件.txt')
      expect(win32Quote('файл with spaces.txt')).toBe('"файл with spaces.txt"')
      expect(posixQuote('файл with spaces.txt')).toBe("'файл with spaces.txt'")
    })

    it('should handle paths with newlines (edge case)', () => {
      // Newlines are whitespace (\s), so they trigger quoting on both platforms
      expect(win32Quote('foo\nbar')).toBe('"foo\nbar"')
      expect(posixQuote('foo\nbar')).toBe("'foo\nbar'")
    })

    it('should handle paths with tabs (edge case)', () => {
      // Tabs are whitespace (\s), so they trigger quoting on both platforms
      expect(win32Quote('foo\tbar')).toBe('"foo\tbar"')
      expect(posixQuote('foo\tbar')).toBe("'foo\tbar'")
    })
  })

  describe('real-world scenarios', () => {
    it('should handle Windows Program Files paths', () => {
      expect(win32Quote('C:\\Program Files\\Git\\bin\\git.exe')).toBe(
        '"C:\\Program Files\\Git\\bin\\git.exe"',
      )
      expect(win32Quote('C:\\Program Files (x86)\\Node.js\\node.exe')).toBe(
        '"C:\\Program Files (x86)\\Node.js\\node.exe"',
      )
    })

    it('should handle Unix home directory paths with spaces', () => {
      expect(posixQuote('/home/user/My Documents/file.txt')).toBe(
        "'/home/user/My Documents/file.txt'",
      )
    })

    it('should handle project paths with special characters', () => {
      expect(win32Quote('C:\\Users\\Dev\\Projects (2024)\\app.exe')).toBe(
        '"C:\\Users\\Dev\\Projects (2024)\\app.exe"',
      )
      expect(posixQuote('/home/dev/projects-2024/app.sh')).toBe(
        '/home/dev/projects-2024/app.sh',
      )
    })

    it('should handle temporary file paths', () => {
      expect(
        win32Quote('C:\\Users\\user\\AppData\\Local\\Temp\\file.txt'),
      ).toBe('C:\\Users\\user\\AppData\\Local\\Temp\\file.txt')
      expect(posixQuote('/tmp/build-12345/output.log')).toBe(
        '/tmp/build-12345/output.log',
      )
    })
  })
})
