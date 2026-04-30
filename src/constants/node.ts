/**
 * @fileoverview Node.js runtime version and capability helpers.
 * Provides getters for the current Node version (major/minor/patch), the
 * maintained-versions list, and feature-detection flags for APIs that vary
 * across Node releases.
 */

import process from 'node:process'

import { maintainedNodeVersions } from './maintained-node-versions'

import { NumberParseInt } from '../primordials'

const NODE_VERSION = process.version

let _nodeDisableSigusr1Flags: string[]
let _nodeHardenFlags: string[]
let _nodeNoWarningsFlags: string[]
let _nodePermissionFlags: string[]

/**
 * Get the absolute path to the currently running Node.js binary.
 *
 * @returns The value of `process.execPath`.
 */
export function getExecPath(): string {
  return process.execPath
}

/**
 * Get the list of Node.js major versions currently under long-term support.
 *
 * @returns The static `maintainedNodeVersions` array shared across the library.
 */
export function getMaintainedNodeVersions() {
  return maintainedNodeVersions
}

/**
 * Get the flags used to block Node.js debugger attachment via SIGUSR1.
 * Returns `['--disable-sigusr1']` on runtimes that support it and falls back
 * to `['--no-inspect']` on older versions.
 *
 * @returns A non-empty array of CLI flags suitable for passing to `node`.
 */
export function getNodeDisableSigusr1Flags(): string[] {
  if (_nodeDisableSigusr1Flags === undefined) {
    // SIGUSR1 is reserved by Node.js for starting the debugger/inspector.
    // In production CLI environments, we want to prevent debugger attachment.
    //
    // --disable-sigusr1: Prevents Signal I/O Thread from listening to SIGUSR1 (v22.14.0+).
    // --no-inspect: Disables inspector on older Node versions that don't support --disable-sigusr1.
    //
    // Note: --disable-sigusr1 is the correct solution (prevents thread creation entirely).
    // --no-inspect is a fallback that still creates the signal handler thread but blocks later.
    _nodeDisableSigusr1Flags = supportsNodeDisableSigusr1Flag()
      ? ['--disable-sigusr1']
      : ['--no-inspect']
  }
  return _nodeDisableSigusr1Flags
}

/**
 * Get the hardening flags Socket applies when spawning Node.js subprocesses.
 * Always includes `--disable-proto=delete`. Also adds `--permission` plus the
 * grants from {@link getNodePermissionFlags} on Node 24+,
 * `--experimental-permission` on Node 20-23, and
 * `--force-node-api-uncaught-exceptions-policy` on Node 22+.
 *
 * @returns A non-empty array of CLI flags suitable for passing to `node`.
 */
export function getNodeHardenFlags(): string[] {
  if (_nodeHardenFlags === undefined) {
    const major = getNodeMajorVersion()
    const flags: string[] = ['--disable-proto=delete']

    // Permission model: Experimental in Node 20-23, stable in Node 24+.
    // Node 20-23: --experimental-permission (no explicit grants needed).
    // Node 24+: --permission (requires explicit grants via getNodePermissionFlags()).
    if (major >= 24) {
      flags.push('--permission')
      // Add permission-specific grants for Node 24+.
      flags.push(...getNodePermissionFlags())
    } else if (major >= 20) {
      flags.push('--experimental-permission')
    }

    // Force uncaught exceptions policy for N-API addons (Node.js 22+).
    if (major >= 22) {
      flags.push('--force-node-api-uncaught-exceptions-policy')
    }

    _nodeHardenFlags = flags
  }
  return _nodeHardenFlags
}

/**
 * Get the major component of the current Node.js version.
 *
 * @returns The major version number, or `0` if it cannot be parsed.
 */
export function getNodeMajorVersion(): number {
  const major = NODE_VERSION.slice(1).split('.')[0] ?? '0'
  return NumberParseInt(major, 10) || 0
}

/**
 * Get the minor component of the current Node.js version.
 *
 * @returns The minor version number, or `0` if it cannot be parsed.
 */
export function getNodeMinorVersion(): number {
  return NumberParseInt(NODE_VERSION.split('.')[1] ?? '0', 10)
}

/**
 * Get the flags that silence Node.js runtime warnings and deprecation notices.
 * Always returns `['--no-warnings', '--no-deprecation']` across all versions.
 *
 * @returns A non-empty array of CLI flags suitable for passing to `node`.
 */
export function getNodeNoWarningsFlags(): string[] {
  if (_nodeNoWarningsFlags === undefined) {
    _nodeNoWarningsFlags = ['--no-warnings', '--no-deprecation']
  }
  return _nodeNoWarningsFlags
}

/**
 * Get the patch component of the current Node.js version.
 *
 * @returns The patch version number, or `0` if it cannot be parsed.
 */
export function getNodePatchVersion(): number {
  return NumberParseInt(NODE_VERSION.split('.')[2] ?? '0', 10)
}

