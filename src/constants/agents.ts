/**
 * @file Package manager agent constants. Exports agent names
 *   (npm/pnpm/yarn/bun/vlt/npx), lockfile names, registry URLs, and resolved
 *   npm binary paths used across Socket tooling.
 */

import which from '../external/which'

// Agent names.
export const NPM = 'npm'
export const PNPM = 'pnpm'
export const YARN = 'yarn'
export const BUN = 'bun'
export const VLT = 'vlt'
export const NPX = 'npx' // # socket-hook: allow npx

// NPM binary path - resolved once at runtime using which.
// Shared between NPM_BIN_PATH and NPM_REAL_EXEC_PATH to avoid duplicate which.sync calls.
const _npmBinPath = /*@__PURE__*/ (() => {
  try {
    return which.sync('npm', { nothrow: true }) || undefined
    /* c8 ignore start - which.sync throw catch; module-init IIFE
       runs once at load time before tests can intercept. */
  } catch {
    return undefined
  }
  /* c8 ignore stop */
})()

export const NPM_BIN_PATH = _npmBinPath || 'npm'

// NPM CLI entry point - resolved at runtime from npm bin location.
// NOTE: This is kept for backward compatibility but NPM_BIN_PATH should be used instead
// because cli.js exports a function that must be invoked, not executed directly.
export const NPM_REAL_EXEC_PATH = /*@__PURE__*/ (() => {
  try {
    // Reuse cached npm bin path to avoid duplicate which.sync call.
    /* c8 ignore start - Module-init IIFE; only reachable when
       which.sync returns null at module load. */
    if (!_npmBinPath) {
      return undefined
    }
    /* c8 ignore stop */
    const { existsSync } = /*@__PURE__*/ require('node:fs')
    const path = /*@__PURE__*/ require('node:path')
    // npm bin is typically at: /path/to/node/bin/npm
    // cli.js is at: /path/to/node/lib/node_modules/npm/lib/cli.js
    // /path/to/node/bin
    const npmDir = path.dirname(_npmBinPath)
    const nodeModulesPath = path.join(
      npmDir,
      '..',
      'lib',
      'node_modules',
      'npm',
      'lib',
      'cli.js',
    )
    if (existsSync(nodeModulesPath)) {
      return nodeModulesPath
    }
    /* c8 ignore start - Module-init fallthroughs; reached only when cli.js
       isn't where expected, or when the outer try throws. */
    return undefined
  } catch {
    return undefined
  }
  /* c8 ignore stop */
})()

// NPM registry URL.
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org'

// Agent variants.
export const YARN_BERRY = 'yarn/berry'
export const YARN_CLASSIC = 'yarn/classic'
// ZPM is the Yarn 6 Rust rewrite (yarnpkg/zpm). JSON-based lockfile,
// __metadata.version >= 9, "entries" key. Versioning skipped from
// Berry v4 to ZPM v6 (no v5). Distinct enough from Berry/Classic
// that downstream tooling (sdxgen parsers, lockfile readers) treat
// it as a separate agent. The canonical name across the fleet is
// "zpm" (matches socket-sdxgen's parser dir name).
export const ZPM = 'zpm'

// Lock files.
export const PACKAGE_LOCK = 'package-lock'
export const PACKAGE_LOCK_JSON = 'package-lock.json'
export const NPM_SHRINKWRAP_JSON = 'npm-shrinkwrap.json'
export const PNPM_LOCK = 'pnpm-lock'
export const PNPM_LOCK_YAML = 'pnpm-lock.yaml'
export const YARN_LOCK = 'yarn.lock'
export const BUN_LOCK = 'bun.lock'
export const BUN_LOCKB = 'bun.lockb'
export const VLT_LOCK_JSON = 'vlt-lock.json'

// Workspace configuration.
export const PNPM_WORKSPACE_YAML = 'pnpm-workspace.yaml'

// Package.json fields for dependency overrides.
export const OVERRIDES = 'overrides'
export const RESOLUTIONS = 'resolutions'
