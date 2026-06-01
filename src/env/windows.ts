/**
 * @file Windows environment variable getters. Provides access to
 *   Windows-specific user directory paths.
 */

import { getEnvValue } from './rewire'

/**
 * APPDATA environment variable. Points to the Application Data directory on
 * Windows.
 *
 * @example
 *   ;```typescript
 *   import { getAppdata } from '@socketsecurity/lib/env/windows'
 *
 *   const appdata = getAppdata()
 *   // e.g. 'C:\\Users\\Public\\AppData\\Roaming' or undefined
 *   ```
 *
 * @returns The Windows AppData roaming directory, or `undefined` if not set
 */
export function getAppdata(): string | undefined {
  return getEnvValue('APPDATA')
}

/**
 * COMSPEC environment variable. Points to the Windows command processor
 * (typically cmd.exe).
 *
 * @example
 *   ;```typescript
 *   import { getComspec } from '@socketsecurity/lib/env/windows'
 *
 *   const comspec = getComspec()
 *   // e.g. 'C:\\Windows\\system32\\cmd.exe' or undefined
 *   ```
 *
 * @returns The path to the command processor, or `undefined` if not set
 */
export function getComspec(): string | undefined {
  return getEnvValue('COMSPEC')
}

/**
 * LOCALAPPDATA environment variable. Points to the Local Application Data
 * directory on Windows.
 *
 * @example
 *   ;```typescript
 *   import { getLocalappdata } from '@socketsecurity/lib/env/windows'
 *
 *   const localAppdata = getLocalappdata()
 *   // e.g. 'C:\\Users\\Public\\AppData\\Local' or undefined
 *   ```
 *
 * @returns The Windows local AppData directory, or `undefined` if not set
 */
export function getLocalappdata(): string | undefined {
  return getEnvValue('LOCALAPPDATA')
}

/**
 * USERPROFILE environment variable. Windows user home directory path.
 *
 * @example
 *   ;```typescript
 *   import { getUserprofile } from '@socketsecurity/lib/env/windows'
 *
 *   const userprofile = getUserprofile()
 *   // e.g. 'C:\\Users\\Public' or undefined
 *   ```
 *
 * @returns The Windows user profile directory, or `undefined` if not set
 */
export function getUserprofile(): string | undefined {
  return getEnvValue('USERPROFILE')
}
