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

export const windowsScriptExtRegExp = /\.(?:cmd|bat|ps1)$/i

let _npmCliPromiseSpawn: typeof npmCliPromiseSpawnType | undefined

/**
 * Lazily load the `@npmcli/promise-spawn` module to avoid Webpack bundling
 * issues. Required because the upstream module uses CJS dynamic-require
 * patterns that Webpack flags.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNpmCliPromiseSpawn() {
  if (_npmCliPromiseSpawn === undefined) {
    _npmCliPromiseSpawn = /*@__PURE__*/ require('../../external/@npmcli/promise-spawn')
  }
  return _npmCliPromiseSpawn!
}

/**
 * Strip ANSI escape codes from spawn result stdout and stderr. Modifies the
 * result object in place to remove color codes and formatting.
 *
 * @param {unknown} result - Spawn result object with stdout/stderr properties.
 *
 * @returns {unknown} The modified result object
 */
/*@__NO_SIDE_EFFECTS__*/
export function stripAnsiFromSpawnResult(result: unknown): unknown {
  const res = result as {
    stdout?: string | Buffer
    stderr?: string | Buffer
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
