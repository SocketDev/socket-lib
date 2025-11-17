/**
 * @fileoverview Socket Security environment variable getters.
 */

import { envAsBoolean, envAsNumber } from './helpers'
import { getEnvValue } from './rewire'

/**
 * SOCKET_ACCEPT_RISKS environment variable getter.
 * Whether to accept all Socket Security risks.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketAcceptRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_ACCEPT_RISKS'))
}

/**
 * SOCKET_API_BASE_URL environment variable getter.
 * Socket Security API base URL.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketApiBaseUrl(): string | undefined {
  return getEnvValue('SOCKET_API_BASE_URL')
}

/**
 * SOCKET_API_PROXY environment variable getter.
 * Proxy URL for Socket Security API requests.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketApiProxy(): string | undefined {
  return getEnvValue('SOCKET_API_PROXY')
}

/**
 * SOCKET_API_TIMEOUT environment variable getter.
 * Timeout in milliseconds for Socket Security API requests.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketApiTimeout(): number {
  return envAsNumber(getEnvValue('SOCKET_API_TIMEOUT'))
}

/**
 * SOCKET_API_TOKEN environment variable getter.
 * Socket Security API authentication token.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketApiToken(): string | undefined {
  return getEnvValue('SOCKET_API_TOKEN')
}

/**
 * SOCKET_CACACHE_DIR environment variable getter.
 * Overrides the default Socket cacache directory location.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketCacacheDir(): string | undefined {
  return getEnvValue('SOCKET_CACACHE_DIR')
}

/**
 * SOCKET_CONFIG environment variable getter.
 * Socket Security configuration file path.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketConfig(): string | undefined {
  return getEnvValue('SOCKET_CONFIG')
}

/**
 * SOCKET_DEBUG environment variable getter.
 * Controls Socket-specific debug output.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketDebug(): string | undefined {
  return getEnvValue('SOCKET_DEBUG')
}

/**
 * SOCKET_DLX_DIR environment variable getter.
 * Overrides the default Socket DLX directory location.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketDlxDirEnv(): string | undefined {
  return getEnvValue('SOCKET_DLX_DIR')
}

/**
 * SOCKET_HOME environment variable getter.
 * Socket Security home directory path.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketHome(): string | undefined {
  return getEnvValue('SOCKET_HOME')
}

/**
 * SOCKET_NO_API_TOKEN environment variable getter.
 * Whether to skip Socket Security API token requirement.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketNoApiToken(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_NO_API_TOKEN'))
}

/**
 * SOCKET_NPM_REGISTRY environment variable getter.
 * Socket NPM registry URL (alternative name).
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketNpmRegistry(): string | undefined {
  return getEnvValue('SOCKET_NPM_REGISTRY')
}

/**
 * SOCKET_ORG_SLUG environment variable getter.
 * Socket Security organization slug identifier.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketOrgSlug(): string | undefined {
  return getEnvValue('SOCKET_ORG_SLUG')
}

/**
 * SOCKET_REGISTRY_URL environment variable getter.
 * Socket Registry URL for package installation.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketRegistryUrl(): string | undefined {
  return getEnvValue('SOCKET_REGISTRY_URL')
}

/**
 * SOCKET_VIEW_ALL_RISKS environment variable getter.
 * Whether to view all Socket Security risks.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketViewAllRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_VIEW_ALL_RISKS'))
}
