/**
 * @file Unit tests for Socket environment variable getters. Tests
 *   Socket-specific environment variable accessors (SOCKET_* prefix):
 *
 *   - API config: getSocketApiBaseUrl(), getSocketApiToken(),
 *     getSocketApiProxy(), getSocketApiTimeout()
 *   - Paths: getSocketHome(), getSocketCacacheDirEnv(), getSocketDlxDirEnv(),
 *     getSocketConfig()
 *   - Registry: getSocketNpmRegistry(), getSocketRegistryUrl()
 *   - Behavior: getSocketDebug(), getSocketAcceptRisks(),
 *     getSocketViewAllRisks(), getSocketNoApiToken()
 *   - Organization: getSocketOrgSlug() Uses rewire for test isolation. Critical
 *     for Socket tool configuration.
 */

import {
  getSocketAcceptRisks,
  getSocketApiBaseUrl,
  getSocketApiProxy,
  getSocketApiTimeout,
  getSocketApiToken,
  getSocketApiUrl,
  getSocketBranchName,
  getSocketCacacheDirEnv,
  getSocketCloudAuthUrl,
  getSocketCloudClientId,
  getSocketCloudClientSecret,
  getSocketCloudIntrospectUrl,
  getSocketCloudTokenUrl,
  getSocketCloudUserinfoUrl,
  getSocketConfig,
  getSocketDebug,
  getSocketDlxDirEnv,
  getSocketHome,
  getSocketNoApiToken,
  getSocketNpmRegistry,
  getSocketOrgSlug,
  getSocketRegistryUrl,
  getSocketRepositoryName,
  getSocketViewAllRisks,
} from '../../../src/env/socket'
import { resetEnv, setEnv } from '../../../src/env/rewire'
import { afterEach, describe, expect, it } from 'vitest'

