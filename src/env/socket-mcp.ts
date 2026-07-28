/**
 * @file Socket MCP HTTP server environment variable getters. Covers the MCP
 *   transport (HTTP mode, port) and the OAuth credentials / proxy-trust
 *   settings the MCP HTTP server reads at startup.
 */

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
 *   import { getMcpHttpMode } from '@socketsecurity/lib/env/socket-mcp'
 *
 *   if (getMcpHttpMode()) {
 *     startHttpServer()
 *   }
 *   ```
 *
 * @returns `true` if HTTP mode is enabled, `false` otherwise
 */
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
 *   import { getMcpPort } from '@socketsecurity/lib/env/socket-mcp'
 *
 *   const port = getMcpPort()
 *   ```
 *
 * @returns The MCP server port (default `3000`)
 */
export function getMcpPort(): number {
  const parsed = envAsNumber(getEnvValue('MCP_PORT'))
  return NumberIsFinite(parsed) && parsed > 0 ? parsed : 3000
}

/**
 * OAuth introspection client ID for the MCP HTTP server.
 * SOCKET_OAUTH_INTROSPECTION_CLIENT_ID — client credential used to call the
 * issuer's introspection endpoint. Empty string when unset.
 *
 * @example
 *   ;```typescript
 *   import { getSocketOauthIntrospectionClientId } from '@socketsecurity/lib/env/socket-mcp'
 *
 *   const clientId = getSocketOauthIntrospectionClientId()
 *   ```
 *
 * @returns The OAuth client ID, or `''` if not set
 */
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
 *   import { getSocketOauthIntrospectionClientSecret } from '@socketsecurity/lib/env/socket-mcp'
 *
 *   const clientSecret = getSocketOauthIntrospectionClientSecret()
 *   ```
 *
 * @returns The OAuth client secret, or `''` if not set
 */
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
 *   import { getSocketOauthIssuer } from '@socketsecurity/lib/env/socket-mcp'
 *
 *   const issuer = getSocketOauthIssuer()
 *   if (issuer) { ... }
 *   ```
 *
 * @returns The OAuth issuer URL, or `''` if not set
 */
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
 *   import { getSocketOauthRequiredScopes } from '@socketsecurity/lib/env/socket-mcp'
 *
 *   const scopes = getSocketOauthRequiredScopes().split(/\s+/u)
 *   ```
 *
 * @returns The required-scopes string, defaulting to `'packages:list'`
 */
export function getSocketOauthRequiredScopes(): string {
  return getEnvValue('SOCKET_OAUTH_REQUIRED_SCOPES') ?? 'packages:list'
}

/**
 * Whether the MCP HTTP server should trust upstream proxy headers. TRUST_PROXY
 * — when set to the literal string `'true'`, the server honors
 * `X-Forwarded-Host` / `X-Forwarded-Proto` when composing OAuth metadata URLs.
 * Off by default to prevent header spoofing when no upstream proxy is present.
 *
 * @example
 *   ;```typescript
 *   import { getTrustProxy } from '@socketsecurity/lib/env/socket-mcp'
 *
 *   if (getTrustProxy()) { ... }
 *   ```
 *
 * @returns `true` if proxy headers are trusted, `false` otherwise
 */
export function getTrustProxy(): boolean {
  return getEnvValue('TRUST_PROXY') === 'true'
}
