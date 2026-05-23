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
  getSocketCallerUserAgent,
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