describe('socket env', () => {
  afterEach(() => {
    resetEnv()
  })

  describe('getSocketAcceptRisks', () => {
    it('should return true when set to truthy value', () => {
      setEnv('SOCKET_ACCEPT_RISKS', '1')
      expect(getSocketAcceptRisks()).toBe(true)

      setEnv('SOCKET_ACCEPT_RISKS', 'true')
      expect(getSocketAcceptRisks()).toBe(true)
    })

    it('should return false when unset or falsy', () => {
      setEnv('SOCKET_ACCEPT_RISKS', '')
      expect(getSocketAcceptRisks()).toBe(false)

      setEnv('SOCKET_ACCEPT_RISKS', undefined)
      expect(getSocketAcceptRisks()).toBe(false)
    })
  })

  describe('getSocketApiBaseUrl', () => {
    it('should return URL when set', () => {
      setEnv('SOCKET_API_BASE_URL', 'https://api.socket.dev')
      expect(getSocketApiBaseUrl()).toBe('https://api.socket.dev')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_API_BASE_URL', undefined)
      expect(getSocketApiBaseUrl()).toBeUndefined()
    })
  })

  describe('getSocketApiProxy', () => {
    it('should return proxy URL when set', () => {
      setEnv('SOCKET_API_PROXY', 'http://proxy.example.com:8080')
      expect(getSocketApiProxy()).toBe('http://proxy.example.com:8080')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_API_PROXY', undefined)
      expect(getSocketApiProxy()).toBeUndefined()
    })
  })

  describe('getSocketApiTimeout', () => {
    it('should return timeout number when set', () => {
      setEnv('SOCKET_API_TIMEOUT', '30000')
      expect(getSocketApiTimeout()).toBe(30_000)
    })

    it('should return 0 when not set', () => {
      setEnv('SOCKET_API_TIMEOUT', undefined)
      expect(getSocketApiTimeout()).toBe(0)
    })

    it('should handle invalid numbers', () => {
      setEnv('SOCKET_API_TIMEOUT', 'invalid')
      expect(getSocketApiTimeout()).toBe(0)
    })
  })

  describe('getSocketApiToken', () => {
    // getEnvValue falls back to process.env when neither isolated
    // nor shared overrides have a value. Developers commonly have
    // SOCKET_API_KEY (or another alias) set in their shell for daily
    // use, which would leak into the fallback-chain tests below. Pin
    // each alias to undefined so only the one we set per-test wins.
    const ALL_TOKEN_ALIASES = [
      'SOCKET_API_TOKEN',
      'SOCKET_API_TOKEN',
      'SOCKET_CLI_API_TOKEN',
      'SOCKET_CLI_API_KEY',
      'SOCKET_API_TOKEN',
      'SOCKET_API_TOKEN',
    ] as const
    const clearAllAliases = () => {
      for (const alias of ALL_TOKEN_ALIASES) {
        setEnv(alias, undefined)
      }
    }

    it('should return token when SOCKET_API_TOKEN is set', () => {
      clearAllAliases()
      setEnv('SOCKET_API_TOKEN', 'canonical-token')
      expect(getSocketApiToken()).toBe('canonical-token')
    })

    it('should fall back to SOCKET_API_KEY', () => {
      clearAllAliases()
      setEnv('SOCKET_API_TOKEN', 'mcp-key')
      expect(getSocketApiToken()).toBe('mcp-key')
    })

    it('should fall back to SOCKET_CLI_API_TOKEN', () => {
      clearAllAliases()
      setEnv('SOCKET_CLI_API_TOKEN', 'cli-token')
      expect(getSocketApiToken()).toBe('cli-token')
    })

    it('should fall back to SOCKET_CLI_API_KEY', () => {
      clearAllAliases()
      setEnv('SOCKET_CLI_API_KEY', 'cli-key')
      expect(getSocketApiToken()).toBe('cli-key')
    })

    it('should fall back to SOCKET_SECURITY_API_TOKEN', () => {
      clearAllAliases()
      setEnv('SOCKET_API_TOKEN', 'security-token')
      expect(getSocketApiToken()).toBe('security-token')
    })

    it('should fall back to SOCKET_SECURITY_API_KEY', () => {
      clearAllAliases()
      setEnv('SOCKET_API_TOKEN', 'security-key')
      expect(getSocketApiToken()).toBe('security-key')
    })

    it('should prefer SOCKET_API_TOKEN over all legacy names', () => {
      setEnv('SOCKET_API_TOKEN', 'canonical-token')
      setEnv('SOCKET_API_TOKEN', 'mcp-key')
      setEnv('SOCKET_CLI_API_TOKEN', 'cli-token')
      setEnv('SOCKET_API_TOKEN', 'security-key')
      expect(getSocketApiToken()).toBe('canonical-token')
    })

    it('should return undefined when not set', () => {
      // Clear all token env vars that getSocketApiToken falls back to,
      // including the canonical SOCKET_API_TOKEN that CI runners may have set.
      setEnv('SOCKET_API_TOKEN', undefined)
      setEnv('SOCKET_API_TOKEN', undefined)
      setEnv('SOCKET_CLI_API_TOKEN', undefined)
      setEnv('SOCKET_CLI_API_KEY', undefined)
      setEnv('SOCKET_API_TOKEN', undefined)
      setEnv('SOCKET_API_TOKEN', undefined)
      expect(getSocketApiToken()).toBeUndefined()
    })
  })

  describe('getSocketCacacheDirEnv', () => {
    it('should return cacache directory when set', () => {
      setEnv('SOCKET_CACACHE_DIR', '/custom/cacache')
      expect(getSocketCacacheDirEnv()).toBe('/custom/cacache')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CACACHE_DIR', undefined)
      expect(getSocketCacacheDirEnv()).toBeUndefined()
    })
  })

  describe('getSocketCloudAuthUrl', () => {
    it('should return auth URL when set', () => {
      setEnv('SOCKET_CLOUD_AUTH_URL', 'https://staging.example/oauth/authorize')
      expect(getSocketCloudAuthUrl()).toBe(
        'https://staging.example/oauth/authorize',
      )
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLOUD_AUTH_URL', undefined)
      expect(getSocketCloudAuthUrl()).toBeUndefined()
    })
  })

  describe('getSocketCloudClientId', () => {
    it('should return client ID when set', () => {
      setEnv('SOCKET_CLOUD_CLIENT_ID', 'depot-client-abc123')
      expect(getSocketCloudClientId()).toBe('depot-client-abc123')
    })

    it('should return undefined when not set (= cloud auth disabled)', () => {
      setEnv('SOCKET_CLOUD_CLIENT_ID', undefined)
      expect(getSocketCloudClientId()).toBeUndefined()
    })
  })

  describe('getSocketCloudClientSecret', () => {
    it('should return client secret when set', () => {
      setEnv('SOCKET_CLOUD_CLIENT_SECRET', 'shhh-very-secret')
      expect(getSocketCloudClientSecret()).toBe('shhh-very-secret')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLOUD_CLIENT_SECRET', undefined)
      expect(getSocketCloudClientSecret()).toBeUndefined()
    })
  })

  describe('getSocketCloudIntrospectUrl', () => {
    it('should return introspect URL when set', () => {
      setEnv(
        'SOCKET_CLOUD_INTROSPECT_URL',
        'https://staging.example/oauth/introspect',
      )
      expect(getSocketCloudIntrospectUrl()).toBe(
        'https://staging.example/oauth/introspect',
      )
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLOUD_INTROSPECT_URL', undefined)
      expect(getSocketCloudIntrospectUrl()).toBeUndefined()
    })
  })

  describe('getSocketCloudTokenUrl', () => {
    it('should return token URL when set', () => {
      setEnv('SOCKET_CLOUD_TOKEN_URL', 'https://staging.example/oauth/token')
      expect(getSocketCloudTokenUrl()).toBe(
        'https://staging.example/oauth/token',
      )
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLOUD_TOKEN_URL', undefined)
      expect(getSocketCloudTokenUrl()).toBeUndefined()
    })
  })

  describe('getSocketCloudUserinfoUrl', () => {
    it('should return userinfo URL when set', () => {
      setEnv(
        'SOCKET_CLOUD_USERINFO_URL',
        'https://staging.example/oauth/userinfo',
      )
      expect(getSocketCloudUserinfoUrl()).toBe(
        'https://staging.example/oauth/userinfo',
      )
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CLOUD_USERINFO_URL', undefined)
      expect(getSocketCloudUserinfoUrl()).toBeUndefined()
    })
  })

  describe('getSocketConfig', () => {
    it('should return config path when set', () => {
      setEnv('SOCKET_CONFIG', '/path/to/socket.yml')
      expect(getSocketConfig()).toBe('/path/to/socket.yml')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_CONFIG', undefined)
      expect(getSocketConfig()).toBeUndefined()
    })
  })

  describe('getSocketDebug', () => {
    it('should return debug value when set', () => {
      setEnv('SOCKET_DEBUG', 'api,cache')
      expect(getSocketDebug()).toBe('api,cache')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_DEBUG', undefined)
      expect(getSocketDebug()).toBeUndefined()
    })
  })

  describe('getSocketDlxDirEnv', () => {
    it('should return DLX directory when set', () => {
      setEnv('SOCKET_DLX_DIR', '/custom/dlx')
      expect(getSocketDlxDirEnv()).toBe('/custom/dlx')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_DLX_DIR', undefined)
      expect(getSocketDlxDirEnv()).toBeUndefined()
    })
  })

  describe('getSocketHome', () => {
    it('should return Socket home directory when set', () => {
      setEnv('SOCKET_HOME', '/home/user/.socket')
      expect(getSocketHome()).toBe('/home/user/.socket')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_HOME', undefined)
      expect(getSocketHome()).toBeUndefined()
    })
  })

  describe('getSocketNoApiToken', () => {
    it('should return true when set to truthy value', () => {
      setEnv('SOCKET_NO_API_TOKEN', '1')
      expect(getSocketNoApiToken()).toBe(true)
    })

    it('should return false when unset or falsy', () => {
      setEnv('SOCKET_NO_API_TOKEN', '')
      expect(getSocketNoApiToken()).toBe(false)
    })
  })

  describe('getSocketNpmRegistry', () => {
    it('should return NPM registry URL when set', () => {
      setEnv('SOCKET_NPM_REGISTRY', 'https://registry.socket.dev')
      expect(getSocketNpmRegistry()).toBe('https://registry.socket.dev')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_NPM_REGISTRY', undefined)
      expect(getSocketNpmRegistry()).toBeUndefined()
    })
  })

  describe('getSocketOrgSlug', () => {
    it('should return org slug when set', () => {
      setEnv('SOCKET_ORG_SLUG', 'my-org')
      expect(getSocketOrgSlug()).toBe('my-org')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_ORG_SLUG', undefined)
      expect(getSocketOrgSlug()).toBeUndefined()
    })
  })

  describe('getSocketRegistryUrl', () => {
    it('should return Socket registry URL when set', () => {
      setEnv('SOCKET_REGISTRY_URL', 'https://registry.socket.dev')
      expect(getSocketRegistryUrl()).toBe('https://registry.socket.dev')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_REGISTRY_URL', undefined)
      expect(getSocketRegistryUrl()).toBeUndefined()
    })
  })

  describe('getSocketViewAllRisks', () => {
    it('should return true when set to truthy value', () => {
      setEnv('SOCKET_VIEW_ALL_RISKS', '1')
      expect(getSocketViewAllRisks()).toBe(true)
    })

    it('should return false when unset or falsy', () => {
      setEnv('SOCKET_VIEW_ALL_RISKS', '')
      expect(getSocketViewAllRisks()).toBe(false)
    })
  })

  describe('getSocketApiUrl', () => {
    it('should return URL when set', () => {
      setEnv('SOCKET_API_URL', 'https://api.example.test/v0/purl')
      expect(getSocketApiUrl()).toBe('https://api.example.test/v0/purl')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_API_URL', undefined)
      expect(getSocketApiUrl()).toBeUndefined()
    })
  })

  describe('getSocketBranchName', () => {
    it('should return branch name when set', () => {
      setEnv('SOCKET_BRANCH_NAME', 'feature/x')
      expect(getSocketBranchName()).toBe('feature/x')
    })

    it('should return undefined when not set', () => {
      setEnv('SOCKET_BRANCH_NAME', undefined)
      expect(getSocketBranchName()).toBeUndefined()
    })
  })

  describe('getSocketRepositoryName', () => {
    // Same env-leak guard as getSocketApiToken above: developers
    // commonly have SOCKET_REPOSITORY_NAME (or its alias) set in
    // their shell. Pin both to undefined per-test so only the one
    // we set wins.
    const clearRepoAliases = () => {
      setEnv('SOCKET_REPOSITORY_NAME', undefined)
      setEnv('SOCKET_REPO_NAME', undefined)
    }

    it('should return repo name when SOCKET_REPOSITORY_NAME is set', () => {
      clearRepoAliases()
      setEnv('SOCKET_REPOSITORY_NAME', 'my-repo')
      expect(getSocketRepositoryName()).toBe('my-repo')
    })

    it('should fall back to SOCKET_REPO_NAME', () => {
      clearRepoAliases()
      setEnv('SOCKET_REPO_NAME', 'coana-repo')
      expect(getSocketRepositoryName()).toBe('coana-repo')
    })

    it('should prefer SOCKET_REPOSITORY_NAME over SOCKET_REPO_NAME', () => {
      setEnv('SOCKET_REPOSITORY_NAME', 'canonical')
      setEnv('SOCKET_REPO_NAME', 'coana-style')
      expect(getSocketRepositoryName()).toBe('canonical')
    })

    it('should return undefined when neither set', () => {
      setEnv('SOCKET_REPOSITORY_NAME', undefined)
      setEnv('SOCKET_REPO_NAME', undefined)
      expect(getSocketRepositoryName()).toBeUndefined()
    })
  })
})
