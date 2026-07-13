/**
 * @file Node.js runtime version and capability helpers. Provides getters for
 *   the current Node version (major/minor/patch), the maintained-versions list,
 *   and feature-detection flags for APIs that vary across Node releases.
 */

import process from 'node:process'

import { maintainedNodeVersions } from './maintained-node-versions'

import { NumberParseInt } from '../primordials/number'
const NODE_VERSION = process.version

let nodeDisableSigusr1Flags: string[]
let nodeHardenFlags: string[]
let nodeNoWarningsFlags: string[]
let nodePermissionFlags: string[]

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
 * Get the flags used to block Node.js debugger attachment via SIGUSR1. Returns
 * `['--disable-sigusr1']` on runtimes that support it and falls back to
 * `['--no-inspect']` on older versions.
 *
 * @returns A non-empty array of CLI flags suitable for passing to `node`.
 */
export function getNodeDisableSigusr1Flags(): string[] {
  if (nodeDisableSigusr1Flags === undefined) {
    // SIGUSR1 is reserved by Node.js for starting the debugger/inspector.
    // In production CLI environments, we want to prevent debugger attachment.
    //
    // --disable-sigusr1: Prevents Signal I/O Thread from listening to SIGUSR1 (v22.14.0+).
    // --no-inspect: Disables inspector on older Node versions that don't support --disable-sigusr1.
    //
    // Note: --disable-sigusr1 is the correct solution (prevents thread creation entirely).
    // --no-inspect is a fallback that still creates the signal handler thread but blocks later.
    /* c8 ignore start - --no-inspect fallback fires only on Node
       runtimes pre-v22.14 / v23.7 / v24.8; tests run on Node 24+. */
    nodeDisableSigusr1Flags = supportsNodeDisableSigusr1Flag()
      ? ['--disable-sigusr1']
      : ['--no-inspect']
    /* c8 ignore stop */
  }
  return nodeDisableSigusr1Flags
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
  if (nodeHardenFlags === undefined) {
    const major = getNodeMajorVersion()
    const flags: string[] = ['--disable-proto=delete']

    // Permission model: Experimental in Node 20-23, stable in Node 24+.
    // Node 20-23: --experimental-permission (no explicit grants needed).
    // Node 24+: --permission (requires explicit grants via getNodePermissionFlags()).
    if (major >= 24) {
      flags.push('--permission')
      // Add permission-specific grants for Node 24+.
      flags.push(...getNodePermissionFlags())
      // Node 20-23 fallback; tests run on Node 24+.
      /* c8 ignore start */
    } else if (major >= 20) {
      flags.push('--experimental-permission')
    }
    /* c8 ignore stop */

    // Force uncaught exceptions policy for N-API addons (Node.js 22+).
    // Node-version-specific; tests run on a single major.
    /* c8 ignore start */
    if (major >= 22) {
      flags.push('--force-node-api-uncaught-exceptions-policy')
    }
    /* c8 ignore stop */

    nodeHardenFlags = flags
  }
  return nodeHardenFlags
}

/**
 * Get the major component of the current Node.js version.
 *
 * @returns The major version number, or `0` if it cannot be parsed.
 */
export function getNodeMajorVersion(): number {
  // NODE_VERSION always has shape `vMAJOR.MINOR.PATCH`; the `?? '0'`
  // and `|| 0` are defensive against malformed process.version.
  /* c8 ignore start */
  const major = NODE_VERSION.slice(1).split('.')[0] ?? '0'
  return NumberParseInt(major, 10) || 0
  /* c8 ignore stop */
}

/**
 * Get the minor component of the current Node.js version.
 *
 * @returns The minor version number, or `0` if it cannot be parsed.
 */
export function getNodeMinorVersion(): number {
  // Defensive `?? '0'` against malformed process.version.
  /* c8 ignore start */
  return NumberParseInt(NODE_VERSION.split('.')[1] ?? '0', 10)
  /* c8 ignore stop */
}

/**
 * Get the flags that silence Node.js runtime warnings and deprecation notices.
 * Always returns `['--no-warnings', '--no-deprecation']` across all versions.
 *
 * @returns A non-empty array of CLI flags suitable for passing to `node`.
 */
export function getNodeNoWarningsFlags(): string[] {
  if (nodeNoWarningsFlags === undefined) {
    nodeNoWarningsFlags = ['--no-warnings', '--no-deprecation']
  }
  return nodeNoWarningsFlags
}

/**
 * Get the patch component of the current Node.js version.
 *
 * @returns The patch version number, or `0` if it cannot be parsed.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function getNodePatchVersion(): number {
  // Defensive `?? '0'` against malformed process.version.
  /* c8 ignore start */
  return NumberParseInt(NODE_VERSION.split('.')[2] ?? '0', 10)
  /* c8 ignore stop */
}

/**
 * Get the permission-grant flags needed to run npm under Node.js 24+'s
 * `--permission` model. The array is non-empty only on Node.js 24+ and includes
 * `--allow-fs-read=*`, `--allow-fs-write=*`, and `--allow-child-process`. Older
 * versions return an empty array.
 *
 * @returns The permission flag list (possibly empty) for the current runtime.
 */
