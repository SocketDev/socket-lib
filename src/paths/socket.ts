/**
 * @fileoverview Path utilities for Socket ecosystem directories.
 * Provides platform-aware path resolution for Socket tools' shared directory structure.
 *
 * Directory Structure:
 * ~/.socket/
 * ├── _cacache/           # Content-addressable cache for npm packages
 * ├── _dlx/               # DLX installations (content-addressed by hash)
 * │   ├── <hash>/         # npm package installs (dlx-package)
 * │   └── <hash>/         # binary downloads (dlx-binary)
 * ├── _socket/            # Socket CLI app directory
 * ├── _registry/          # Socket Registry app directory
 * └── _sfw/               # Socket Firewall app directory
 */

import * as os from 'os'
import * as path from 'path'

import { CACHE_GITHUB_DIR } from '../constants/github'
import {
  SOCKET_APP_PREFIX,
  SOCKET_CLI_APP_NAME,
  SOCKET_DLX_APP_NAME,
  SOCKET_REGISTRY_APP_NAME,
} from '../constants/socket'
import { getHome } from '../env/home'
import {
  getSocketCacacheDir as getSocketCacacheDirEnv,
  getSocketDlxDirEnv,
  getSocketHome,
} from '../env/socket'
import { getUserprofile } from '../env/windows'

import { CACHE_DIR, CACHE_TTL_DIR, DOT_SOCKET_DIR } from './dirnames'
import { normalizePath } from './normalize'
import { getPathValue } from './rewire'

/**
 * Get the OS home directory.
 * Can be overridden in tests using setPath('homedir', ...) from paths/rewire.
 */
export function getOsHomeDir(): string {
  // Always check for overrides - don't cache when using rewire
  return getPathValue('homedir', () => os.homedir())
}

/**
 * Get the OS temporary directory.
 * Can be overridden in tests using setPath('tmpdir', ...) from paths/rewire.
 */
export function getOsTmpDir(): string {
  // Always check for overrides - don't cache when using rewire
  return getPathValue('tmpdir', () => os.tmpdir())
}

/**
 * Get the Socket home directory (~/.socket).
 * Alias for getSocketUserDir() for consistency across Socket projects.
 */
export function getSocketHomePath(): string {
  return getSocketUserDir()
}

/**
 * Get the Socket user directory (~/.socket).
 * Can be overridden with SOCKET_HOME environment variable or via setPath() for testing.
 * Result is cached via getPathValue for performance.
 *
 * Priority order:
 *   1. Test override via setPath('socket-user-dir', ...)
 *   2. SOCKET_HOME - Base directory override
 *   3. Default: $HOME/.socket
 *   4. Fallback: /tmp/.socket (Unix) or %TEMP%\.socket (Windows)
 */
export function getSocketUserDir(): string {
  return getPathValue('socket-user-dir', () => {
    const socketHome = getSocketHome()
    if (socketHome) {
      return normalizePath(socketHome)
    }
    return normalizePath(path.join(getUserHomeDir(), DOT_SOCKET_DIR))
  })
}

/**
 * Get a Socket app directory (~/.socket/_<appName>).
 */
export function getSocketAppDir(appName: string): string {
  return normalizePath(
    path.join(getSocketUserDir(), `${SOCKET_APP_PREFIX}${appName}`),
  )
}

/**
 * Get the Socket cacache directory (~/.socket/_cacache).
 * Can be overridden with SOCKET_CACACHE_DIR environment variable or via setPath() for testing.
 * Result is cached via getPathValue for performance.
 *
 * Priority order:
 *   1. Test override via setPath('socket-cacache-dir', ...)
 *   2. SOCKET_CACACHE_DIR - Full override of cacache directory
 *   3. Default: $SOCKET_HOME/_cacache or $HOME/.socket/_cacache
 */
export function getSocketCacacheDir(): string {
  return getPathValue('socket-cacache-dir', () => {
    if (getSocketCacacheDirEnv()) {
      return normalizePath(getSocketCacacheDirEnv() as string)
    }
    return normalizePath(
      path.join(getSocketUserDir(), `${SOCKET_APP_PREFIX}cacache`),
    )
  })
}

/**
 * Get the Socket DLX directory (~/.socket/_dlx).
 * Can be overridden with SOCKET_DLX_DIR environment variable or via setPath() for testing.
 * Result is cached via getPathValue for performance.
 *
 * Priority order:
 *   1. Test override via setPath('socket-dlx-dir', ...)
 *   2. SOCKET_DLX_DIR - Full override of DLX cache directory
 *   3. SOCKET_HOME/_dlx - Base directory override (inherits from getSocketUserDir)
 *   4. Default: $HOME/.socket/_dlx
 *   5. Fallback: /tmp/.socket/_dlx (Unix) or %TEMP%\.socket\_dlx (Windows)
 */
export function getSocketDlxDir(): string {
  return getPathValue('socket-dlx-dir', () => {
    if (getSocketDlxDirEnv()) {
      return normalizePath(getSocketDlxDirEnv() as string)
    }
    return normalizePath(
      path.join(
        getSocketUserDir(),
        `${SOCKET_APP_PREFIX}${SOCKET_DLX_APP_NAME}`,
      ),
    )
  })
}

/**
 * Get a Socket app cache directory (~/.socket/_<appName>/cache).
 */
export function getSocketAppCacheDir(appName: string): string {
  return normalizePath(path.join(getSocketAppDir(appName), CACHE_DIR))
}

/**
 * Get a Socket app TTL cache directory (~/.socket/_<appName>/cache/ttl).
 */
export function getSocketAppCacheTtlDir(appName: string): string {
  return normalizePath(path.join(getSocketAppCacheDir(appName), CACHE_TTL_DIR))
}

/**
 * Get the Socket CLI directory (~/.socket/_socket).
 */
export function getSocketCliDir(): string {
  return getSocketAppDir(SOCKET_CLI_APP_NAME)
}

/**
 * Get the Socket Registry directory (~/.socket/_registry).
 */
export function getSocketRegistryDir(): string {
  return getSocketAppDir(SOCKET_REGISTRY_APP_NAME)
}

/**
 * Get the Socket Registry GitHub cache directory (~/.socket/_registry/cache/ttl/github).
 */
export function getSocketRegistryGithubCacheDir(): string {
  return normalizePath(
    path.join(
      getSocketAppCacheTtlDir(SOCKET_REGISTRY_APP_NAME),
      CACHE_GITHUB_DIR,
    ),
  )
}

/**
 * Get the user's home directory.
 * Uses environment variables directly to support test mocking.
 * Falls back to temporary directory if home is not available.
 *
 * Priority order:
 *   1. HOME environment variable (Unix)
 *   2. USERPROFILE environment variable (Windows)
 *   3. os.homedir()
 *   4. Fallback: os.tmpdir() (rarely used, for restricted environments)
 */
export function getUserHomeDir(): string {
  // Try HOME first (Unix)
  const home = getHome()
  if (home) {
    return home
  }
  // Try USERPROFILE (Windows)
  const userProfile = getUserprofile()
  if (userProfile) {
    return userProfile
  }
  // Try os.homedir()
  try {
    const osHome = getOsHomeDir()
    if (osHome) {
      return osHome
    }
  } catch {
    // os.homedir() can throw in restricted environments
  }
  // Final fallback to temp directory (rarely used)
  return getOsTmpDir()
}
