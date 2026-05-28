/**
 * @file Socket Security environment variable getters.
 */

import { envAsBoolean } from './boolean'
import { envAsNumber } from './number'
import { getEnvValue } from './rewire'

import { NumberIsFinite } from '../primordials/number'

/**
 * Whether the MCP server should run in HTTP mode. MCP_HTTP_MODE — when set to
 * the literal string `'true'`, the MCP server serves over HTTP instead of
 * stdio. Returns `false` for any other value (including unset).
 *
 * @example
 *   ;```typescript
 *   import { getMcpHttpMode } from '@socketsecurity/lib/env/socket'
 *
 *   if (getMcpHttpMode()) {
 *     startHttpServer()
 *   }
 *   ```
 *
 * @returns `true` if HTTP mode is enabled, `false` otherwise
 */
/*@__NO_SIDE_EFFECTS__*/
export function getMcpHttpMode(): boolean {
  return getEnvValue('MCP_HTTP_MODE') === 'true'
}

/**
 * MCP HTTP server listen port. MCP_PORT — port the MCP HTTP server binds to.
 * Defaults to `3000` (matches socket-mcp's documented default). Invalid /
 * non-numeric values also fall back to `3000`.
 *
 * @example
 *   ;```typescript
 *   import { getMcpPort } from '@socketsecurity/lib/env/socket'
 *
 *   const port = getMcpPort()
 *   ```
 *
 * @returns The MCP server port (default `3000`)
 */
/*@__NO_SIDE_EFFECTS__*/
export function getMcpPort(): number {
  const parsed = envAsNumber(getEnvValue('MCP_PORT'))
  return NumberIsFinite(parsed) && parsed > 0 ? parsed : 3000
}

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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
export function getSocketApiToken(): string | undefined {
  return (
    getEnvValue('SOCKET_API_TOKEN') ||
    getEnvValue('SOCKET_API_KEY') ||
    getEnvValue('SOCKET_CLI_API_TOKEN') ||
    getEnvValue('SOCKET_CLI_API_KEY') ||
    getEnvValue('SOCKET_SECURITY_API_TOKEN') ||
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
export function getSocketNpmRegistry(): string | undefined {
  return getEnvValue('SOCKET_NPM_REGISTRY')
}

/**
 * OAuth introspection client ID for the MCP HTTP server.
 * SOCKET_OAUTH_INTROSPECTION_CLIENT_ID — client credential used to call the
 * issuer's introspection endpoint. Empty string when unset.
 *
 * @example
 *   ;```typescript
 *   import { getSocketOauthIntrospectionClientId } from '@socketsecurity/lib/env/socket'
 *
 *   const clientId = getSocketOauthIntrospectionClientId()
 *   ```
 *
 * @returns The OAuth client ID, or `''` if not set
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketOauthIntrospectionClientId(): string {
  return getEnvValue('SOCKET_OAUTH_INTROSPECTION_CLIENT_ID') ?? ''
}

/**
 * OAuth introspection client secret for the MCP HTTP server.
 * SOCKET_OAUTH_INTROSPECTION_CLIENT_SECRET — paired with the client ID for
 * authenticated introspection requests. Empty string when unset.
 *
 * @example
 *   ;```typescript
 *   import { getSocketOauthIntrospectionClientSecret } from '@socketsecurity/lib/env/socket'
 *
 *   const clientSecret = getSocketOauthIntrospectionClientSecret()
 *   ```
 *
 * @returns The OAuth client secret, or `''` if not set
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketOauthIntrospectionClientSecret(): string {
  return getEnvValue('SOCKET_OAUTH_INTROSPECTION_CLIENT_SECRET') ?? ''
}

/**
 * OAuth issuer URL for the MCP HTTP server. SOCKET_OAUTH_ISSUER — issuer to
 * validate inbound OAuth tokens against. Returns the empty string when unset;
 * callers treat empty as "no issuer configured".
 *
 * @example
 *   ;```typescript
 *   import { getSocketOauthIssuer } from '@socketsecurity/lib/env/socket'
 *
 *   const issuer = getSocketOauthIssuer()
 *   if (issuer) { ... }
 *   ```
 *
 * @returns The OAuth issuer URL, or `''` if not set
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketOauthIssuer(): string {
  return getEnvValue('SOCKET_OAUTH_ISSUER') ?? ''
}

/**
 * Required OAuth scopes for the MCP HTTP server. SOCKET_OAUTH_REQUIRED_SCOPES —
 * whitespace-separated list of scopes inbound tokens must carry. Defaults to
 * `'packages:list'` (the minimum scope socket-mcp's depscore tool needs).
 *
 * @example
 *   ;```typescript
 *   import { getSocketOauthRequiredScopes } from '@socketsecurity/lib/env/socket'
 *
 *   const scopes = getSocketOauthRequiredScopes().split(/\s+/u)
 *   ```
 *
 * @returns The required-scopes string, defaulting to `'packages:list'`
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketOauthRequiredScopes(): string {
  return getEnvValue('SOCKET_OAUTH_REQUIRED_SCOPES') ?? 'packages:list'
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
export function getSocketRepositoryName(): string | undefined {
  return (
    getEnvValue('SOCKET_REPOSITORY_NAME') ||
    // Used by Coana.
    getEnvValue('SOCKET_REPO_NAME')
  )
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
/*@__NO_SIDE_EFFECTS__*/
export function getSocketViewAllRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_VIEW_ALL_RISKS'))
}

/**
 * Whether the MCP HTTP server should trust upstream proxy headers. TRUST_PROXY
 * — when set to the literal string `'true'`, the server honors
 * `X-Forwarded-Host` / `X-Forwarded-Proto` when composing OAuth metadata URLs.
 * Off by default to prevent header spoofing when no upstream proxy is present.
 *
 * @example
 *   ;```typescript
 *   import { getTrustProxy } from '@socketsecurity/lib/env/socket'
 *
 *   if (getTrustProxy()) { ... }
 *   ```
 *
 * @returns `true` if proxy headers are trusted, `false` otherwise
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTrustProxy(): boolean {
  return getEnvValue('TRUST_PROXY') === 'true'
}
