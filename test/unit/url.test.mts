/**
 * @file Unit tests for URL parsing and validation utilities:
 *
 *   - isUrl() validates URL strings
 *   - isLoopbackHost() / isPrivateHost() classify a hostname for SSRF guards
 *   - parseUrl() parses URLs with error handling
 *   - createRelativeUrl() constructs relative URLs Used by Socket tools for API
 *     URL construction.
 */

import { createRelativeUrl, parseUrl } from '../../src/url/parse'
import { isLoopbackHost, isPrivateHost, isUrl } from '../../src/url/predicates'
import { describe, expect, it } from 'vitest'

describe('url', () => {
  describe('isUrl', () => {
    it('should return true for valid HTTP URLs', () => {
      expect(isUrl('http://example.com')).toBe(true)
      expect(isUrl('https://example.com')).toBe(true)
      expect(isUrl('https://example.com/path')).toBe(true)
      expect(isUrl('https://example.com/path?query=1')).toBe(true)
    })

    it('should return true for valid URL objects', () => {
      const url = new URL('https://example.com')
      expect(isUrl(url)).toBe(true)
    })

    it('should return true for file URLs', () => {
      expect(isUrl('file:///path/to/file')).toBe(true)
    })

    it('should return true for various protocols', () => {
      expect(isUrl('ftp://example.com')).toBe(true)
      expect(isUrl('ws://example.com')).toBe(true)
      expect(isUrl('wss://example.com')).toBe(true)
    })

    it('should return false for invalid URLs', () => {
      expect(isUrl('not a url')).toBe(false)
      expect(isUrl('http://')).toBe(false)
      expect(isUrl('://missing-protocol')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isUrl('')).toBe(false)
    })

    it('should return false for null', () => {
      expect(isUrl(undefined)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isUrl(undefined)).toBe(false)
    })

    it('should return false for relative URLs without base', () => {
      expect(isUrl('/path/to/resource')).toBe(false)
      expect(isUrl('./relative')).toBe(false)
      expect(isUrl('../relative')).toBe(false)
    })

    it('should handle URLs with special characters', () => {
      expect(isUrl('https://example.com/path%20with%20spaces')).toBe(true)
      expect(isUrl('https://example.com/path?q=hello%20world')).toBe(true)
    })

    it('should handle URLs with authentication', () => {
      expect(isUrl('https://user:pass@example.com')).toBe(true)
    })

    it('should handle URLs with ports', () => {
      expect(isUrl('https://example.com:8080')).toBe(true)
      expect(isUrl('http://localhost:3000')).toBe(true)
    })

    it('should handle URLs with fragments', () => {
      expect(isUrl('https://example.com#section')).toBe(true)
      expect(isUrl('https://example.com/path#section')).toBe(true)
    })
  })

  describe('parseUrl', () => {
    it('should parse valid HTTP URLs', () => {
      const url = parseUrl('https://example.com/path')
      expect(url).toBeInstanceOf(URL)
      expect(url?.href).toBe('https://example.com/path')
      expect(url?.protocol).toBe('https:')
      expect(url?.hostname).toBe('example.com')
      expect(url?.pathname).toBe('/path')
    })

    it('should parse URL objects', () => {
      const input = new URL('https://example.com')
      const url = parseUrl(input)
      expect(url).toBeInstanceOf(URL)
      expect(url?.href).toBe('https://example.com/')
    })

    it('should parse URLs with query parameters', () => {
      const url = parseUrl('https://example.com?foo=bar&baz=qux')
      expect(url?.search).toBe('?foo=bar&baz=qux')
      expect(url?.searchParams.get('foo')).toBe('bar')
      expect(url?.searchParams.get('baz')).toBe('qux')
    })

    it('should parse URLs with fragments', () => {
      const url = parseUrl('https://example.com#section')
      expect(url?.hash).toBe('#section')
    })

    it('should parse URLs with ports', () => {
      const url = parseUrl('https://example.com:8080')
      expect(url?.port).toBe('8080')
    })

    it('should parse URLs with authentication', () => {
      const url = parseUrl('https://user:pass@example.com')
      expect(url?.username).toBe('user')
      expect(url?.password).toBe('pass')
    })

    it('should return undefined for invalid URLs', () => {
      expect(parseUrl('not a url')).toBeUndefined()
      expect(parseUrl('http://')).toBeUndefined()
      expect(parseUrl('/relative/path')).toBeUndefined()
    })

    it('should parse file URLs', () => {
      const url = parseUrl('file:///path/to/file')
      expect(url?.protocol).toBe('file:')
      expect(url?.pathname).toBe('/path/to/file')
    })

    it('should parse data URLs', () => {
      const url = parseUrl('data:text/plain;base64,SGVsbG8=')
      expect(url?.protocol).toBe('data:')
    })
  })

  describe('createRelativeUrl', () => {
    it('should create relative URL by removing leading slash', () => {
      expect(createRelativeUrl('/path/to/resource')).toBe('path/to/resource')
    })

    it('should handle path without leading slash', () => {
      expect(createRelativeUrl('path/to/resource')).toBe('path/to/resource')
    })

    it('should prepend base URL when provided', () => {
      expect(createRelativeUrl('/path', { base: 'https://example.com' })).toBe(
        'https://example.com/path',
      )
    })

    it('should add trailing slash to base if missing', () => {
      expect(createRelativeUrl('/path', { base: 'https://example.com' })).toBe(
        'https://example.com/path',
      )
      expect(createRelativeUrl('/path', { base: 'https://example.com/' })).toBe(
        'https://example.com/path',
      )
    })

    it('should handle empty path', () => {
      expect(createRelativeUrl('')).toBe('')
      expect(createRelativeUrl('', { base: 'https://example.com' })).toBe(
        'https://example.com/',
      )
    })

    it('should handle root path', () => {
      expect(createRelativeUrl('/')).toBe('')
      expect(createRelativeUrl('/', { base: 'https://example.com' })).toBe(
        'https://example.com/',
      )
    })

    it('should handle complex paths', () => {
      expect(createRelativeUrl('/path/to/resource?query=1#hash')).toBe(
        'path/to/resource?query=1#hash',
      )
    })

    it('should work with base URLs that have paths', () => {
      expect(
        createRelativeUrl('/resource', { base: 'https://example.com/api' }),
      ).toBe('https://example.com/api/resource')
    })

    it('should handle empty base option', () => {
      expect(createRelativeUrl('/path', { base: '' })).toBe('path')
    })
  })

  describe('isLoopbackHost', () => {
    it('should return true for loopback hostnames', () => {
      expect(isLoopbackHost('localhost')).toBe(true)
      expect(isLoopbackHost('127.0.0.1')).toBe(true)
      expect(isLoopbackHost('::1')).toBe(true)
    })

    it('should be case-insensitive', () => {
      expect(isLoopbackHost('LOCALHOST')).toBe(true)
      expect(isLoopbackHost('LocalHost')).toBe(true)
    })

    it('should return false for public hosts', () => {
      expect(isLoopbackHost('example.com')).toBe(false)
      expect(isLoopbackHost('8.8.8.8')).toBe(false)
    })

    it('should return false for other private ranges that are not loopback', () => {
      expect(isLoopbackHost('10.0.0.1')).toBe(false)
      expect(isLoopbackHost('192.168.1.1')).toBe(false)
    })
  })

  describe('isPrivateHost', () => {
    it('should return true for loopback hosts', () => {
      expect(isPrivateHost('localhost')).toBe(true)
      expect(isPrivateHost('127.0.0.1')).toBe(true)
      expect(isPrivateHost('::1')).toBe(true)
    })

    it('should return true for RFC 1918 IPv4 ranges', () => {
      expect(isPrivateHost('10.0.0.5')).toBe(true)
      expect(isPrivateHost('172.16.0.1')).toBe(true)
      expect(isPrivateHost('172.31.255.254')).toBe(true)
      expect(isPrivateHost('192.168.1.1')).toBe(true)
    })

    it('should return true for link-local and cloud-metadata ranges', () => {
      expect(isPrivateHost('169.254.169.254')).toBe(true)
      expect(isPrivateHost('0.0.0.0')).toBe(true)
    })

    it('should return true for IPv6 loopback, ULA, and link-local', () => {
      expect(isPrivateHost('fc00::1')).toBe(true)
      expect(isPrivateHost('fd12:3456::1')).toBe(true)
      expect(isPrivateHost('fe80::1')).toBe(true)
    })

    it('should be case-insensitive for IPv6', () => {
      expect(isPrivateHost('FE80::1')).toBe(true)
      expect(isPrivateHost('FC00::1')).toBe(true)
    })

    it('should return false for public hosts', () => {
      expect(isPrivateHost('example.com')).toBe(false)
      expect(isPrivateHost('8.8.8.8')).toBe(false)
      expect(isPrivateHost('1.1.1.1')).toBe(false)
    })

    it('should not flag public 172.x outside the 16-31 second octet', () => {
      expect(isPrivateHost('172.15.0.1')).toBe(false)
      expect(isPrivateHost('172.32.0.1')).toBe(false)
    })
  })
})
