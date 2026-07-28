/**
 * @file Socket CLI environment variables. Provides typed getters for
 *   SOCKET_CLI_* environment variables (excluding shadow).
 */

import { envAsBoolean } from './boolean'
import { envAsNumber } from './number'
import { getEnvValue } from './rewire'

/**
 * Whether to accept all Socket CLI risks (alternative name).
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliAcceptRisks } from '@socketsecurity/lib/env/socket-cli'
 *
 *   if (getSocketCliAcceptRisks()) {
 *     console.log('All risks accepted')
 *   }
 *   ```
 *
 * @returns Whether to accept all risks
 */
export function getSocketCliAcceptRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_ACCEPT_RISKS'))
}

/**
 * Socket CLI API base URL (alternative name). Checks SOCKET_CLI_API_BASE_URL
 * first, then falls back to legacy SOCKET_SECURITY_API_BASE_URL.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliApiBaseUrl } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const baseUrl = getSocketCliApiBaseUrl()
 *   // e.g. 'https://api.socket.dev' or undefined
 *   ```
 *
 * @returns API base URL or undefined
 */
export function getSocketCliApiBaseUrl(): string | undefined {
  return (
    getEnvValue('SOCKET_CLI_API_BASE_URL') ||
    getEnvValue('SOCKET_SECURITY_API_BASE_URL')
  )
}

/**
 * Proxy URL for Socket CLI API requests (alternative name). Checks
 * SOCKET_CLI_API_PROXY, SOCKET_SECURITY_API_PROXY, then standard proxy env
 * vars. Follows the same precedence as v1.x: HTTPS_PROXY → https_proxy →
 * HTTP_PROXY → http_proxy.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliApiProxy } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const proxy = getSocketCliApiProxy()
 *   // e.g. 'http://proxy.example.com:8080' or undefined
 *   ```
 *
 * @returns API proxy URL or undefined
 */
export function getSocketCliApiProxy(): string | undefined {
  return (
    getEnvValue('SOCKET_CLI_API_PROXY') ||
    getEnvValue('SOCKET_SECURITY_API_PROXY') ||
    getEnvValue('HTTPS_PROXY') ||
    getEnvValue('https_proxy') ||
    getEnvValue('HTTP_PROXY') ||
    getEnvValue('http_proxy')
  )
}

/**
 * Timeout in milliseconds for Socket CLI API requests (alternative name).
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliApiTimeout } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const timeout = getSocketCliApiTimeout()
 *   // e.g. 30000 or 0 if not set
 *   ```
 *
 * @returns API timeout in milliseconds
 */
export function getSocketCliApiTimeout(): number {
  return envAsNumber(getEnvValue('SOCKET_CLI_API_TIMEOUT'))
}

/**
 * Bootstrap cache directory path. Set by bootstrap wrappers to pass dlx cache
 * location to CLI.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliBootstrapCacheDir } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const cacheDir = getSocketCliBootstrapCacheDir()
 *   // e.g. '/tmp/.socket-cli-cache' or undefined
 *   ```
 *
 * @returns Bootstrap cache directory or undefined
 */
export function getSocketCliBootstrapCacheDir(): string | undefined {
  return getEnvValue('SOCKET_CLI_BOOTSTRAP_CACHE_DIR')
}

/**
 * Bootstrap package spec (e.g., @socketsecurity/cli@^2.0.11). Set by bootstrap
 * wrappers (SEA/smol/npm) to pass package spec to CLI.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliBootstrapSpec } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const spec = getSocketCliBootstrapSpec()
 *   // e.g. '@socketsecurity/cli@^2.0.11' or undefined
 *   ```
 *
 * @returns Bootstrap package spec or undefined
 */
export function getSocketCliBootstrapSpec(): string | undefined {
  return getEnvValue('SOCKET_CLI_BOOTSTRAP_SPEC')
}

/**
 * Socket CLI configuration file path (alternative name).
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliConfig } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const config = getSocketCliConfig()
 *   // e.g. '/tmp/project/socket.yml' or undefined
 *   ```
 *
 * @returns Config file path or undefined
 */
export function getSocketCliConfig(): string | undefined {
  return getEnvValue('SOCKET_CLI_CONFIG')
}

/**
 * Controls Socket CLI fix mode.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliFix } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const fix = getSocketCliFix()
 *   // e.g. 'true' or undefined
 *   ```
 *
 * @returns Fix mode value or undefined
 */
export function getSocketCliFix(): string | undefined {
  return getEnvValue('SOCKET_CLI_FIX')
}

/**
 * Socket CLI GitHub authentication token. Checks SOCKET_CLI_GITHUB_TOKEN, then
 * SOCKET_SECURITY_GITHUB_PAT. It does NOT fall back to the generic GITHUB_TOKEN
 * — callers wanting the standard token compose `getGitHubToken()` on top (as
 * the CLI's own token wrapper does), keeping the CLI-specific and generic token
 * concerns separate.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliGithubToken } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const token = getSocketCliGithubToken()
 *   // e.g. 'ghp_abc123...' or undefined
 *   ```
 *
 * @returns GitHub token or undefined
 */
export function getSocketCliGithubToken(): string | undefined {
  return (
    getEnvValue('SOCKET_CLI_GITHUB_TOKEN') ||
    getEnvValue('SOCKET_SECURITY_GITHUB_PAT') ||
    undefined
  )
}

/**
 * Whether to skip Socket CLI API token requirement (alternative name).
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliNoApiToken } from '@socketsecurity/lib/env/socket-cli'
 *
 *   if (getSocketCliNoApiToken()) {
 *     console.log('API token requirement skipped')
 *   }
 *   ```
 *
 * @returns Whether to skip API token requirement
 */
export function getSocketCliNoApiToken(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_NO_API_TOKEN'))
}

/**
 * Controls Socket CLI optimization mode.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliOptimize } from '@socketsecurity/lib/env/socket-cli'
 *
 *   if (getSocketCliOptimize()) {
 *     console.log('Optimization mode enabled')
 *   }
 *   ```
 *
 * @returns Whether optimization mode is enabled
 */
export function getSocketCliOptimize(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_OPTIMIZE'))
}

/**
 * Socket CLI organization slug identifier (alternative name). Checks
 * SOCKET_CLI_ORG_SLUG first, then falls back to SOCKET_ORG_SLUG.
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliOrgSlug } from '@socketsecurity/lib/env/socket-cli'
 *
 *   const slug = getSocketCliOrgSlug()
 *   // e.g. 'my-org' or undefined
 *   ```
 *
 * @returns Organization slug or undefined
 */
export function getSocketCliOrgSlug(): string | undefined {
  return getEnvValue('SOCKET_CLI_ORG_SLUG') || getEnvValue('SOCKET_ORG_SLUG')
}

/**
 * Whether to view all Socket CLI risks (alternative name).
 *
 * @example
 *   ;```typescript
 *   import { getSocketCliViewAllRisks } from '@socketsecurity/lib/env/socket-cli'
 *
 *   if (getSocketCliViewAllRisks()) {
 *     console.log('Viewing all risks')
 *   }
 *   ```
 *
 * @returns Whether to view all risks
 */
export function getSocketCliViewAllRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_VIEW_ALL_RISKS'))
}
