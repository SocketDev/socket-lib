/**
 * @file Unit tests for Socket CLI environment variable getters. Tests
 *   getSocketCli() for Socket CLI detection and configuration. Returns
 *   SOCKET_CLI value or undefined. Used to detect CLI environment. Uses rewire
 *   for test isolation. Critical for CLI vs programmatic API behavior.
 */

import {
  getSocketCliAcceptRisks,
  getSocketCliApiBaseUrl,
  getSocketCliApiProxy,
  getSocketCliApiTimeout,
  getSocketCliBootstrapCacheDir,
  getSocketCliBootstrapSpec,
  getSocketCliConfig,
  getSocketCliFix,
  getSocketCliGithubToken,
  getSocketCliNoApiToken,
  getSocketCliOptimize,
  getSocketCliOrgSlug,
  getSocketCliViewAllRisks,
} from '../../../src/env/socket-cli'
import { resetEnv, setEnv } from '../../../src/env/rewire'
import { afterEach, describe, expect, it } from 'vitest'

describe('socket-cli env', () => {
  afterEach(() => {
    resetEnv()
  })

  describe('getSocketCliAcceptRisks', () => {
    it('should return true when set to truthy value', () => {
      setEnv('SOCKET_CLI_ACCEPT_RISKS', '1')
      expect(getSocketCliAcceptRisks()).toBe(true)

      setEnv('SOCKET_CLI_ACCEPT_RISKS', 'true')
      expect(getSocketCliAcceptRisks()).toBe(true)
    })

    it('should return false when unset or falsy', () => {
      setEnv('SOCKET_CLI_ACCEPT_RISKS', '')
      expect(getSocketCliAcceptRisks()).toBe(false)

      setEnv('SOCKET_CLI_ACCEPT_RISKS', undefined)
      expect(getSocketCliAcceptRisks()).toBe(false)
    })
  })

  describe('getSocketCliApiBaseUrl', () => {
    it('should return URL when set', () => {
      setEnv('SOCKET_CLI_API_BASE_URL', 'https://api.socket.dev')
      expect(getSocketCliApiBaseUrl()).toBe('https://api.socket.dev')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLI_API_BASE_URL', undefined)
      expect(getSocketCliApiBaseUrl()).toBeUndefined()
    })
  })

  describe('getSocketCliApiProxy', () => {
    it('should return proxy URL when set', () => {
      setEnv('SOCKET_CLI_API_PROXY', 'http://proxy.example.com:8080')
      expect(getSocketCliApiProxy()).toBe('http://proxy.example.com:8080')
    })

    it('should return undefined when not set', () => {
      // Clear all proxy env vars that getSocketCliApiProxy falls back to,
      // including standard proxy vars that CI runners may have set.
      setEnv('SOCKET_CLI_API_PROXY', undefined)
      setEnv('SOCKET_SECURITY_API_PROXY', undefined)
      setEnv('HTTPS_PROXY', undefined)
      setEnv('https_proxy', undefined)
      setEnv('HTTP_PROXY', undefined)
      setEnv('http_proxy', undefined)
      expect(getSocketCliApiProxy()).toBeUndefined()
    })
  })

  describe('getSocketCliApiTimeout', () => {
    it('should return timeout number when set', () => {
      setEnv('SOCKET_CLI_API_TIMEOUT', '30000')
      expect(getSocketCliApiTimeout()).toBe(30_000)
    })

    it('should return 0 when not set', () => {
      setEnv('SOCKET_CLI_API_TIMEOUT', undefined)
      expect(getSocketCliApiTimeout()).toBe(0)
    })

    it('should handle invalid numbers', () => {
      setEnv('SOCKET_CLI_API_TIMEOUT', 'invalid')
      expect(getSocketCliApiTimeout()).toBe(0)
    })
  })

  describe('getSocketCliConfig', () => {
    it('should return config path when set', () => {
      setEnv('SOCKET_CLI_CONFIG', '/path/to/config.json')
      expect(getSocketCliConfig()).toBe('/path/to/config.json')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLI_CONFIG', undefined)
      expect(getSocketCliConfig()).toBeUndefined()
    })
  })

  describe('getSocketCliFix', () => {
    it('should return fix mode when set', () => {
      setEnv('SOCKET_CLI_FIX', 'auto')
      expect(getSocketCliFix()).toBe('auto')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLI_FIX', undefined)
      expect(getSocketCliFix()).toBeUndefined()
    })
  })

  describe('getSocketCliGithubToken', () => {
    it('should return GitHub token when set', () => {
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'ghp_test123')
      expect(getSocketCliGithubToken()).toBe('ghp_test123')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLI_GITHUB_TOKEN', undefined)
      expect(getSocketCliGithubToken()).toBeUndefined()
    })
  })

  describe('getSocketCliNoApiToken', () => {
    it('should return true when set to truthy value', () => {
      setEnv('SOCKET_CLI_NO_API_TOKEN', '1')
      expect(getSocketCliNoApiToken()).toBe(true)
    })

    it('should return false when unset or falsy', () => {
      setEnv('SOCKET_CLI_NO_API_TOKEN', '')
      expect(getSocketCliNoApiToken()).toBe(false)
    })
  })

  describe('getSocketCliOptimize', () => {
    it('should return true when set to truthy value', () => {
      setEnv('SOCKET_CLI_OPTIMIZE', '1')
      expect(getSocketCliOptimize()).toBe(true)
    })

    it('should return false when unset or falsy', () => {
      setEnv('SOCKET_CLI_OPTIMIZE', '')
      expect(getSocketCliOptimize()).toBe(false)
    })
  })

  describe('getSocketCliOrgSlug', () => {
    it('should return org slug when set', () => {
      setEnv('SOCKET_CLI_ORG_SLUG', 'my-org')
      expect(getSocketCliOrgSlug()).toBe('my-org')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLI_ORG_SLUG', undefined)
      expect(getSocketCliOrgSlug()).toBeUndefined()
    })
  })

  describe('getSocketCliViewAllRisks', () => {
    it('should return true when set to truthy value', () => {
      setEnv('SOCKET_CLI_VIEW_ALL_RISKS', '1')
      expect(getSocketCliViewAllRisks()).toBe(true)
    })

    it('should return false when unset or falsy', () => {
      setEnv('SOCKET_CLI_VIEW_ALL_RISKS', '')
      expect(getSocketCliViewAllRisks()).toBe(false)
    })
  })

  describe('getSocketCliBootstrapCacheDir', () => {
    it('returns the bootstrap cache dir when set', () => {
      setEnv('SOCKET_CLI_BOOTSTRAP_CACHE_DIR', '/tmp/.socket-cli-cache')
      expect(getSocketCliBootstrapCacheDir()).toBe('/tmp/.socket-cli-cache')
    })

    it('returns undefined when not set', () => {
      setEnv('SOCKET_CLI_BOOTSTRAP_CACHE_DIR', undefined)
      expect(getSocketCliBootstrapCacheDir()).toBeUndefined()
    })
  })

  describe('getSocketCliBootstrapSpec', () => {
    it('returns the bootstrap spec when set', () => {
      setEnv('SOCKET_CLI_BOOTSTRAP_SPEC', '@socketsecurity/cli@^2.0.11')
      expect(getSocketCliBootstrapSpec()).toBe('@socketsecurity/cli@^2.0.11')
    })

    it('returns undefined when not set', () => {
      setEnv('SOCKET_CLI_BOOTSTRAP_SPEC', undefined)
      expect(getSocketCliBootstrapSpec()).toBeUndefined()
    })
  })

  describe('fallback chains', () => {
    it('getSocketCliApiBaseUrl falls back to SOCKET_SECURITY_API_BASE_URL', () => {
      setEnv('SOCKET_CLI_API_BASE_URL', undefined)
      setEnv('SOCKET_SECURITY_API_BASE_URL', 'https://legacy.api')
      expect(getSocketCliApiBaseUrl()).toBe('https://legacy.api')
    })

    it('getSocketCliApiProxy falls back to SOCKET_SECURITY_API_PROXY', () => {
      setEnv('SOCKET_CLI_API_PROXY', undefined)
      setEnv('SOCKET_SECURITY_API_PROXY', 'http://sec-proxy')
      setEnv('HTTPS_PROXY', undefined)
      setEnv('https_proxy', undefined)
      setEnv('HTTP_PROXY', undefined)
      setEnv('http_proxy', undefined)
      expect(getSocketCliApiProxy()).toBe('http://sec-proxy')
    })

    it('getSocketCliApiProxy falls back to HTTPS_PROXY', () => {
      setEnv('SOCKET_CLI_API_PROXY', undefined)
      setEnv('SOCKET_SECURITY_API_PROXY', undefined)
      setEnv('HTTPS_PROXY', 'https://upper-proxy')
      expect(getSocketCliApiProxy()).toBe('https://upper-proxy')
    })

    it('getSocketCliApiProxy falls back to lowercase https_proxy', () => {
      setEnv('SOCKET_CLI_API_PROXY', undefined)
      setEnv('SOCKET_SECURITY_API_PROXY', undefined)
      setEnv('HTTPS_PROXY', undefined)
      setEnv('https_proxy', 'https://lower-proxy')
      expect(getSocketCliApiProxy()).toBe('https://lower-proxy')
    })

    it('getSocketCliApiProxy falls back to HTTP_PROXY', () => {
      setEnv('SOCKET_CLI_API_PROXY', undefined)
      setEnv('SOCKET_SECURITY_API_PROXY', undefined)
      setEnv('HTTPS_PROXY', undefined)
      setEnv('https_proxy', undefined)
      setEnv('HTTP_PROXY', 'http://upper-proxy')
      expect(getSocketCliApiProxy()).toBe('http://upper-proxy')
    })

    it('getSocketCliApiProxy falls back to lowercase http_proxy', () => {
      setEnv('SOCKET_CLI_API_PROXY', undefined)
      setEnv('SOCKET_SECURITY_API_PROXY', undefined)
      setEnv('HTTPS_PROXY', undefined)
      setEnv('https_proxy', undefined)
      setEnv('HTTP_PROXY', undefined)
      setEnv('http_proxy', 'http://lowest-proxy')
      expect(getSocketCliApiProxy()).toBe('http://lowest-proxy')
    })

    it('getSocketCliGithubToken falls back to SOCKET_SECURITY_GITHUB_PAT', () => {
      setEnv('SOCKET_CLI_GITHUB_TOKEN', undefined)
      setEnv('SOCKET_SECURITY_GITHUB_PAT', 'ghp_legacy')
      setEnv('GITHUB_TOKEN', undefined)
      expect(getSocketCliGithubToken()).toBe('ghp_legacy')
    })

    it('getSocketCliGithubToken falls back to GITHUB_TOKEN', () => {
      setEnv('SOCKET_CLI_GITHUB_TOKEN', undefined)
      setEnv('SOCKET_SECURITY_GITHUB_PAT', undefined)
      setEnv('GITHUB_TOKEN', 'ghp_default')
      expect(getSocketCliGithubToken()).toBe('ghp_default')
    })

    it('getSocketCliOrgSlug falls back to SOCKET_ORG_SLUG', () => {
      setEnv('SOCKET_CLI_ORG_SLUG', undefined)
      setEnv('SOCKET_ORG_SLUG', 'legacy-org')
      expect(getSocketCliOrgSlug()).toBe('legacy-org')
    })
  })
})
