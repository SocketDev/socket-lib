/**
 * @fileoverview Package manager agent constants.
 * Exports agent names (npm/pnpm/yarn/bun/vlt/npx), lockfile names, registry
 * URLs, and resolved npm binary paths used across Socket tooling.
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
    return which.sync('npm', { nothrow: true }) || null
  } catch {
    return null
  }
})()

export const NPM_BIN_PATH = _npmBinPath || 'npm'

// NPM CLI entry point - resolved at runtime from npm bin location.
// NOTE: This is kept for backward compatibility but NPM_BIN_PATH should be used instead
// because cli.js exports a function that must be invoked, not executed directly.
export const NPM_REAL_EXEC_PATH = /*@__PURE__*/ (() => {
  try {
    // Reuse cached npm bin path to avoid duplicate which.sync call.
    if (!_npmBinPath) {
      return undefined
    }
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
    return undefined
  } catch {
    return undefined
  }
})()

// NPM registry URL.
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org'

// Agent variants.
export const YARN_BERRY = 'yarn/berry'
export const YARN_CLASSIC = 'yarn/classic'

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
