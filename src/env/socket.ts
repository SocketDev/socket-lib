/**
 * @file Socket Security environment variable getters.
 */

import { envAsBoolean } from './boolean'
import { envAsNumber } from './number'
import { getEnvValue } from './rewire'

/**
 * SOCKET_ACCEPT_RISKS environment variable getter. Whether to accept all Socket
 * Security risks.
 *
 * @example
 *   ;```typescript
 *   import { getSocketAcceptRisks } from '@socketsecurity/lib/env/socket'
 *
 *   if (getSocketAcceptRisks()) {
 *     console.log('All risks accepted')
 *   }
 *   ```
 *
 * @returns `true` if risks are accepted, `false` otherwise
 */
export function getSocketAcceptRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_ACCEPT_RISKS'))
}

/**
 * SOCKET_API_BASE_URL environment variable getter. Socket Security API base
 * URL.
 *
 * @example
 *   ;```typescript
 *   import { getSocketApiBaseUrl } from '@socketsecurity/lib/env/socket'
 *
 *   const baseUrl = getSocketApiBaseUrl()
 *   // e.g. 'https://api.socket.dev' or undefined
 *   ```
 *
 * @returns The API base URL, or `undefined` if not set
 */
export function getSocketApiBaseUrl(): string | undefined {
  return getEnvValue('SOCKET_API_BASE_URL')
}

/**
 * SOCKET_API_PROXY environment variable getter. Proxy URL for Socket Security
 * API requests.
 *
 * @example
 *   ;```typescript
 *   import { getSocketApiProxy } from '@socketsecurity/lib/env/socket'
 *
 *   const proxy = getSocketApiProxy()
 *   // e.g. 'http://proxy.example.com:8080' or undefined
 *   ```
 *
 * @returns The API proxy URL, or `undefined` if not set
 */
export function getSocketApiProxy(): string | undefined {
  return getEnvValue('SOCKET_API_PROXY')
}

/**
 * SOCKET_API_TIMEOUT environment variable getter. Timeout in milliseconds for
 * Socket Security API requests.
 *
 * @example
 *   ;```typescript
 *   import { getSocketApiTimeout } from '@socketsecurity/lib/env/socket'
 *
 *   const timeout = getSocketApiTimeout()
 *   // e.g. 30000 or 0 if not set
 *   ```
 *
 * @returns The timeout in milliseconds, or `0` if not set
 */
export function getSocketApiTimeout(): number {
  return envAsNumber(getEnvValue('SOCKET_API_TIMEOUT'))
}

/**
 * Socket Security API authentication token.
 *
 * Checks the canonical SOCKET_API_TOKEN first, then a chain of legacy aliases
 * for full v1.x backward compatibility plus the bare SOCKET_API_KEY form used
 * by older MCP-server installs:
 *
 * SOCKET_API_TOKEN → SOCKET_API_KEY → SOCKET_CLI_API_TOKEN → SOCKET_CLI_API_KEY
 * → SOCKET_SECURITY_API_TOKEN → SOCKET_SECURITY_API_KEY.
 *
 * @example
 *   ;```typescript
 *   import { getSocketApiToken } from '@socketsecurity/lib/env/socket'
 *
 *   const token = getSocketApiToken()
 *   // e.g. a Socket API token string or undefined
 *   ```
 *
 * @returns The API token, or `undefined` if no name in the chain is set
 */
export function getSocketApiToken(): string | undefined {
  // This IS the canonical resolver: it reads the legacy-alias fallback chain,
  // so it legitimately names every alias. Per-line disables (not the custom
  // `bootstrap` marker) so the suppression is honored regardless of the
  // cascaded oxlint-plugin version.
  return (
    getEnvValue('SOCKET_API_TOKEN') ||
    // oxlint-disable-next-line socket/socket-api-token-env -- canonical resolver fallback chain
    getEnvValue('SOCKET_API_KEY') ||
    getEnvValue('SOCKET_CLI_API_TOKEN') ||
    getEnvValue('SOCKET_CLI_API_KEY') ||
    // oxlint-disable-next-line socket/socket-api-token-env -- canonical resolver fallback chain
    getEnvValue('SOCKET_SECURITY_API_TOKEN') ||
    // oxlint-disable-next-line socket/socket-api-token-env -- canonical resolver fallback chain
    getEnvValue('SOCKET_SECURITY_API_KEY')
  )
}

