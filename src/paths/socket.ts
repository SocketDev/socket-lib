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
 * Get the Wheelhouse rack directory (~/.socket/_wheelhouse/rack) — the tool
 * STORE. Every `_wheelhouse`-managed CLI tool keeps its real binaries here,
 * racked by name + version as `<rack>/<tool>/<version>/…` (the wheelhouse
 * analog of Homebrew's `Cellar/`). The handles on PATH live in
 * `<wheelhouse>/bin` (getSocketWheelhouseBinDir) and point into the rack.
 * Inherits the `_wheelhouse` override chain (SOCKET_HOME /
 * setPath('socket-wheelhouse-dir')).
 */
export function getSocketRackDir(): string {
  const path = getNodePath()
  return normalizePath(path.join(getSocketWheelhouseDir(), 'rack'))
}
/**
 * Get a racked tool's version directory (~/.socket/_wheelhouse/rack/<tool>/
 * <version>) — the per-tool, per-version home under the rack. The
 * 1-path-1-reference owner of a tool install destination: installers resolve
 * their extract/copy target through this, and the `<wheelhouse>/bin/<tool>`
 * shim points at a binary inside it.
 */
export function getSocketRackToolDir(options: {
  tool: string
  version: string
}): string {
  const opts = { __proto__: null, ...options } as {
    tool: string
    version: string
  }
  const path = getNodePath()
  return normalizePath(path.join(getSocketRackDir(), opts.tool, opts.version))
}
/**
 * Get the Wheelhouse repo-clones directory (~/.socket/_wheelhouse/repo-clones).
 * Sits beside the per-tool dirs (sfw, codedb, janus, bin) under `_wheelhouse`.
 * The home for reference clones of EXTERNAL repos an agent reviews, each as
 * `<org>-<repo>` lowercased + dash-cased (e.g. `justrach-codedb`).
 *
 * Smallest-practical clone form (smallest disk + fastest initial fetch without
 * the treeless tax): git clone --depth=1 --single-branch --filter=blob:none
 * <url> <dest> `--depth=1` truncates history, `--single-branch` skips other
 * refs, and `--filter=blob:none` (a BLOBLESS partial clone) fetches file blobs
 * lazily on first access — so the initial download is tree-metadata only.
 * (Treeless `--filter=tree:0` is smaller still but refetches trees on every
 * walk, which is slow + breaks offline, so it is NOT the default.)
 *
 * Deliberately OUTSIDE `~/projects/` so the fleet's sibling-walk tooling (e.g.
 * cascade `--all`) never mistakes a reference clone for a fleet member
 * checkout. Disposable: a reference cache, not a working tree. Inherits the
 * `_wheelhouse` override chain (SOCKET_HOME /
 * setPath('socket-wheelhouse-dir')).
 */
export function getSocketRepoClonesDir(): string {
  const path = getNodePath()
  return normalizePath(path.join(getSocketWheelhouseDir(), 'repo-clones'))
}
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
 * Get the Wheelhouse bin directory (~/.socket/_wheelhouse/bin) — the single
 * directory placed on PATH. Holds only flat handles (thin exec shims or
 * symlinks), one per tool, each pointing at a real binary racked under
 * `<wheelhouse>/rack/<tool>/<version>/…` (getSocketRackToolDir). The shim IS
 * the bin, the npm `prefix/bin` / Homebrew `bin/` model: PATH lookup does not
 * recurse, so this dir stays flat (never a `bin/<tool>/` subdir). Inherits the
 * `_wheelhouse` override chain (SOCKET_HOME /
 * setPath('socket-wheelhouse-dir')).
 */
export function getSocketWheelhouseBinDir(): string {
  const path = getNodePath()
  return normalizePath(path.join(getSocketWheelhouseDir(), 'bin'))
}
/**
 * Get the Socket Wheelhouse directory (~/.socket/_wheelhouse). Shared
 * cross-fleet location for binaries that every fleet member can reach without
 * each one re-downloading and re-extracting per-repo. Tool installers (janus,
 * sfw, etc.) rack their resolved executables under
 * `<wheelhouse>/rack/<tool>/<version>/…` (getSocketRackToolDir) and expose a
 * handle in `<wheelhouse>/bin` (getSocketWheelhouseBinDir); consumers add that
 * one `bin/` to PATH. Override precedence: setPath('socket-wheelhouse-dir', …)
 * → $SOCKET_HOME/_wheelhouse → $HOME/.socket/_wheelhouse.
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
