/**
 * @file Path utilities for Socket ecosystem directories. Platform-aware
 *   resolution for the shared ~/.socket/ layout. The `_`-prefixed entries are
 *   Socket-managed DIRS (not apps): `_cacache` content-addressable cache;
 *   `_dlx/<hash>/` name+version binary store (node, jre, python, sfw, …);
 *   `_state/<app>/` version-LESS persistent app state (daemon socket + lock +
 *   OAuth refresh; mirrors pnpm `state-dir` / XDG_STATE_HOME), with
 *   `_state/<app>/run/` for a daemon's socket/lock/pid; `_wheelhouse`
 *   cross-fleet shared bin. Generic per-app dirs (`getSocketAppDir('<name>')`)
 *   nest under the same `_`-prefix.
 */

import { SOCKET_DIR, SOCKET_DIR_PREFIX } from '../constants/socket'
import { getHome } from '../env/home'
import {
  getSocketCacacheDirEnv,
  getSocketDlxDirEnv,
  getSocketHome,
  getSocketStateDirEnv,
} from '../env/socket'
import { getUserprofile } from '../env/windows'

import { CACHE_DIR, CACHE_TTL_DIR, DOT_SOCKET_DIR, RUN_DIR } from './dirnames'
import { normalizePath } from './normalize'
import { getPathValue } from './rewire'

import { getNodeOs } from '../node/os'
import { getNodePath } from '../node/path'

/**
 * Get the OS home directory. Can be overridden in tests using
 * setPath('homedir', ...) from paths/rewire.
 */
export function getOsHomeDir(): string {
  // Always check for overrides - don't cache when using rewire
  const os = getNodeOs()
  return getPathValue('homedir', () => os.homedir())
}
/**
 * Get the OS temporary directory. Can be overridden in tests using
 * setPath('tmpdir', ...) from paths/rewire.
 */

/**
 * Get the OS temporary directory. Can be overridden in tests using
 * setPath('tmpdir', ...) from paths/rewire.
 */
export function getOsTmpDir(): string {
  // Always check for overrides - don't cache when using rewire
  const os = getNodeOs()
  return getPathValue('tmpdir', () => os.tmpdir())
}
/**
 * Get a Socket app cache directory (~/.socket/_<appName>/cache).
 */

/**
 * Get a Socket app cache directory (~/.socket/_<appName>/cache).
 */
export function getSocketAppCacheDir(appName: string): string {
  const path = getNodePath()
  return normalizePath(path.join(getSocketAppDir(appName), CACHE_DIR))
}
/**
 * Get a Socket app TTL cache directory (~/.socket/_<appName>/cache/ttl).
 */

/**
 * Get a Socket app TTL cache directory (~/.socket/_<appName>/cache/ttl).
 */
export function getSocketAppCacheTtlDir(appName: string): string {
  const path = getNodePath()
  return normalizePath(path.join(getSocketAppCacheDir(appName), CACHE_TTL_DIR))
}
/**
 * Get a Socket app directory (~/.socket/_<appName>). The `_` prefix is applied
 * here; pass the bare app name (e.g. 'socket', 'registry').
 */

/**
 * Get a Socket app directory (~/.socket/_<appName>). The `_` prefix is applied
 * here; pass the bare app name (e.g. 'socket', 'registry').
 */
export function getSocketAppDir(appName: string): string {
  const path = getNodePath()
  return normalizePath(
    path.join(getSocketUserDir(), `${SOCKET_DIR_PREFIX}${appName}`),
  )
}
/**
 * Get the Socket cacache directory (~/.socket/_cacache). Override precedence:
 * setPath('socket-cacache-dir', …) → SOCKET_CACACHE_DIR env →
 * $SOCKET_HOME/_cacache → $HOME/.socket/_cacache.
 */

/**
 * Get an app's runtime directory (~/.socket/_state/<app>/run/) — the home for a
 * daemon's Unix socket + `concurrency.lock` + `<socket>.pid`. Version-less so
 * the socket path is stable across binary upgrades.
 */
export function getSocketAppRuntimeDir(appName: string): string {
  const path = getNodePath()
  return normalizePath(path.join(getSocketAppStateDir(appName), RUN_DIR))
}
/**
 * Get the Socket user directory (~/.socket). Override precedence:
 * setPath('socket-user-dir', …) → SOCKET_HOME env → $HOME/.socket →
 * /tmp/.socket (Unix) or %TEMP%.socket (Windows).
 */

/**
 * Get an app's persistent state directory (~/.socket/_state/<app>/). The
 * `<app>` is a real app (proteus, acorn) nesting its version-less state inside
 * the `_state` infra dir.
 */
export function getSocketAppStateDir(appName: string): string {
  const path = getNodePath()
  return normalizePath(path.join(getSocketStateDir(), appName))
}
/**
 * Get an app's runtime directory (~/.socket/_state/<app>/run/) — the home for a
 * daemon's Unix socket + `concurrency.lock` + `<socket>.pid`. Version-less so
 * the socket path is stable across binary upgrades.
 */

/**
 * Get the Socket cacache directory (~/.socket/_cacache). Override precedence:
 * setPath('socket-cacache-dir', …) → SOCKET_CACACHE_DIR env →
 * $SOCKET_HOME/_cacache → $HOME/.socket/_cacache.
 */
export function getSocketCacacheDir(): string {
  return getPathValue('socket-cacache-dir', () => {
    if (getSocketCacacheDirEnv()) {
      return normalizePath(getSocketCacacheDirEnv() as string)
    }
    const path = getNodePath()
    return normalizePath(path.join(getSocketUserDir(), SOCKET_DIR.cacache))
  })
}
/**
 * Get the Socket DLX directory (~/.socket/_dlx) — the name+version binary store
 * (node, jre, python, sfw, …). Override precedence: setPath('socket-dlx-dir',
 * …) → SOCKET_DLX_DIR env → $SOCKET_HOME/_dlx → $HOME/.socket/_dlx.
 */

