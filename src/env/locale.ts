/**
 * @fileoverview Locale and language environment variable getters.
 * Provides access to system locale settings.
 */

import { getEnvValue } from './rewire'

/**
 * LANG environment variable.
 * System locale and language settings.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getLang(): string | undefined {
  return getEnvValue('LANG')
}

/**
 * LC_ALL environment variable.
 * Override for all locale settings.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getLcAll(): string | undefined {
  return getEnvValue('LC_ALL')
}

/**
 * LC_MESSAGES environment variable.
 * Locale setting for message translations.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getLcMessages(): string | undefined {
  return getEnvValue('LC_MESSAGES')
}
