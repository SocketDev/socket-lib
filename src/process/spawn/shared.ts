/**
 * @file Private internals for `spawn/*` modules — the `@npmcli/promise-spawn`
 *   lazy loader, the per-spawn ANSI-stripping helper, the WeakMap stack cache,
 *   the binary-path cache shared between `spawn` and `spawnSync`, and the
 *   trusted-resolution glue both entry points run a bare command name through.
 *   Underscore prefix excludes this file from the public exports map.
 */

import process from 'node:process'

import { stripAnsi } from '../../term/ansi/strip'
import {
  findPathEnvKey,
  resolveTrustedExecutable,
} from '../../exe/path/trusted'
import { isWin32 } from '../../constants/platform'
import { getNodeFs } from '../../node/fs'
import { getNodePath } from '../../node/path'
import { isPath } from '../../paths/normalize'
import { MapCtor, WeakMapCtor } from '../../primordials/map-set'
import { RegExpPrototypeTest } from '../../primordials/regexp'
// @ts-expect-error - external vendored module
import type npmCliPromiseSpawnType from '../../external/@npmcli/promise-spawn'

// Cache for lazy stack trace computation.
export const stackCache = new WeakMapCtor<Error, string>()

// Cache for binary path resolutions to avoid repeated PATH searches. Keyed on
// the command PLUS the untrusted root and the raw PATH it was resolved
// against — a single resolution must never leak into a spawn made from a
// different working directory or with a different environment.
// Validated with existsSync() which is much cheaper than a PATH search.
export const spawnBinPathCache = new MapCtor<string, SpawnBinResolution>()

export const windowsScriptExtRegExp = /\.(?:bat|cmd|ps1)$/i

// Extensions cmd.exe tries when PATHEXT is unset.
const defaultPathExt = '.COM;.EXE;.BAT;.CMD'

/**
 * A command resolved for spawning, plus the PATH the child must be given.
 */
export interface SpawnBinResolution {
  /**
   * Command to hand to the spawn primitive — an absolute path when resolution
   * succeeded, the original name when it did not, or a bare stem on the
   * Windows shell path.
   */
  command: string
  /**
   * PATH to force into the child environment, or `undefined` to leave the
   * child's PATH alone. Set only when the operating system or a shell will run
   * its own search for `command`.
   */
  searchPath: string | undefined
  /**
   * `true` when `command` resolved outside the untrusted root.
   */
  trusted: boolean
}

/**
 * Inputs a spawn entry point hands to {@link resolveSpawnBin}.
 */
export interface SpawnBinResolveConfig {
  /**
   * Working directory the child will run in. Doubles as the untrusted root.
   */
  cwd?: string | undefined
  /**
   * Environment the child will run with, already merged over `process.env`.
   */
  env?: NodeJS.ProcessEnv | undefined
  /**
   * The spawn `shell` option.
   */
  shell?: boolean | string | undefined
}

/**
 * Apply the Windows `shell: true` script-extension handling, and decide
 * whether the child needs the sanitized PATH.
 *
 * Cmd.exe struggles to launch a full path to a `.cmd` / `.bat` / `.ps1` file,
 * so the historical fix hands it the bare stem and lets PATHEXT re-resolve —
 * the same trick npm's promise-spawn, cross-spawn, and execa use. cmd.exe
 * searches the current directory FIRST, so the stem is only handed over when
 * the resolution was trusted AND the child's working directory holds no
 * same-named script; the child then also gets the sanitized PATH so the
 * re-search can only reach trusted directories.
 *
 * An absolute command needs no PATH override — nothing re-searches for it.
 *
 * @example
 *   ;```typescript
 *   applyCmdExeStem(
 *     { command: 'C:\\tools\\gh.cmd', searchPath: 'C:\\tools', trusted: true },
 *     { shell: true },
 *   )
 *   // { command: 'gh', searchPath: 'C:\\tools', trusted: true }
 *   ```
 */