/**
 * Get the permission-grant flags needed to run npm under Node.js 24+'s
 * `--permission` model. The array is non-empty only on Node.js 24+ and
 * includes `--allow-fs-read=*`, `--allow-fs-write=*`, and
 * `--allow-child-process`. Older versions return an empty array.
 *
 * @returns The permission flag list (possibly empty) for the current runtime.
 */
export function getNodePermissionFlags(): string[] {
  if (_nodePermissionFlags === undefined) {
    const major = getNodeMajorVersion()
    // Node.js 24+ requires explicit permission grants when using --permission flag.
    // npm needs filesystem access to read package.json files and node_modules.
    if (major >= 24) {
      _nodePermissionFlags = [
        // Allow reading from the entire filesystem (npm needs to read package.json, node_modules, etc.).
        '--allow-fs-read=*',
        // Allow writing to the entire filesystem (npm needs to write to node_modules, cache, etc.).
        '--allow-fs-write=*',
        // Allow spawning child processes (npm needs to run lifecycle scripts, git, etc.).
        '--allow-child-process',
      ]
    } else {
      // Node.js 20-23 with --experimental-permission doesn't require explicit grants
      // or uses different permission API.
      _nodePermissionFlags = []
    }
  }
  return _nodePermissionFlags
}

/**
 * Get the full Node.js version string from `process.version`.
 *
 * @returns The runtime version, including the leading `v` (e.g. `v22.11.0`).
 */
export function getNodeVersion(): string {
  return NODE_VERSION
}

/**
 * Check whether the current runtime exposes the `module.enableCompileCache()` API.
 * The API is available on Node.js 24+.
 *
 * @returns `true` when the current runtime is Node.js 24 or newer.
 */
export function supportsNodeCompileCacheApi(): boolean {
  const major = getNodeMajorVersion()
  return major >= 24
}

/**
 * Check whether the current runtime honors the `NODE_COMPILE_CACHE` env var.
 * Env-var-based compile caching is available on Node.js 22+.
 *
 * @returns `true` when the current runtime is Node.js 22 or newer.
 */
export function supportsNodeCompileCacheEnvVar(): boolean {
  const major = getNodeMajorVersion()
  return major >= 22
}

/**
 * Check whether the current runtime supports the `--disable-sigusr1` CLI flag.
 * Flag landed in v22.14.0 and v23.7.0 and was stabilized in v22.20.0 / v24.8.0.
 *
 * @returns `true` when the runtime exposes `--disable-sigusr1`.
 */
export function supportsNodeDisableSigusr1Flag(): boolean {
  const major = getNodeMajorVersion()
  const minor = getNodeMinorVersion()
  // --disable-sigusr1 added in v22.14.0, v23.7.0.
  // Stabilized in v22.20.0, v24.8.0.
  if (major >= 24) {
    return minor >= 8
  }
  if (major === 23) {
    return minor >= 7
  }
  if (major === 22) {
    return minor >= 14
  }
  return false
}

/**
 * Check whether the current runtime supports the `--disable-warning` CLI flag.
 * The flag is available on Node.js 21+.
 *
 * @returns `true` when the current runtime is Node.js 21 or newer.
 */
export function supportsNodeDisableWarningFlag(): boolean {
  const major = getNodeMajorVersion()
  return major >= 21
}

/**
 * Check whether the current runtime supports the permission model CLI flags
 * (`--experimental-permission` on Node 20-23, `--permission` on Node 24+).
 *
 * @returns `true` when the current runtime is Node.js 20 or newer.
 */
export function supportsNodePermissionFlag(): boolean {
  const major = getNodeMajorVersion()
  return major >= 20
}

/**
 * Check whether `require()` can synchronously load ESM modules.
 * Requires Node.js 22.12+ or Node.js 23+.
 *
 * @returns `true` when the runtime supports `require()`-ing ES modules.
 */
export function supportsNodeRequireModule(): boolean {
  const major = getNodeMajorVersion()
  return major >= 23 || (major === 22 && getNodeMinorVersion() >= 12)
}

/**
 * Check whether the current runtime supports `node --run <script>`.
 * Requires Node.js 22.11+ or Node.js 23+.
 *
 * @returns `true` when the runtime can execute package.json scripts via `--run`.
 */
export function supportsNodeRun(): boolean {
  const major = getNodeMajorVersion()
  return major >= 23 || (major === 22 && getNodeMinorVersion() >= 11)
}

/**
 * Check whether this process was spawned with an IPC channel.
 * When `true`, `process.send()` is callable to message the parent process.
 *
 * @returns `true` when the current process has an IPC channel to its parent.
 */
export function supportsProcessSend(): boolean {
  return typeof process.send === 'function'
}

// Node.js constants.
export const ESNEXT = 'esnext'
export const NODE_SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