/**
 * Get the Socket DLX directory (~/.socket/_dlx) — the name+version binary store
 * (node, jre, python, sfw, …). Override precedence: setPath('socket-dlx-dir',
 * …) → SOCKET_DLX_DIR env → $SOCKET_HOME/_dlx → $HOME/.socket/_dlx.
 */
export function getSocketDlxDir(): string {
  return getPathValue('socket-dlx-dir', () => {
    if (getSocketDlxDirEnv()) {
      return normalizePath(getSocketDlxDirEnv() as string)
    }
    const path = getNodePath()
    return normalizePath(path.join(getSocketUserDir(), SOCKET_DIR.dlx))
  })
}
/**
 * Get the Socket home directory (~/.socket). Alias for getSocketUserDir() for
 * consistency across Socket projects.
 */

/**
 * Get the Socket home directory (~/.socket). Alias for getSocketUserDir() for
 * consistency across Socket projects.
 */
export function getSocketHomePath(): string {
  return getSocketUserDir()
}
/**
 * Get the Socket state directory (~/.socket/_state) — version-LESS persistent
 * app state (the home for daemon sockets, locks, OAuth refresh, durable caches
 * that survive version bumps; mirrors pnpm `state-dir` / XDG_STATE_HOME).
 * Override precedence: setPath('socket-state-dir', …) → SOCKET_STATE_DIR env →
 * $SOCKET_HOME/_state → $HOME/.socket/_state.
 */

/**
 * Get the Socket state directory (~/.socket/_state) — version-LESS persistent
 * app state (the home for daemon sockets, locks, OAuth refresh, durable caches
 * that survive version bumps; mirrors pnpm `state-dir` / XDG_STATE_HOME).
 * Override precedence: setPath('socket-state-dir', …) → SOCKET_STATE_DIR env →
 * $SOCKET_HOME/_state → $HOME/.socket/_state.
 */
export function getSocketStateDir(): string {
  return getPathValue('socket-state-dir', () => {
    if (getSocketStateDirEnv()) {
      return normalizePath(getSocketStateDirEnv() as string)
    }
    const path = getNodePath()
    return normalizePath(path.join(getSocketUserDir(), SOCKET_DIR.state))
  })
}
/**
 * Get an app's persistent state directory (~/.socket/_state/<app>/). The
 * `<app>` is a real app (proteus, acorn) nesting its version-less state inside
 * the `_state` infra dir.
 */

/**
 * Get the Socket user directory (~/.socket). Override precedence:
 * setPath('socket-user-dir', …) → SOCKET_HOME env → $HOME/.socket →
 * /tmp/.socket (Unix) or %TEMP%.socket (Windows).
 */
export function getSocketUserDir(): string {
  return getPathValue('socket-user-dir', () => {
    const socketHome = getSocketHome()
    if (socketHome) {
      return normalizePath(socketHome)
    }
    const path = getNodePath()
    return normalizePath(path.join(getUserHomeDir(), DOT_SOCKET_DIR))
  })
}
/**
 * Get the Socket Wheelhouse directory (~/.socket/_wheelhouse). Shared
 * cross-fleet location for binaries that every fleet member can reach without
 * each one re-downloading and re-extracting per-repo. Tool installers (janus,
 * sfw, etc.) drop their resolved executables under
 * `<wheelhouse>/<tool>/<version>/<platform-arch>/`; consumers add the
 * appropriate `bin/` to PATH or invoke the binary by absolute path. Override
 * precedence: setPath('socket-wheelhouse-dir', …) → $SOCKET_HOME/_wheelhouse →
 * $HOME/.socket/_wheelhouse.
 */

/**
 * Get the Socket Wheelhouse directory (~/.socket/_wheelhouse). Shared
 * cross-fleet location for binaries that every fleet member can reach without
 * each one re-downloading and re-extracting per-repo. Tool installers (janus,
 * sfw, etc.) drop their resolved executables under
 * `<wheelhouse>/<tool>/<version>/<platform-arch>/`; consumers add the
 * appropriate `bin/` to PATH or invoke the binary by absolute path. Override
 * precedence: setPath('socket-wheelhouse-dir', …) → $SOCKET_HOME/_wheelhouse →
 * $HOME/.socket/_wheelhouse.
 */
export function getSocketWheelhouseDir(): string {
  return getPathValue('socket-wheelhouse-dir', () => {
    const path = getNodePath()
    return normalizePath(path.join(getSocketUserDir(), SOCKET_DIR.wheelhouse))
  })
}
/**
 * Get the user's home directory. Uses environment variables directly to support
 * test mocking. Falls back to temporary directory if home is not available.
 *
 * Priority order: 1. HOME (Unix) 2. USERPROFILE (Windows) 3.
 * getNodeOs().homedir() 4. Fallback: getNodeOs().tmpdir() (restricted envs).
 */

/**
 * Get the user's home directory. Uses environment variables directly to support
 * test mocking. Falls back to temporary directory if home is not available.
 *
 * Priority order: 1. HOME (Unix) 2. USERPROFILE (Windows) 3.
 * getNodeOs().homedir() 4. Fallback: getNodeOs().tmpdir() (restricted envs).
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
  // Try getNodeOs().homedir()
  try {
    const osHome = getOsHomeDir()
    if (osHome) {
      return osHome
    }
  } catch {
    // getNodeOs().homedir() can throw in restricted environments
  }
  /* c8 ignore next 2 - Triple-fallback only fires when HOME +
     USERPROFILE + os.homedir() all fail; not reachable in tests. */
  return getOsTmpDir()
}
