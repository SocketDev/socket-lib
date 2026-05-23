/**
 * @file Unit tests for URL parsing and validation utilities. Tests URL
 *   manipulation and query parameter utilities:
 *
 *   - isUrl() validates URL strings
 *   - parseUrl() parses URLs with error handling
 *   - createRelativeUrl() constructs relative URLs
 *   - urlSearchParamsAs_() typed query parameter extractors (String, Number,
 *     Boolean, Array)
 *   - urlSearchParamsGet_() URLSearchParams helper methods Used by Socket tools
 *     for API URL construction and query parameter parsing.
 */

import { createRelativeUrl, parseUrl } from '../../src/url/parse'
import { isUrl } from '../../src/url/predicates'
import {
  urlSearchParamsAsArray,
  urlSearchParamsAsBoolean,
  urlSearchParamsAsNumber,
  urlSearchParamsAsString,
  urlSearchParamsGetArray,
  urlSearchParamsGetBoolean,
} from '../../src/url/search-params'
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

  describe('urlSearchParamsAsArray', () => {
    it('should split comma-separated values', () => {
      expect(urlSearchParamsAsArray('foo,bar,baz')).toEqual([
        'foo',
        'bar',
        'baz',
      ])
    })

    it('should trim whitespace from values', () => {
      expect(urlSearchParamsAsArray('foo, bar, baz')).toEqual([
        'foo',
        'bar',
        'baz',
      ])
      expect(urlSearchParamsAsArray(' foo , bar , baz ')).toEqual([
        'foo',
        'bar',
        'baz',
      ])
    })

    it('should filter out empty values', () => {
      expect(urlSearchParamsAsArray('foo,,bar')).toEqual(['foo', 'bar'])
      expect(urlSearchParamsAsArray('foo, , bar')).toEqual(['foo', 'bar'])
    })

    it('should return empty array for null', () => {
      expect(urlSearchParamsAsArray(undefined)).toEqual([])
    })

    it('should return empty array for undefined', () => {
      expect(urlSearchParamsAsArray(undefined)).toEqual([])
    })

    it('should return empty array for empty string', () => {
      expect(urlSearchParamsAsArray('')).toEqual([])
    })

    it('should return empty array for whitespace-only string', () => {
      expect(urlSearchParamsAsArray('   ')).toEqual([])
    })

    it('should handle single value', () => {
      expect(urlSearchParamsAsArray('foo')).toEqual(['foo'])
    })

    it('should handle values with spaces but no commas', () => {
      expect(urlSearchParamsAsArray('foo bar')).toEqual(['foo bar'])
    })
  })

  describe('urlSearchParamsAsBoolean', () => {
    it('should return true for "true" string', () => {
      expect(urlSearchParamsAsBoolean('true')).toBe(true)
      expect(urlSearchParamsAsBoolean('TRUE')).toBe(true)
      expect(urlSearchParamsAsBoolean('True')).toBe(true)
    })

    it('should return true for "1" string', () => {
      expect(urlSearchParamsAsBoolean('1')).toBe(true)
    })

    it('should return false for "false" string', () => {
      expect(urlSearchParamsAsBoolean('false')).toBe(false)
      expect(urlSearchParamsAsBoolean('FALSE')).toBe(false)
    })

    it('should return false for "0" string', () => {
      expect(urlSearchParamsAsBoolean('0')).toBe(false)
    })

    it('accepts the same truthy vocabulary as envAsBoolean', () => {
      // Expanded set so callers get consistent behavior across env vars
      // and query strings: '1' | 'true' | 'yes' | 'on' (case-insensitive).
      expect(urlSearchParamsAsBoolean('yes')).toBe(true)
      expect(urlSearchParamsAsBoolean('Yes')).toBe(true)
      expect(urlSearchParamsAsBoolean('on')).toBe(true)
      expect(urlSearchParamsAsBoolean('hello')).toBe(false)
      expect(urlSearchParamsAsBoolean('no')).toBe(false)
    })

    it('should return default value for null', () => {
      expect(urlSearchParamsAsBoolean(undefined)).toBe(false)
      expect(urlSearchParamsAsBoolean(undefined, { defaultValue: true })).toBe(
        true,
      )
    })

    it('should return default value for undefined', () => {
      expect(urlSearchParamsAsBoolean(undefined)).toBe(false)
      expect(urlSearchParamsAsBoolean(undefined, { defaultValue: true })).toBe(
        true,
      )
    })

    it('should trim whitespace before checking', () => {
      expect(urlSearchParamsAsBoolean(' true ')).toBe(true)
      expect(urlSearchParamsAsBoolean(' 1 ')).toBe(true)
      expect(urlSearchParamsAsBoolean(' false ')).toBe(false)
    })

    it('should handle empty string as false', () => {
      expect(urlSearchParamsAsBoolean('')).toBe(false)
    })

    it('should use custom default value', () => {
      expect(urlSearchParamsAsBoolean(undefined, { defaultValue: true })).toBe(
        true,
      )
      expect(urlSearchParamsAsBoolean(undefined, { defaultValue: true })).toBe(
        true,
      )
    })
  })

  describe('urlSearchParamsGetArray', () => {
    it('should get multiple values for same key', () => {
      const params = new URLSearchParams()
      params.append('tags', 'foo')
      params.append('tags', 'bar')
      params.append('tags', 'baz')
      expect(urlSearchParamsGetArray(params, 'tags')).toEqual([
        'foo',
        'bar',
        'baz',
      ])
    })

    it('should split comma-separated single value', () => {
      const params = new URLSearchParams('tags=foo,bar,baz')
      expect(urlSearchParamsGetArray(params, 'tags')).toEqual([
        'foo',
        'bar',
        'baz',
      ])
    })

    it('should not split when multiple values exist', () => {
      const params = new URLSearchParams()
      params.append('tags', 'foo,bar')
      params.append('tags', 'baz')
      expect(urlSearchParamsGetArray(params, 'tags')).toEqual([
        'foo,bar',
        'baz',
      ])
    })

    it('should return empty array for missing key', () => {
      const params = new URLSearchParams('foo=bar')
      expect(urlSearchParamsGetArray(params, 'missing')).toEqual([])
    })

    it('should return empty array for null params', () => {
      expect(urlSearchParamsGetArray(undefined, 'key')).toEqual([])
    })

    it('should return empty array for undefined params', () => {
      expect(urlSearchParamsGetArray(undefined, 'key')).toEqual([])
    })

    it('should handle empty string value', () => {
      const params = new URLSearchParams('key=')
      expect(urlSearchParamsGetArray(params, 'key')).toEqual([''])
    })

    it('should handle single value without comma', () => {
      const params = new URLSearchParams('key=value')
      expect(urlSearchParamsGetArray(params, 'key')).toEqual(['value'])
    })
  })

  describe('urlSearchParamsGetBoolean', () => {
    it('should get boolean from URLSearchParams', () => {
      const params = new URLSearchParams('enabled=true')
      expect(urlSearchParamsGetBoolean(params, 'enabled')).toBe(true)
    })

    it('should handle "1" as true', () => {
      const params = new URLSearchParams('enabled=1')
      expect(urlSearchParamsGetBoolean(params, 'enabled')).toBe(true)
    })

    it('should handle "false" as false', () => {
      const params = new URLSearchParams('enabled=false')
      expect(urlSearchParamsGetBoolean(params, 'enabled')).toBe(false)
    })

    it('should handle "0" as false', () => {
      const params = new URLSearchParams('enabled=0')
      expect(urlSearchParamsGetBoolean(params, 'enabled')).toBe(false)
    })

    it('should return default value for missing key', () => {
      const params = new URLSearchParams('foo=bar')
      expect(urlSearchParamsGetBoolean(params, 'missing')).toBe(false)
      expect(
        urlSearchParamsGetBoolean(params, 'missing', { defaultValue: true }),
      ).toBe(true)
    })

    it('should return default value for null params', () => {
      expect(urlSearchParamsGetBoolean(undefined, 'key')).toBe(false)
      expect(
        urlSearchParamsGetBoolean(undefined, 'key', { defaultValue: true }),
      ).toBe(true)
    })

    it('should return default value for undefined params', () => {
      expect(urlSearchParamsGetBoolean(undefined, 'key')).toBe(false)
      expect(
        urlSearchParamsGetBoolean(undefined, 'key', { defaultValue: true }),
      ).toBe(true)
    })

    it('should handle case-insensitive true', () => {
      const params = new URLSearchParams('enabled=TRUE')
      expect(urlSearchParamsGetBoolean(params, 'enabled')).toBe(true)
    })

    it('should handle whitespace', () => {
      const params = new URLSearchParams('enabled=%20true%20')
      expect(urlSearchParamsGetBoolean(params, 'enabled')).toBe(true)
    })

    it('should handle empty string value as false', () => {
      const params = new URLSearchParams('enabled=')
      expect(urlSearchParamsGetBoolean(params, 'enabled')).toBe(false)
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

  describe('urlSearchParamsAsString', () => {
    it('should get string value from URLSearchParams', () => {
      const params = new URLSearchParams('name=value')
      expect(urlSearchParamsAsString(params, 'name')).toBe('value')
    })

    it('should return default value for missing key', () => {
      const params = new URLSearchParams('foo=bar')
      expect(urlSearchParamsAsString(params, 'missing')).toBe('')
      expect(
        urlSearchParamsAsString(params, 'missing', { defaultValue: 'default' }),
      ).toBe('default')
    })

    it('should return default value for null params', () => {
      expect(urlSearchParamsAsString(undefined, 'key')).toBe('')
      expect(
        urlSearchParamsAsString(undefined, 'key', { defaultValue: 'default' }),
      ).toBe('default')
    })

    it('should return default value for undefined params', () => {
      expect(urlSearchParamsAsString(undefined, 'key')).toBe('')
      expect(
        urlSearchParamsAsString(undefined, 'key', { defaultValue: 'default' }),
      ).toBe('default')
    })

    it('should handle empty string value', () => {
      const params = new URLSearchParams('key=')
      expect(urlSearchParamsAsString(params, 'key')).toBe('')
    })

    it('should handle special characters in value', () => {
      const params = new URLSearchParams('key=hello%20world')
      expect(urlSearchParamsAsString(params, 'key')).toBe('hello world')
    })

    it('should get first value when multiple exist', () => {
      const params = new URLSearchParams()
      params.append('key', 'first')
      params.append('key', 'second')
      expect(urlSearchParamsAsString(params, 'key')).toBe('first')
    })

    it('should preserve whitespace in values', () => {
      const params = new URLSearchParams('key=%20value%20')
      expect(urlSearchParamsAsString(params, 'key')).toBe(' value ')
    })
  })

  describe('urlSearchParamsAsNumber', () => {
    it('should parse integer values', () => {
      const params = new URLSearchParams('count=42')
      expect(urlSearchParamsAsNumber(params, 'count')).toBe(42)
    })

    it('should parse negative numbers', () => {
      const params = new URLSearchParams('value=-10')
      expect(urlSearchParamsAsNumber(params, 'value')).toBe(-10)
    })

    it('should parse floating point numbers', () => {
      const params = new URLSearchParams('price=19.99')
      expect(urlSearchParamsAsNumber(params, 'price')).toBe(19.99)
    })

    it('should parse zero', () => {
      const params = new URLSearchParams('value=0')
      expect(urlSearchParamsAsNumber(params, 'value')).toBe(0)
    })

    it('should return default value for invalid numbers', () => {
      const params = new URLSearchParams('value=notanumber')
      expect(urlSearchParamsAsNumber(params, 'value')).toBe(0)
      expect(
        urlSearchParamsAsNumber(params, 'value', { defaultValue: 42 }),
      ).toBe(42)
    })

    it('should return default value for missing key', () => {
      const params = new URLSearchParams('foo=bar')
      expect(urlSearchParamsAsNumber(params, 'missing')).toBe(0)
      expect(
        urlSearchParamsAsNumber(params, 'missing', { defaultValue: 100 }),
      ).toBe(100)
    })

    it('should return default value for null params', () => {
      expect(urlSearchParamsAsNumber(undefined, 'key')).toBe(0)
      expect(
        urlSearchParamsAsNumber(undefined, 'key', { defaultValue: 42 }),
      ).toBe(42)
    })

    it('should return default value for undefined params', () => {
      expect(urlSearchParamsAsNumber(undefined, 'key')).toBe(0)
      expect(
        urlSearchParamsAsNumber(undefined, 'key', { defaultValue: 42 }),
      ).toBe(42)
    })

    it('should return default value for empty string', () => {
      const params = new URLSearchParams('value=')
      expect(urlSearchParamsAsNumber(params, 'value')).toBe(0)
    })

    it('should parse scientific notation', () => {
      const params = new URLSearchParams('value=1e3')
      expect(urlSearchParamsAsNumber(params, 'value')).toBe(1000)
    })

    it('should parse hex numbers', () => {
      const params = new URLSearchParams('value=0x10')
      expect(urlSearchParamsAsNumber(params, 'value')).toBe(16)
    })

    it('should handle Infinity', () => {
      const params = new URLSearchParams('value=Infinity')
      expect(urlSearchParamsAsNumber(params, 'value')).toBe(
        Number.POSITIVE_INFINITY,
      )
    })

    it('should handle whitespace around numbers', () => {
      const params = new URLSearchParams('value=%20%2042%20%20')
      expect(urlSearchParamsAsNumber(params, 'value')).toBe(42)
    })
  })
})