/**
 * Socket API endpoint URL override. SOCKET_API_URL — when set, replaces the
 * app's default Socket API base. Each consumer composes its own default (e.g.
 * socket-mcp's depscore endpoint vs. socket-cli's scan endpoints), so this
 * helper returns the raw override and lets the caller fall back.
 *
 * @example
 *   ;```typescript
 *   import { getSocketApiUrl } from '@socketsecurity/lib/env/socket'
 *
 *   const apiUrl = getSocketApiUrl() ?? 'https://api.socket.dev/v0/...'
 *   ```
 *
 * @returns The API URL override, or `undefined` if not set
 */
export function getSocketApiUrl(): string | undefined {
  return getEnvValue('SOCKET_API_URL')
}

/**
 * Git branch name for the current Socket scan. SOCKET_BRANCH_NAME — set by CI /
 * GHA to label the scan with the source branch. Used by basics and coana.
 *
 * @example
 *   ;```typescript
 *   import { getSocketBranchName } from '@socketsecurity/lib/env/socket'
 *
 *   const branch = getSocketBranchName()
 *   ```
 *
 * @returns The branch name, or `undefined` if not set
 */
export function getSocketBranchName(): string | undefined {
  return getEnvValue('SOCKET_BRANCH_NAME')
}

/**
 * SOCKET_CACACHE_DIR environment variable getter. Overrides the default Socket
 * cacache directory location.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCacacheDirEnv } from '@socketsecurity/lib/env/socket'
 *
 *   const dir = getSocketCacacheDirEnv()
 *   // e.g. '/tmp/.socket-cache' or undefined
 *   ```
 *
 * @returns The cacache directory path, or `undefined` if not set
 */
export function getSocketCacacheDirEnv(): string | undefined {
  return getEnvValue('SOCKET_CACACHE_DIR')
}

/**
 * SOCKET_CLOUD_AUTH_URL environment variable getter. SocketCloud OAuth
 * authorization URL. depot's better-auth provider config reads this to override
 * the default authorize endpoint when pointing at a staging or self-hosted
 * SocketCloud server.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCloudAuthUrl } from '@socketsecurity/lib/env/socket'
 *
 *   const url =
 *     getSocketCloudAuthUrl() ?? 'https://api.socket.dev/v1/oauth2/authorize'
 *   ```
 *
 * @returns The override URL, or `undefined` when default applies
 */
export function getSocketCloudAuthUrl(): string | undefined {
  return getEnvValue('SOCKET_CLOUD_AUTH_URL')
}

/**
 * SOCKET_CLOUD_CLIENT_ID environment variable getter. OAuth client ID for
 * SocketCloud. Required (alongside SOCKET_CLOUD_CLIENT_SECRET) to enable the
 * SocketCloud auth provider. Returns `undefined` when not configured — callers
 * should treat that as "SocketCloud auth disabled".
 *
 * @returns The client ID, or `undefined` if not set
 */
export function getSocketCloudClientId(): string | undefined {
  return getEnvValue('SOCKET_CLOUD_CLIENT_ID')
}

/**
 * SOCKET_CLOUD_CLIENT_SECRET environment variable getter. OAuth client secret
 * for SocketCloud. Required (alongside SOCKET_CLOUD_CLIENT_ID) to enable the
 * SocketCloud auth provider. Returns `undefined` when not configured.
 *
 * @returns The client secret, or `undefined` if not set
 */
