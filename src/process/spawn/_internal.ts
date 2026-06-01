/**
 * @file Private internals for `spawn/*` modules — the `@npmcli/promise-spawn`
 *   lazy loader, the per-spawn ANSI-stripping helper, the WeakMap stack cache,
 *   and the binary-path cache shared between `spawn` and `spawnSync`.
 *   Underscore prefix excludes this file from the public exports map.
 */

import { stripAnsi } from '../../ansi/strip'
import { MapCtor, WeakMapCtor } from '../../primordials/map-set'
// @ts-expect-error - external vendored module
import type npmCliPromiseSpawnType from '../../external/@npmcli/promise-spawn'

// Cache for lazy stack trace computation.
export const stackCache = new WeakMapCtor<Error, string>()

// Cache for binary path resolutions to avoid repeated PATH searches.
// Validated with existsSync() which is much cheaper than PATH search.
export const spawnBinPathCache = new MapCtor<string, string>()

export const windowsScriptExtRegExp = /\.(?:bat|cmd|ps1)$/i

let npmCliPromiseSpawnCache: typeof npmCliPromiseSpawnType | undefined

/**
 * Lazily load the `@npmcli/promise-spawn` module to avoid Webpack bundling
 * issues. Required because the upstream module uses CJS dynamic-require
 * patterns that Webpack flags.
 */
export function getNpmCliPromiseSpawn() {
  if (npmCliPromiseSpawnCache === undefined) {
    npmCliPromiseSpawnCache = /*@__PURE__*/ require('../../external/@npmcli/promise-spawn')
  }
  return npmCliPromiseSpawnCache!
}

/**
 * Strip ANSI escape codes from spawn result stdout and stderr. Modifies the
 * result object in place to remove color codes and formatting.
 *
 * @param {unknown} result - Spawn result object with stdout/stderr properties.
 *
 * @returns {unknown} The modified result object
 */
export function stripAnsiFromSpawnResult(result: unknown): unknown {
  const res = result as {
    stdout?: string | Buffer | undefined
    stderr?: string | Buffer | undefined
  }
  const { stderr, stdout } = res
  if (typeof stdout === 'string') {
    res.stdout = stripAnsi(stdout)
  }
  if (typeof stderr === 'string') {
    res.stderr = stripAnsi(stderr)
  }
  return res
}
