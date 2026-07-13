import { describe, expect, it } from 'vitest'

import { createRelativeUrl, parseUrl } from '../../../src/url/parse'

describe('url/parse — parseUrl', () => {
  it('parses valid HTTP URLs', () => {
    const url = parseUrl('https://example.com/path')
    expect(url).toBeInstanceOf(URL)
    expect(url?.href).toBe('https://example.com/path')
    expect(url?.protocol).toBe('https:')
    expect(url?.hostname).toBe('example.com')
    expect(url?.pathname).toBe('/path')
  })

  it('parses URL objects', () => {
    const input = new URL('https://example.com')
    const url = parseUrl(input)
    expect(url).toBeInstanceOf(URL)
    expect(url?.href).toBe('https://example.com/')
  })

  it('parses URLs with query parameters', () => {
    const url = parseUrl('https://example.com?foo=bar&baz=qux')
    expect(url?.search).toBe('?foo=bar&baz=qux')
    expect(url?.searchParams.get('foo')).toBe('bar')
    expect(url?.searchParams.get('baz')).toBe('qux')
  })

  it('parses URLs with fragments', () => {
    const url = parseUrl('https://example.com#section')
    expect(url?.hash).toBe('#section')
  })

  it('parses URLs with ports', () => {
    const url = parseUrl('https://example.com:8080')
    expect(url?.port).toBe('8080')
  })

  it('parses URLs with authentication', () => {
    const url = parseUrl('https://user:pass@example.com')
    expect(url?.username).toBe('user')
    expect(url?.password).toBe('pass')
  })

  it('returns undefined for invalid URLs', () => {
    expect(parseUrl('not a url')).toBeUndefined()
    expect(parseUrl('http://')).toBeUndefined()
    expect(parseUrl('/relative/path')).toBeUndefined()
  })

  it('parses file URLs', () => {
    const url = parseUrl('file:///path/to/file')
    expect(url?.protocol).toBe('file:')
    expect(url?.pathname).toBe('/path/to/file')
  })

  it('parses data URLs', () => {
    const url = parseUrl('data:text/plain;base64,SGVsbG8=')
    expect(url?.protocol).toBe('data:')
  })
})

describe('url/parse — createRelativeUrl', () => {
  it('creates relative URL by removing leading slash', () => {
    expect(createRelativeUrl('/path/to/resource')).toBe('path/to/resource')
  })

  it('handles path without leading slash', () => {
    expect(createRelativeUrl('path/to/resource')).toBe('path/to/resource')
  })

  it('prepends base URL when provided', () => {
    expect(createRelativeUrl('/path', { base: 'https://example.com' })).toBe(
      'https://example.com/path',
    )
  })

  it('adds trailing slash to base if missing', () => {
    expect(createRelativeUrl('/path', { base: 'https://example.com' })).toBe(
      'https://example.com/path',
    )
    expect(createRelativeUrl('/path', { base: 'https://example.com/' })).toBe(
      'https://example.com/path',
    )
  })

  it('handles empty path', () => {
    expect(createRelativeUrl('')).toBe('')
    expect(createRelativeUrl('', { base: 'https://example.com' })).toBe(
      'https://example.com/',
    )
  })

  it('handles root path', () => {
    expect(createRelativeUrl('/')).toBe('')
    expect(createRelativeUrl('/', { base: 'https://example.com' })).toBe(
      'https://example.com/',
    )
  })

  it('handles complex paths', () => {
    expect(createRelativeUrl('/path/to/resource?query=1#hash')).toBe(
      'path/to/resource?query=1#hash',
    )
  })

  it('works with base URLs that have paths', () => {
    expect(
      createRelativeUrl('/resource', { base: 'https://example.com/api' }),
    ).toBe('https://example.com/api/resource')
  })

  it('handles empty base option', () => {
    expect(createRelativeUrl('/path', { base: '' })).toBe('path')
  })
})
