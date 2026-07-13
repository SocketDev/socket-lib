import { describe, expect, it } from 'vitest'

import {
  isLoopbackHost,
  isPrivateHost,
  isUrl,
} from '../../../src/url/predicates'

describe('url/predicates — isUrl', () => {
  it('returns true for valid HTTP URLs', () => {
    expect(isUrl('http://example.com')).toBe(true)
    expect(isUrl('https://example.com')).toBe(true)
    expect(isUrl('https://example.com/path')).toBe(true)
    expect(isUrl('https://example.com/path?query=1')).toBe(true)
  })

  it('returns true for valid URL objects', () => {
    const url = new URL('https://example.com')
    expect(isUrl(url)).toBe(true)
  })

  it('returns true for file URLs', () => {
    expect(isUrl('file:///path/to/file')).toBe(true)
  })

  it('returns true for various protocols', () => {
    expect(isUrl('ftp://example.com')).toBe(true)
    expect(isUrl('ws://example.com')).toBe(true)
    expect(isUrl('wss://example.com')).toBe(true)
  })

  it('returns false for invalid URLs', () => {
    expect(isUrl('not a url')).toBe(false)
    expect(isUrl('http://')).toBe(false)
    expect(isUrl('://missing-protocol')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isUrl('')).toBe(false)
  })

  it('returns false for null / undefined', () => {
    expect(isUrl(undefined)).toBe(false)
  })

  it('returns false for relative URLs without base', () => {
    expect(isUrl('/path/to/resource')).toBe(false)
    expect(isUrl('./relative')).toBe(false)
    expect(isUrl('../relative')).toBe(false)
  })

  it('handles URLs with special characters', () => {
    expect(isUrl('https://example.com/path%20with%20spaces')).toBe(true)
    expect(isUrl('https://example.com/path?q=hello%20world')).toBe(true)
  })

  it('handles URLs with authentication', () => {
    expect(isUrl('https://user:pass@example.com')).toBe(true)
  })

  it('handles URLs with ports', () => {
    expect(isUrl('https://example.com:8080')).toBe(true)
    expect(isUrl('http://localhost:3000')).toBe(true)
  })

  it('handles URLs with fragments', () => {
    expect(isUrl('https://example.com#section')).toBe(true)
    expect(isUrl('https://example.com/path#section')).toBe(true)
  })
})

describe('url/predicates — isLoopbackHost', () => {
  it('returns true for loopback hostnames', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isLoopbackHost('LOCALHOST')).toBe(true)
    expect(isLoopbackHost('LocalHost')).toBe(true)
  })

  it('returns false for public hosts', () => {
    expect(isLoopbackHost('example.com')).toBe(false)
    expect(isLoopbackHost('8.8.8.8')).toBe(false)
  })

  it('returns false for other private ranges that are not loopback', () => {
    expect(isLoopbackHost('10.0.0.1')).toBe(false)
    expect(isLoopbackHost('192.168.1.1')).toBe(false)
  })
})

describe('url/predicates — isPrivateHost', () => {
  it('returns true for loopback hosts', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('::1')).toBe(true)
  })

  it('returns true for RFC 1918 IPv4 ranges', () => {
    expect(isPrivateHost('10.0.0.5')).toBe(true)
    expect(isPrivateHost('172.16.0.1')).toBe(true)
    expect(isPrivateHost('172.31.255.254')).toBe(true)
    expect(isPrivateHost('192.168.1.1')).toBe(true)
  })

  it('returns true for link-local and cloud-metadata ranges', () => {
    expect(isPrivateHost('169.254.169.254')).toBe(true)
    expect(isPrivateHost('0.0.0.0')).toBe(true)
  })

  it('returns true for IPv6 loopback, ULA, and link-local', () => {
    expect(isPrivateHost('fc00::1')).toBe(true)
    expect(isPrivateHost('fd12:3456::1')).toBe(true)
    expect(isPrivateHost('fe80::1')).toBe(true)
  })

  it('is case-insensitive for IPv6', () => {
    expect(isPrivateHost('FE80::1')).toBe(true)
    expect(isPrivateHost('FC00::1')).toBe(true)
  })

  it('returns false for public hosts', () => {
    expect(isPrivateHost('example.com')).toBe(false)
    expect(isPrivateHost('8.8.8.8')).toBe(false)
    expect(isPrivateHost('1.1.1.1')).toBe(false)
  })

  it('does not flag public 172.x outside the 16-31 second octet', () => {
    expect(isPrivateHost('172.15.0.1')).toBe(false)
    expect(isPrivateHost('172.32.0.1')).toBe(false)
  })
})
