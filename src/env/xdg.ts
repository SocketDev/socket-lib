/**
 * @file XDG Base Directory Specification environment variable getters. Provides
 *   access to XDG user directories on Unix systems.
 */

import { getEnvValue } from './rewire'

/**
 * XDG_CACHE_HOME environment variable. XDG Base Directory specification cache
 * directory.
 *
 * @example
 *   ;```typescript
 *   import { getXdgCacheHome } from '@socketsecurity/lib/env/xdg'
 *
 *   const cacheDir = getXdgCacheHome()
 *   // e.g. '/tmp/.cache' or undefined
 *   ```
 *
 * @returns The XDG cache directory path, or `undefined` if not set
 */
export function getXdgCacheHome(): string | undefined {
  return getEnvValue('XDG_CACHE_HOME')
}

/**
 * XDG_CONFIG_HOME environment variable. XDG Base Directory specification config
 * directory.
 *
 * @example
 *   ;```typescript
 *   import { getXdgConfigHome } from '@socketsecurity/lib/env/xdg'
 *
 *   const configDir = getXdgConfigHome()
 *   // e.g. '/tmp/.config' or undefined
 *   ```
 *
 * @returns The XDG config directory path, or `undefined` if not set
 */
export function getXdgConfigHome(): string | undefined {
  return getEnvValue('XDG_CONFIG_HOME')
}

/**
 * XDG_DATA_HOME environment variable. Points to the user's data directory on
 * Unix systems.
 *
 * @example
 *   ;```typescript
 *   import { getXdgDataHome } from '@socketsecurity/lib/env/xdg'
 *
 *   const dataDir = getXdgDataHome()
 *   // e.g. '/tmp/.local/share' or undefined
 *   ```
 *
 * @returns The XDG data directory path, or `undefined` if not set
 */
export function getXdgDataHome(): string | undefined {
  return getEnvValue('XDG_DATA_HOME')
}

/**
 * XDG_RUNTIME_DIR environment variable. XDG Base Directory specification
 * runtime directory — the home for ephemeral, owner-only runtime objects
 * (daemon sockets, locks). Set by systemd to `/run/user/<uid>`; absent on
 * macOS and many non-systemd setups, so callers must provide a fallback.
 *
 * @example
 *   ;```typescript
 *   import { getXdgRuntimeDir } from '@socketsecurity/lib/env/xdg'
 *
 *   const runtimeDir = getXdgRuntimeDir()
 *   // e.g. '/run/user/1000' or undefined
 *   ```
 *
 * @returns The XDG runtime directory path, or `undefined` if not set
 */
export function getXdgRuntimeDir(): string | undefined {
  return getEnvValue('XDG_RUNTIME_DIR')
}
