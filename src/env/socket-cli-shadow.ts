/**
 * @fileoverview Socket CLI shadow mode environment variables.
 * Provides typed getters for SOCKET_CLI_SHADOW_* environment variables.
 */

import { envAsBoolean } from './helpers'
import { getEnvValue } from './rewire'

/**
 * Controls Socket CLI shadow mode risk acceptance.
 *
 * @returns Whether to accept all risks in shadow mode
 *
 * @example
 * ```typescript
 * import { getSocketCliShadowAcceptRisks } from '@socketsecurity/lib/env/socket-cli-shadow'
 *
 * if (getSocketCliShadowAcceptRisks()) {
 *   console.log('Shadow mode risks accepted')
 * }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketCliShadowAcceptRisks(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_SHADOW_ACCEPT_RISKS'))
}

/**
 * API token for Socket CLI shadow mode.
 *
 * @returns Shadow mode API token or undefined
 *
 * @example
 * ```typescript
 * import { getSocketCliShadowApiToken } from '@socketsecurity/lib/env/socket-cli-shadow'
 *
 * const token = getSocketCliShadowApiToken()
 * // e.g. 'sk_shadow_abc123...' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketCliShadowApiToken(): string | undefined {
  return getEnvValue('SOCKET_CLI_SHADOW_API_TOKEN')
}

/**
 * Binary path for Socket CLI shadow mode.
 *
 * @returns Shadow mode binary path or undefined
 *
 * @example
 * ```typescript
 * import { getSocketCliShadowBin } from '@socketsecurity/lib/env/socket-cli-shadow'
 *
 * const bin = getSocketCliShadowBin()
 * // e.g. '/usr/local/bin/socket-shadow' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketCliShadowBin(): string | undefined {
  return getEnvValue('SOCKET_CLI_SHADOW_BIN')
}

/**
 * Controls Socket CLI shadow mode progress display.
 *
 * @returns Whether to show progress in shadow mode
 *
 * @example
 * ```typescript
 * import { getSocketCliShadowProgress } from '@socketsecurity/lib/env/socket-cli-shadow'
 *
 * if (getSocketCliShadowProgress()) {
 *   console.log('Shadow mode progress enabled')
 * }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketCliShadowProgress(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_SHADOW_PROGRESS'))
}

/**
 * Controls Socket CLI shadow mode silent operation.
 *
 * @returns Whether shadow mode should operate silently
 *
 * @example
 * ```typescript
 * import { getSocketCliShadowSilent } from '@socketsecurity/lib/env/socket-cli-shadow'
 *
 * if (getSocketCliShadowSilent()) {
 *   console.log('Shadow mode is silent')
 * }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSocketCliShadowSilent(): boolean {
  return envAsBoolean(getEnvValue('SOCKET_CLI_SHADOW_SILENT'))
}
