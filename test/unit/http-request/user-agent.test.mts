/**
 * @file Unit tests for the User-Agent composer used by socket-lib's outbound
 *   HTTP requests. Covers:
 *
 *   - `buildUserAgent` token order, slug handling, optional caller append
 *   - `getSocketCallerUserAgent` shape, SOCKET_CALLER_USER_AGENT honoring,
 *     whitespace-only env treated as unset, base UA cached between calls
 */

import process from 'node:process'

import {
  buildUserAgent,
  chainUserAgents,
  getSocketCallerUserAgent,
  sanitizeUserAgent,
} from '../../../src/http-request/user-agent'
import { resetEnv, setEnv } from '../../../src/env/rewire'
import { afterEach, describe, expect, it } from 'vitest'

describe('http-request/user-agent', () => {
  afterEach(() => {
    resetEnv()
  })

  describe('buildUserAgent', () => {
    it('should compose three space-separated tokens for a scoped package', () => {
      const ua = buildUserAgent({
        name: '@socketsecurity/lib',
        version: '6.0.0',
      })
      expect(ua).toBe(
        `socketsecurity-lib/6.0.0 node/${process.version} ${process.platform}/${process.arch}`,
      )
    })

    it('should pass an unscoped package name through pkgNameToSlug unchanged', () => {
      const ua = buildUserAgent({ name: 'sdxgen', version: '0.5.0' })
      expect(ua).toBe(
        `sdxgen/0.5.0 node/${process.version} ${process.platform}/${process.arch}`,
      )
    })

    it('should append the caller UA when provided', () => {
      const ua = buildUserAgent(
        { name: '@socketsecurity/lib', version: '6.0.0' },
        'sdxgen/0.5.0',
      )
      expect(ua).toBe(
        `socketsecurity-lib/6.0.0 node/${process.version} ${process.platform}/${process.arch} sdxgen/0.5.0`,
      )
    })

    it('should omit the trailing caller segment when caller is undefined', () => {
      const ua = buildUserAgent({
        name: '@socketsecurity/lib',
        version: '6.0.0',
      })
      expect(ua.endsWith(`${process.platform}/${process.arch}`)).toBe(true)
    })

    it('should treat an explicit empty-string caller as no caller', () => {
      const ua = buildUserAgent(
        { name: '@socketsecurity/lib', version: '6.0.0' },
        '',
      )
      expect(ua).toBe(
        `socketsecurity-lib/6.0.0 node/${process.version} ${process.platform}/${process.arch}`,
      )
    })

    it('should sanitize an untrusted caller (no header injection)', () => {
      const ua = buildUserAgent(
        { name: '@socketsecurity/lib', version: '6.0.0' },
        'evil\r\nX-Injected: 1',
      )
      expect(ua).not.toContain('\r')
      expect(ua).not.toContain('\n')
      expect(ua.endsWith(' evil X-Injected: 1')).toBe(true)
    })
  })

  describe('sanitizeUserAgent', () => {
    it('should strip CR/LF (header-injection defense)', () => {
      expect(sanitizeUserAgent('evil/1.0\r\nX-Injected: 1')).toBe(
        'evil/1.0 X-Injected: 1',
      )
    })

    it('should strip control chars and collapse whitespace', () => {
      expect(sanitizeUserAgent('alpha/1\t\u0000\u0007 beta/2')).toBe(
        'alpha/1 beta/2',
      )
    })

    it('should return empty string for nullish / blank / all-control', () => {
      expect(sanitizeUserAgent(undefined)).toBe('')
      expect(sanitizeUserAgent('')).toBe('')
      expect(sanitizeUserAgent('   ')).toBe('')
      expect(sanitizeUserAgent('\r\n\t')).toBe('')
    })

    it('should cap length at 256', () => {
      expect(sanitizeUserAgent('x'.repeat(500)).length).toBe(256)
    })
  })

  describe('chainUserAgents', () => {
    it('should chain identity → hop, space-separated', () => {
      expect(
        chainUserAgents([
          'socketsecurity-firewall-api-proxy/0.0.0',
          'vlt/1.2.3',
        ]),
      ).toBe('socketsecurity-firewall-api-proxy/0.0.0 vlt/1.2.3')
    })

    it('should drop empty / nullish fragments', () => {
      expect(
        chainUserAgents(['proxy/1', undefined, '', '   ', 'client/2']),
      ).toBe('proxy/1 client/2')
    })

    it('should collapse an immediately-repeated fragment', () => {
      expect(chainUserAgents(['proxy/1', 'proxy/1', 'client/2'])).toBe(
        'proxy/1 client/2',
      )
    })

    it('should sanitize each fragment (forwarded client UA is untrusted)', () => {
      expect(chainUserAgents(['proxy/1', 'client/2\r\nX-Evil: 1'])).toBe(
        'proxy/1 client/2 X-Evil: 1',
      )
    })
  })

  describe('getSocketCallerUserAgent', () => {
    it('should start with the socketsecurity-lib token', () => {
      const ua = getSocketCallerUserAgent()
      expect(ua.startsWith('socketsecurity-lib/')).toBe(true)
    })

    it('should include node, platform, and arch tokens', () => {
      const ua = getSocketCallerUserAgent()
      expect(ua).toContain(` node/${process.version} `)
      expect(ua).toContain(`${process.platform}/${process.arch}`)
    })

    it('should append the SOCKET_CALLER_USER_AGENT env var when set', () => {
      setEnv('SOCKET_CALLER_USER_AGENT', 'sdxgen/0.5.0')
      const ua = getSocketCallerUserAgent()
      expect(ua.endsWith(' sdxgen/0.5.0')).toBe(true)
    })

    it('should ignore an empty SOCKET_CALLER_USER_AGENT', () => {
      setEnv('SOCKET_CALLER_USER_AGENT', '')
      const ua = getSocketCallerUserAgent()
      expect(ua.endsWith(`${process.platform}/${process.arch}`)).toBe(true)
    })

    it('should ignore a whitespace-only SOCKET_CALLER_USER_AGENT', () => {
      setEnv('SOCKET_CALLER_USER_AGENT', '   ')
      const ua = getSocketCallerUserAgent()
      expect(ua.endsWith(`${process.platform}/${process.arch}`)).toBe(true)
    })

    it('should re-read the env var on each call', () => {
      setEnv('SOCKET_CALLER_USER_AGENT', 'caller-one/1')
      const first = getSocketCallerUserAgent()
      expect(first.endsWith(' caller-one/1')).toBe(true)

      setEnv('SOCKET_CALLER_USER_AGENT', 'caller-two/2')
      const second = getSocketCallerUserAgent()
      expect(second.endsWith(' caller-two/2')).toBe(true)
    })

    it('should keep the base UA stable across calls (cached)', () => {
      setEnv('SOCKET_CALLER_USER_AGENT', undefined)
      const a = getSocketCallerUserAgent()
      const b = getSocketCallerUserAgent()
      expect(a).toBe(b)
    })
  })
})