export function getSocketCloudClientSecret(): string | undefined {
  return getEnvValue('SOCKET_CLOUD_CLIENT_SECRET')
}

/**
 * SOCKET_CLOUD_INTROSPECT_URL environment variable getter. SocketCloud OAuth
 * token-introspection URL. depot uses this to verify access tokens against the
 * SocketCloud authorization server. Defaults handled at the call site.
 *
 * @returns The override URL, or `undefined` when default applies
 */
export function getSocketCloudIntrospectUrl(): string | undefined {
  return getEnvValue('SOCKET_CLOUD_INTROSPECT_URL')
}

/**
 * SOCKET_CLOUD_TOKEN_URL environment variable getter. SocketCloud OAuth
 * token-exchange URL. depot's better-auth provider config reads this to
 * override the default token endpoint.
 *
 * @returns The override URL, or `undefined` when default applies
 */
export function getSocketCloudTokenUrl(): string | undefined {
  return getEnvValue('SOCKET_CLOUD_TOKEN_URL')
}

/**
 * SOCKET_CLOUD_USERINFO_URL environment variable getter. SocketCloud OAuth
 * userinfo endpoint. depot uses this to fetch the authenticated principal's
 * profile after an OAuth code exchange.
 *
 * @returns The override URL, or `undefined` when default applies
 */
export function getSocketCloudUserinfoUrl(): string | undefined {
  return getEnvValue('SOCKET_CLOUD_USERINFO_URL')
}

/**
 * SOCKET_CONFIG environment variable getter. Socket Security configuration file
 * path.
 *
 * @example
 *   ;```typescript
 *   import { getSocketConfig } from '@socketsecurity/lib/env/socket'
 *
 *   const config = getSocketConfig()
 *   // e.g. '/tmp/project/socket.yml' or undefined
 *   ```
 *
 * @returns The config file path, or `undefined` if not set
 */
export function getSocketConfig(): string | undefined {
  return getEnvValue('SOCKET_CONFIG')
}

/**
 * SOCKET_DEBUG environment variable getter. Controls Socket-specific debug
 * output.
 *
 * @example
 *   ;```typescript
 *   import { getSocketDebug } from '@socketsecurity/lib/env/socket'
 *
 *   const debug = getSocketDebug()
 *   // e.g. '*' or 'api' or undefined
 *   ```
 *
 * @returns The Socket debug filter, or `undefined` if not set
 */
export function getSocketDebug(): string | undefined {
  return getEnvValue('SOCKET_DEBUG')
}

/**
 * SOCKET_DLX_DIR environment variable getter. Overrides the default Socket DLX
 * directory location.
 *
 * @example
 *   ;```typescript
 *   import { getSocketDlxDirEnv } from '@socketsecurity/lib/env/socket'
 *
 *   const dlxDir = getSocketDlxDirEnv()
 *   // e.g. '/tmp/.socket-dlx' or undefined
 *   ```
 *
 * @returns The DLX directory path, or `undefined` if not set
 */
export function getSocketDlxDirEnv(): string | undefined {
  return getEnvValue('SOCKET_DLX_DIR')
}

/**
 * SOCKET_HOME environment variable getter. Socket Security home directory path.
 *
 * @example
 *   ;```typescript
 *   import { getSocketHome } from '@socketsecurity/lib/env/socket'
 *
 *   const home = getSocketHome()
 *   // e.g. '/tmp/.socket' or undefined
 *   ```
 *
 * @returns The Socket home directory, or `undefined` if not set
 */
export function getSocketHome(): string | undefined {
  return getEnvValue('SOCKET_HOME')
}

/**
 * SOCKET_NO_API_TOKEN environment variable getter. Whether to skip Socket
 * Security API token requirement.
 *
 * @example
 *   ;```typescript
 *   import { getSocketNoApiToken } from '@socketsecurity/lib/env/socket'
 *
 *   if (getSocketNoApiToken()) {
 *     console.log('API token requirement skipped')
 *   }
 *   ```
 *
 * @returns `true` if the API token requirement is skipped, `false` otherwise
 */
