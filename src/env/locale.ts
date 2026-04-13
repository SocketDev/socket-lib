/**
 * @fileoverview Locale and language environment variable getters.
 * Provides access to system locale settings.
 */

import { getEnvValue } from './rewire'

/**
 * LANG environment variable.
 * System locale and language settings.
 *
 * @returns The system locale string, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getLang } from '@socketsecurity/lib/env/locale'
 *
 * const lang = getLang()
 * // e.g. 'en_US.UTF-8' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getLang(): string | undefined {
  return getEnvValue('LANG')
}

/**
 * LC_ALL environment variable.
 * Override for all locale settings.
 *
 * @returns The locale override string, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getLcAll } from '@socketsecurity/lib/env/locale'
 *
 * const lcAll = getLcAll()
 * // e.g. 'C' or 'en_US.UTF-8'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getLcAll(): string | undefined {
  return getEnvValue('LC_ALL')
}

/**
 * LC_MESSAGES environment variable.
 * Locale setting for message translations.
 *
 * @returns The messages locale string, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getLcMessages } from '@socketsecurity/lib/env/locale'
 *
 * const lcMessages = getLcMessages()
 * // e.g. 'en_US.UTF-8' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getLcMessages(): string | undefined {
  return getEnvValue('LC_MESSAGES')
}
