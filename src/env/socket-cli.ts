/**
 * @fileoverview Socket CLI environment variables.
 * Provides typed getters for SOCKET_CLI_* environment variables (excluding shadow).
 */

import { envAsBoolean, envAsNumber } from '#env/helpers'
import { getEnvValue } from '#env/rewire'

/**
 * Whether to accept all Socket CLI risks (alternative name).
 *
 * @returns Whether to accept all risks
 */
export function getSocketCliAcceptRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_ACCEPT_RISKS'))
}

/**
 * Socket CLI API base URL (alternative name).
 *
 * @returns API base URL or undefined
 */
export function getSocketCliApiBaseUrl(): string | undefined {
  return getEnvValue('SOCKET_CLI_API_BASE_URL')
}

/**
 * Proxy URL for Socket CLI API requests (alternative name).
 *
 * @returns API proxy URL or undefined
 */
export function getSocketCliApiProxy(): string | undefined {
  return getEnvValue('SOCKET_CLI_API_PROXY')
}

/**
 * Timeout in milliseconds for Socket CLI API requests (alternative name).
 *
 * @returns API timeout in milliseconds
 */
export function getSocketCliApiTimeout(): number {
  return envAsNumber(getEnvValue('SOCKET_CLI_API_TIMEOUT'))
}

/**
 * Socket CLI API authentication token (alternative name).
 *
 * @returns API token or undefined
 */
export function getSocketCliApiToken(): string | undefined {
  return getEnvValue('SOCKET_CLI_API_TOKEN')
}

/**
 * Socket CLI configuration file path (alternative name).
 *
 * @returns Config file path or undefined
 */
export function getSocketCliConfig(): string | undefined {
  return getEnvValue('SOCKET_CLI_CONFIG')
}

/**
 * Controls Socket CLI fix mode.
 *
 * @returns Fix mode value or undefined
 */
export function getSocketCliFix(): string | undefined {
  return getEnvValue('SOCKET_CLI_FIX')
}

/**
 * Whether to skip Socket CLI API token requirement (alternative name).
 *
 * @returns Whether to skip API token requirement
 */
export function getSocketCliNoApiToken(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_NO_API_TOKEN'))
}

/**
 * Controls Socket CLI optimization mode.
 *
 * @returns Whether optimization mode is enabled
 */
export function getSocketCliOptimize(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_OPTIMIZE'))
}

/**
 * Socket CLI organization slug identifier (alternative name).
 *
 * @returns Organization slug or undefined
 */
export function getSocketCliOrgSlug(): string | undefined {
  return getEnvValue('SOCKET_CLI_ORG_SLUG')
}

/**
 * Whether to view all Socket CLI risks (alternative name).
 *
 * @returns Whether to view all risks
 */
export function getSocketCliViewAllRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_VIEW_ALL_RISKS'))
}

/**
 * Socket CLI GitHub authentication token.
 *
 * @returns GitHub token or undefined
 */
export function getSocketCliGithubToken(): string | undefined {
  return getEnvValue('SOCKET_CLI_GITHUB_TOKEN')
}