export function getSocketNoApiToken(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_NO_API_TOKEN'))
}

/**
 * SOCKET_NPM_REGISTRY environment variable getter. Socket NPM registry URL
 * (alternative name).
 *
 * @example
 *   ;```typescript
 *   import { getSocketNpmRegistry } from '@socketsecurity/lib/env/socket'
 *
 *   const registry = getSocketNpmRegistry()
 *   // e.g. 'https://npm.socket.dev/' or undefined
 *   ```
 *
 * @returns The Socket NPM registry URL, or `undefined` if not set
 */
export function getSocketNpmRegistry(): string | undefined {
  return getEnvValue('SOCKET_NPM_REGISTRY')
}

/**
 * SOCKET_ORG_SLUG environment variable getter. Socket Security organization
 * slug identifier.
 *
 * @example
 *   ;```typescript
 *   import { getSocketOrgSlug } from '@socketsecurity/lib/env/socket'
 *
 *   const slug = getSocketOrgSlug()
 *   // e.g. 'my-org' or undefined
 *   ```
 *
 * @returns The organization slug, or `undefined` if not set
 */
export function getSocketOrgSlug(): string | undefined {
  return getEnvValue('SOCKET_ORG_SLUG')
}

/**
 * SOCKET_REGISTRY_URL environment variable getter. Socket Registry URL for
 * package installation.
 *
 * @example
 *   ;```typescript
 *   import { getSocketRegistryUrl } from '@socketsecurity/lib/env/socket'
 *
 *   const registryUrl = getSocketRegistryUrl()
 *   // e.g. 'https://registry.socket.dev/' or undefined
 *   ```
 *
 * @returns The Socket registry URL, or `undefined` if not set
 */
export function getSocketRegistryUrl(): string | undefined {
  return getEnvValue('SOCKET_REGISTRY_URL')
}

/**
 * Repository name for the current Socket scan. SOCKET_REPOSITORY_NAME
 * (canonical) — set by CI / GHA to label the scan with the source repository.
 * Also accepts `SOCKET_REPO_NAME` as an alias. Used by basics and coana.
 *
 * @example
 *   ;```typescript
 *   import { getSocketRepositoryName } from '@socketsecurity/lib/env/socket'
 *
 *   const repo = getSocketRepositoryName()
 *   ```
 *
 * @returns The repository name, or `undefined` if neither is set
 */
export function getSocketRepositoryName(): string | undefined {
  return (
    getEnvValue('SOCKET_REPOSITORY_NAME') ||
    // Used by Coana.
    getEnvValue('SOCKET_REPO_NAME')
  )
}

/**
 * SOCKET_STATE_DIR environment variable getter. Overrides the default Socket
 * state directory (~/.socket/_state) location.
 *
 * @returns The state directory path, or `undefined` if not set
 */
export function getSocketStateDirEnv(): string | undefined {
  return getEnvValue('SOCKET_STATE_DIR')
}

/**
 * SOCKET_VIEW_ALL_RISKS environment variable getter. Whether to view all Socket
 * Security risks.
 *
 * @example
 *   ;```typescript
 *   import { getSocketViewAllRisks } from '@socketsecurity/lib/env/socket'
 *
 *   if (getSocketViewAllRisks()) {
 *     console.log('Viewing all risks')
 *   }
 *   ```
 *
 * @returns `true` if viewing all risks, `false` otherwise
 */
export function getSocketViewAllRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_VIEW_ALL_RISKS'))
}

export {
  getMcpHttpMode,
  getMcpPort,
  getSocketOauthIntrospectionClientId,
  getSocketOauthIntrospectionClientSecret,
  getSocketOauthIssuer,
  getSocketOauthRequiredScopes,
  getTrustProxy,
} from './socket-mcp'
