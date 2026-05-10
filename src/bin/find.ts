/**
 * @fileoverview Find specific package-manager binaries with platform-
 * aware fallbacks.
 *
 * `findRealBin` tries common platform paths in order, then falls back
 * to a `which` PATH search filtered to skip shadow-bin directories
 * (any path containing `node_modules/.bin`). The shadow-bin filter
 * matters because tools like ts-node and tsx install fake `npm` /
 * `pnpm` / `yarn` shims into the project's `.bin` to intercept the
 * call — those aren't the user's real package manager.
 *
 * Per-tool helpers (`findRealNpm`, `findRealPnpm`, `findRealYarn`)
 * encode the canonical install layouts:
 *
 *   - npm: alongside `process.execPath` first (Node bundles it), then
 *     `%APPDATA%\npm` on Windows or `/usr/local/bin` / `/usr/bin` on
 *     POSIX.
 *
 *   - pnpm: `~/.local/share/pnpm` (XDG) or `~/.pnpm` on POSIX,
 *     `%APPDATA%\npm\pnpm` or `%LOCALAPPDATA%\pnpm\pnpm` on Windows.
 *
 *   - yarn: similar to npm but also `~/.yarn/bin/yarn` on POSIX.
 *
 * Each helper returns an empty string when no candidate exists so the
 * caller can fall through to `which` on PATH.
 */

import process from 'node:process'

import { WIN32 } from '../constants/platform'
import { getHome } from '../env/home'
import { getAppdata, getLocalappdata } from '../env/windows'
import { getXdgDataHome } from '../env/xdg'
import whichModule from '../external/which'
import { ArrayIsArray } from '../primordials/array'
import { getFs, getPath } from './_internal'
import { isShadowBinPath } from './shadow'
import { whichRealSync } from './which'

/**
 * Find the real executable for a binary, bypassing shadow bins.
 *
 * @example
 * ```typescript
 * const npmPath = findRealBin('npm', ['/usr/local/bin/npm'])
 * const gitPath = findRealBin('git')
 * ```
 */
export function findRealBin(
  binName: string,
  commonPaths: string[] = [],
): string | undefined {
  const fs = getFs()
  const path = getPath()

  // Try common locations first.
  for (const binPath of commonPaths) {
    if (fs.existsSync(binPath)) {
      return binPath
    }
  }

  // Fall back to whichModule.sync if no direct path found.
  // Use all: true to get all paths in a single call (avoids double PATH search on Windows).
  // External which call.
  /* c8 ignore start */
  const allPaths = whichModule.sync(binName, { all: true, nothrow: true }) || []
  // Ensure allPaths is an array. whichModule with all:true returns
  // string[]; the string and undefined fallbacks are defensive.
  const pathsArray = ArrayIsArray(allPaths)
    ? allPaths
    : typeof allPaths === 'string'
      ? [allPaths]
      : []

  if (pathsArray.length === 0) {
    return undefined
  }
  /* c8 ignore stop */

  // First, try to find a non-shadow bin path.
  for (const binPath of pathsArray) {
    const binDir = path.dirname(binPath)
    if (!isShadowBinPath(binDir)) {
      return binPath
    }
  }

  // If all paths are shadow bins, return the first one.
  return pathsArray[0]
}

/**
 * Find the real npm executable, bypassing any aliases and shadow bins.
 *
 * @example
 * ```typescript
 * const npmPath = findRealNpm()
 * // e.g. '/usr/local/bin/npm'
 * ```
 */
