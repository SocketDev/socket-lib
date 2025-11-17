/**
 * @fileoverview Windows environment variable getters.
 * Provides access to Windows-specific user directory paths.
 */

import { getEnvValue } from './rewire'

/**
 * APPDATA environment variable.
 * Points to the Application Data directory on Windows.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getAppdata(): string | undefined {
  return getEnvValue('APPDATA')
}

/**
 * LOCALAPPDATA environment variable.
 * Points to the Local Application Data directory on Windows.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getLocalappdata(): string | undefined {
  return getEnvValue('LOCALAPPDATA')
}

/**
 * USERPROFILE environment variable.
 * Windows user home directory path.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getUserprofile(): string | undefined {
  return getEnvValue('USERPROFILE')
}

/**
 * COMSPEC environment variable.
 * Points to the Windows command processor (typically cmd.exe).
 */
/*@__NO_SIDE_EFFECTS__*/
export function getComspec(): string | undefined {
  return getEnvValue('COMSPEC')
}
