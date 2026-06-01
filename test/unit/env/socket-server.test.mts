/**
 * @file Unit tests for Socket MCP/server/OAuth environment variable getters.
 *   Tests server-runtime accessors split from socket.test.mts:
 *
 *   - MCP: getMcpHttpMode(), getMcpPort()
 *   - Proxy: getTrustProxy()
 *   - OAuth: getSocketOauthIssuer(), getSocketOauthIntrospectionClientId(),
 *     getSocketOauthIntrospectionClientSecret(), getSocketOauthRequiredScopes()
 *     Uses rewire for test isolation.
 */

import {
  getMcpHttpMode,
  getMcpPort,
  getSocketOauthIntrospectionClientId,
  getSocketOauthIntrospectionClientSecret,
  getSocketOauthIssuer,
  getSocketOauthRequiredScopes,
  getTrustProxy,
} from '../../../src/env/socket'
import { resetEnv, setEnv } from '../../../src/env/rewire'
import { afterEach, describe, expect, it } from 'vitest'

describe('socket server env', () => {
  afterEach(() => {
    resetEnv()
  })

  describe('getMcpHttpMode', () => {
    it('should return true when set to literal "true"', () => {
      setEnv('MCP_HTTP_MODE', 'true')
      expect(getMcpHttpMode()).toBe(true)
    })

    it('should return false when set to anything else', () => {
      setEnv('MCP_HTTP_MODE', '1')
      expect(getMcpHttpMode()).toBe(false)
      setEnv('MCP_HTTP_MODE', 'yes')
      expect(getMcpHttpMode()).toBe(false)
      setEnv('MCP_HTTP_MODE', 'TRUE')
      expect(getMcpHttpMode()).toBe(false)
    })

    it('should return false when not set', () => {
      setEnv('MCP_HTTP_MODE', undefined)
      expect(getMcpHttpMode()).toBe(false)
    })
  })

  describe('getMcpPort', () => {
    it('should return parsed port when set to valid number', () => {
      setEnv('MCP_PORT', '8080')
      expect(getMcpPort()).toBe(8080)
    })

    it('should default to 3000 when not set', () => {
      setEnv('MCP_PORT', undefined)
      expect(getMcpPort()).toBe(3000)
    })

    it('should default to 3000 when set to invalid number', () => {
      setEnv('MCP_PORT', 'not-a-number')
      expect(getMcpPort()).toBe(3000)
    })

    it('should default to 3000 when set to 0', () => {
      setEnv('MCP_PORT', '0')
      expect(getMcpPort()).toBe(3000)
    })
  })

  describe('getTrustProxy', () => {
    it('should return true when set to literal "true"', () => {
      setEnv('TRUST_PROXY', 'true')
      expect(getTrustProxy()).toBe(true)
    })

    it('should return false when set to anything else', () => {
      setEnv('TRUST_PROXY', '1')
      expect(getTrustProxy()).toBe(false)
      setEnv('TRUST_PROXY', 'yes')
      expect(getTrustProxy()).toBe(false)
    })

    it('should return false when not set', () => {
      setEnv('TRUST_PROXY', undefined)
      expect(getTrustProxy()).toBe(false)
    })
  })

  describe('getSocketOauthIssuer', () => {
    it('should return issuer URL when set', () => {
      setEnv('SOCKET_OAUTH_ISSUER', 'https://issuer.example.test')
      expect(getSocketOauthIssuer()).toBe('https://issuer.example.test')
    })

    it('should default to empty string when not set', () => {
      setEnv('SOCKET_OAUTH_ISSUER', undefined)
      expect(getSocketOauthIssuer()).toBe('')
    })
  })

  describe('getSocketOauthIntrospectionClientId', () => {
    it('should return client ID when set', () => {
      setEnv('SOCKET_OAUTH_INTROSPECTION_CLIENT_ID', 'client-abc')
      expect(getSocketOauthIntrospectionClientId()).toBe('client-abc')
    })

    it('should default to empty string when not set', () => {
      setEnv('SOCKET_OAUTH_INTROSPECTION_CLIENT_ID', undefined)
      expect(getSocketOauthIntrospectionClientId()).toBe('')
    })
  })

  describe('getSocketOauthIntrospectionClientSecret', () => {
    it('should return client secret when set', () => {
      setEnv('SOCKET_OAUTH_INTROSPECTION_CLIENT_SECRET', 'secret-xyz')
      expect(getSocketOauthIntrospectionClientSecret()).toBe('secret-xyz')
    })

    it('should default to empty string when not set', () => {
      setEnv('SOCKET_OAUTH_INTROSPECTION_CLIENT_SECRET', undefined)
      expect(getSocketOauthIntrospectionClientSecret()).toBe('')
    })
  })

  describe('getSocketOauthRequiredScopes', () => {
    it('should return scopes string when set', () => {
      setEnv('SOCKET_OAUTH_REQUIRED_SCOPES', 'packages:list packages:read')
      expect(getSocketOauthRequiredScopes()).toBe('packages:list packages:read')
    })

    it('should default to "packages:list" when not set', () => {
      setEnv('SOCKET_OAUTH_REQUIRED_SCOPES', undefined)
      expect(getSocketOauthRequiredScopes()).toBe('packages:list')
    })
  })
})