export function findRealNpm(): string {
  const fs = getFs()
  const path = getPath()

  // Try to find npm alongside the node executable. On Windows this is
  // npm.cmd; on POSIX it's the bare npm shim. WIN32-only candidates
  // tested on Windows runners.
  const nodeDir = path.dirname(process.execPath)
  /* c8 ignore start */
  const nodeDirCandidates = WIN32
    ? [path.join(nodeDir, 'npm.cmd'), path.join(nodeDir, 'npm')]
    : [path.join(nodeDir, 'npm')]
  /* c8 ignore stop */
  // candidate-found arm fires only on systems where npm sits next to node.
  /* c8 ignore start */
  for (const candidate of nodeDirCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Try common npm locations per platform. getAppdata() returns
  // undefined off-Windows; WIN32 commonPaths tested on Windows runners.
  const appdata = getAppdata()
  const commonPaths = WIN32
    ? [
        appdata ? path.join(appdata, 'npm', 'npm.cmd') : '',
        appdata ? path.join(appdata, 'npm', 'npm') : '',
        'C:\\Program Files\\nodejs\\npm.cmd',
        'C:\\Program Files\\nodejs\\npm',
      ].filter(Boolean)
    : ['/usr/local/bin/npm', '/usr/bin/npm']
  const result = findRealBin('npm', commonPaths)

  if (result && fs.existsSync(result)) {
    return result
  }
  /* c8 ignore stop */

  /* c8 ignore start - Fallback paths only fire when npm isn't found
     at any of the common platform locations above. Test runners
     always have npm somewhere standard. */
  // As a last resort, try to use whichRealSync to find npm.
  // This handles cases where npm is installed in non-standard locations.
  const npmPath = whichRealSync('npm', { nothrow: true })
  if (npmPath && typeof npmPath === 'string' && fs.existsSync(npmPath)) {
    return npmPath
  }

  // Return the basic 'npm' and let the system resolve it.
  return 'npm'
  /* c8 ignore stop */
}

/**
 * Find the real pnpm executable, bypassing any aliases and shadow bins.
 *
 * @example
 * ```typescript
 * const pnpmPath = findRealPnpm()
 * // e.g. '/usr/local/bin/pnpm'
 * ```
 */
export function findRealPnpm(): string {
  const path = getPath()
  const home = getHome()
  const appdata = getAppdata()
  const localappdata = getLocalappdata()
  const xdgDataHome = getXdgDataHome()

  // Try common pnpm locations. Guard each env-derived path with its
  // existence — getHome()/getAppdata()/etc. can all return undefined.
  // WIN32 commonPaths tested on Windows runners; HOME-based fallback
  // fires only when XDG_DATA_HOME is unset (env-config dependent).
  /* c8 ignore start */
  const commonPaths = WIN32
    ? [
        appdata ? path.join(appdata, 'npm', 'pnpm.cmd') : '',
        appdata ? path.join(appdata, 'npm', 'pnpm') : '',
        localappdata ? path.join(localappdata, 'pnpm', 'pnpm.cmd') : '',
        localappdata ? path.join(localappdata, 'pnpm', 'pnpm') : '',
        'C:\\Program Files\\nodejs\\pnpm.cmd',
        'C:\\Program Files\\nodejs\\pnpm',
      ].filter(Boolean)
    : [
        '/usr/local/bin/pnpm',
        '/usr/bin/pnpm',
        xdgDataHome
          ? path.join(xdgDataHome, 'pnpm/pnpm')
          : home
            ? path.join(home, '.local/share/pnpm/pnpm')
            : '',
        home ? path.join(home, '.pnpm/pnpm') : '',
      ].filter(Boolean)
  /* c8 ignore stop */

  return findRealBin('pnpm', commonPaths) ?? ''
}

/**
 * Find the real yarn executable, bypassing any aliases and shadow bins.
 *
 * @example
 * ```typescript
 * const yarnPath = findRealYarn()
 * // e.g. '/usr/local/bin/yarn'
 * ```
 */
export function findRealYarn(): string {
  const path = getPath()
  const home = getHome()
  const appdata = getAppdata()

  // Try common yarn locations per platform. Guard env-derived paths with
  // existence checks — getHome()/getAppdata() can return undefined.
  // WIN32 commonPaths tested on Windows runners.
  /* c8 ignore start */
  const commonPaths = WIN32
    ? [
        appdata ? path.join(appdata, 'npm', 'yarn.cmd') : '',
        appdata ? path.join(appdata, 'npm', 'yarn') : '',
        home ? path.join(home, '.yarn/bin/yarn.cmd') : '',
        home ? path.join(home, '.yarn/bin/yarn') : '',
        'C:\\Program Files\\nodejs\\yarn.cmd',
        'C:\\Program Files\\nodejs\\yarn',
      ].filter(Boolean)
    : [
        '/usr/local/bin/yarn',
        '/usr/bin/yarn',
        home ? path.join(home, '.yarn/bin/yarn') : '',
        home
          ? path.join(home, '.config/yarn/global/node_modules/.bin/yarn')
          : '',
      ].filter(Boolean)
  /* c8 ignore stop */

  return findRealBin('yarn', commonPaths) ?? ''
}