export function applyCmdExeStem(
  resolution: SpawnBinResolution,
  config: SpawnBinResolveConfig,
): SpawnBinResolution {
  const { command, searchPath, trusted } = resolution
  const resolvedToPath = isPath(command)
  const passthrough: SpawnBinResolution = {
    command,
    searchPath: resolvedToPath ? undefined : searchPath,
    trusted,
  }
  /* c8 ignore start - Windows-only cmd.exe extension stripping for
     .cmd/.bat/.ps1 shell-true execution. Tested on Windows runners. */
  if (
    !isWin32() ||
    !config.shell ||
    !RegExpPrototypeTest(windowsScriptExtRegExp, command)
  ) {
    return passthrough
  }
  if (!trusted) {
    // The resolution already came from a directory the untrusted root can
    // reach. Handing cmd.exe a bare stem would only widen that.
    return passthrough
  }
  const path = getNodePath()
  const stem = path.basename(command, path.extname(command))
  const env = config.env ?? process.env
  const pathExt = env['PATHEXT'] ?? defaultPathExt
  const childCwd = config.cwd ?? process.cwd()
  if (hasCmdExeShadowInDir(stem, childCwd, pathExt)) {
    // cmd.exe would find the working directory's copy first. Keep the full
    // resolved path even though cmd.exe handles it less gracefully.
    return passthrough
  }
  return { command: stem, searchPath, trusted }
  /* c8 ignore stop */
}

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
 * Report whether the child's working directory holds a script cmd.exe would
 * find before it consults PATH. cmd.exe always searches the current directory
 * first, so stripping a resolved path back to a bare stem is only safe when no
 * such collision exists.
 *
 * @example
 *   ;```typescript
 *   hasCmdExeShadowInDir('npm', 'C:\\repo', '.COM;.EXE;.CMD') // true when C:\repo\npm.cmd exists
 *   ```
 */
export function hasCmdExeShadowInDir(
  stem: string,
  dirPath: string,
  pathExt: string,
): boolean {
  if (!stem) {
    return false
  }
  const fs = getNodeFs()
  const path = getNodePath()
  // PATHEXT is semicolon-delimited on Windows regardless of what
  // `path.delimiter` reports on the host running this check. Both cases are
  // probed so the function behaves the same on a case-sensitive filesystem.
  const declared = pathExt.split(';')
  const exts = ['', ...declared, ...declared.map(ext => ext.toLowerCase())]
  for (let i = 0, { length } = exts; i < length; i += 1) {
    if (fs.existsSync(path.join(dirPath, `${stem}${exts[i]!}`))) {
      return true
    }
  }
  return false
}

/**
 * Resolve the command a spawn entry point should actually launch.
 *
 * A path-like input passes through untouched. A bare name goes through
 * {@link resolveTrustedExecutable} against the child's own environment, with
 * the child's working directory as the untrusted root, and falls back to a
 * dropped PATH entry only when no trusted directory supplies the command.
 *
 * @example
 *   ;```typescript
 *   resolveSpawnBin('git', { cwd: '/scan/target' })
 *   // { command: '/usr/bin/git', searchPath: undefined, trusted: true }
 *   ```
 */
export function resolveSpawnBin(
  cmd: string,
  config: SpawnBinResolveConfig,
): SpawnBinResolution {
  const cfg = { __proto__: null, ...config } as SpawnBinResolveConfig
  // Keep an explicit path intact: its parent may not be on PATH at all, and
  // the caller named the target deliberately.
  if (isPath(cmd)) {
    return { command: cmd, searchPath: undefined, trusted: true }
  }
  const env = cfg.env ?? process.env
  const untrustedRoot = cfg.cwd ?? process.cwd()
  const pathKey = findPathEnvKey(env)
  const rawPath = (pathKey ? env[pathKey] : undefined) ?? ''
  const cacheKey = `${cmd}\0${untrustedRoot}\0${rawPath}`
  const cached = spawnBinPathCache.get(cacheKey)
  if (cached) {
    const fs = getNodeFs()
    if (fs.existsSync(cached.command)) {
      return applyCmdExeStem(cached, cfg)
    }
    spawnBinPathCache.delete(cacheKey)
  }
  const resolved = resolveTrustedExecutable(cmd, {
    env,
    // A package-manager run script prepends the workspace `node_modules/.bin`
    // and a dev-dependency CLI lives nowhere else, so that one dropped
    // directory stays reachable when nothing trusted supplies the command.
    // Any other directory the working tree controls does not.
    untrustedFallback: 'shadowBins',
    untrustedRoot,
  })
  // Without a resolved path the operating system runs its own search, so the
  // child gets the sanitized PATH to search instead of the inherited one.
  const resolution: SpawnBinResolution = resolved.binPath
    ? {
        command: resolved.binPath,
        searchPath: resolved.searchPath,
        trusted: resolved.trusted,
      }
    : { command: cmd, searchPath: resolved.searchPath, trusted: false }
  if (resolved.binPath) {
    spawnBinPathCache.set(cacheKey, resolution)
  }
  return applyCmdExeStem(resolution, cfg)
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