export function getNodePermissionFlags(): string[] {
  if (nodePermissionFlags === undefined) {
    const major = getNodeMajorVersion()
    // Node.js 24+ requires explicit permission grants when using --permission flag.
    // npm needs filesystem access to read package.json files and node_modules.
    if (major >= 24) {
      nodePermissionFlags = [
        // Allow reading from the entire filesystem (npm needs to read package.json, node_modules, etc.).
        '--allow-fs-read=*',
        // Allow writing to the entire filesystem (npm needs to write to node_modules, cache, etc.).
        '--allow-fs-write=*',
        // Allow spawning child processes (npm needs to run lifecycle scripts, git, etc.).
        '--allow-child-process',
      ]
      // Node.js 20-23 with --experimental-permission doesn't require explicit grants
      // or uses different permission API.
      /* c8 ignore start */
    } else {
      nodePermissionFlags = []
    }
    /* c8 ignore stop */
  }
  return nodePermissionFlags
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
 * Check whether the current runtime exposes the `module.enableCompileCache()`
 * API. The API is available on Node.js 24+.
 *
 * @returns `true` when the current runtime is Node.js 24 or newer.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
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
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function supportsNodeCompileCacheEnvVar(): boolean {
  const major = getNodeMajorVersion()
  return major >= 22
}

/**
 * Check whether the current runtime supports the `--disable-sigusr1` CLI flag.
 * Flag landed in v22.14.0 and v23.7.0 and was stabilized in v22.20.0 /
 * v24.8.0.
 *
 * @returns `true` when the runtime exposes `--disable-sigusr1`.
 */
export function supportsNodeDisableSigusr1Flag(): boolean {
  const major = getNodeMajorVersion()
  const minor = getNodeMinorVersion()
  // --disable-sigusr1 added in v22.14.0, v23.7.0.
  // Stabilized in v22.20.0, v24.8.0. Branch outcome depends on the
  // exact Node minor version of the test runner; varies per CI.
  /* c8 ignore start */
  if (major >= 24) {
    return minor >= 8
  }
  /* c8 ignore stop */
  /* c8 ignore start - Version-specific arms; tests run on a single
     Node major. Each branch fires only on its target major. */
  if (major === 23) {
    return minor >= 7
  }
  if (major === 22) {
    return minor >= 14
  }
  return false
  /* c8 ignore stop */
}

/**
 * Check whether the current runtime supports the `--disable-warning` CLI flag.
 * The flag is available on Node.js 21+.
 *
 * @returns `true` when the current runtime is Node.js 21 or newer.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
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
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function supportsNodePermissionFlag(): boolean {
  const major = getNodeMajorVersion()
  return major >= 20
}

/**
 * Check whether `require()` can synchronously load ESM modules. Requires
 * Node.js 22.12+ or Node.js 23+.
 *
 * @returns `true` when the runtime supports `require()`-ing ES modules.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function supportsNodeRequireModule(): boolean {
  const major = getNodeMajorVersion()
  // 22-specific arm; tests run on a single Node major.
  /* c8 ignore start */
  return major >= 23 || (major === 22 && getNodeMinorVersion() >= 12)
  /* c8 ignore stop */
}

/**
 * Check whether the current runtime supports `node --run <script>`. Requires
 * Node.js 22.11+ or Node.js 23+.
 *
 * @returns `true` when the runtime can execute package.json scripts via
 *   `--run`.
 */
export function supportsNodeRun(): boolean {
  const major = getNodeMajorVersion()
  // 22-specific arm; tests run on a single Node major.
  /* c8 ignore start */
  return major >= 23 || (major === 22 && getNodeMinorVersion() >= 11)
  /* c8 ignore stop */
}

/**
 * Check whether the current runtime can execute TypeScript source directly
 * (`.ts` files via `node foo.ts`), with or without a flag. Type-stripping went
 * stable in Node.js 22.6 (under `--strip-types`, also accepted as the
 * deprecated alias `--experimental-strip-types`) and default-on in Node 24.
 *
 * Pair with {@link supportsNodeStripTypesDefault} to decide whether a flag needs
 * to be passed.
 *
 * @returns `true` when the runtime can run TypeScript (Node 22.6+).
 */
export function supportsNodeStripTypes(): boolean {
  const major = getNodeMajorVersion()
  /* c8 ignore start - 22-specific arm; tests run on a single Node major. */
  return major >= 23 || (major === 22 && getNodeMinorVersion() >= 6)
  /* c8 ignore stop */
}

/**
 * Check whether the current runtime strips TypeScript types **by default** (no
 * flag needed). Became default-on in Node.js 24.
 *
 * Use case: deciding whether a wrapper script needs to pass `--strip-types`
 * when invoking `node foo.ts`. On Node 24+ the flag is redundant; on 22.6 –
 * 23.x it's required.
 *
 * @returns `true` when no `--strip-types` flag is needed (Node 24+).
 */
export function supportsNodeStripTypesDefault(): boolean {
  return getNodeMajorVersion() >= 24
}

/**
 * Check whether this process was spawned with an IPC channel. When `true`,
 * `process.send()` is callable to message the parent process.
 *
 * @returns `true` when the current process has an IPC channel to its parent.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function supportsProcessSend(): boolean {
  return typeof process.send === 'function'
}

// Node.js constants.
export const ESNEXT = 'esnext'
export const NODE_SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
