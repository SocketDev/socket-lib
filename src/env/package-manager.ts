/**
 * @file Package manager environment detection. Provides utilities to detect
 *   which package manager (npm/pnpm/yarn/bun) is running.
 */

import process from 'node:process'

import { getEnvValue } from './rewire'

/**
 * Package manager type detected from environment.
 */
export type PackageManagerType = 'npm' | 'pnpm' | 'yarn' | 'bun' | undefined

/**
 * Detect which package manager is currently running based on environment
 * variables. Checks npm_config_user_agent which all package managers set.
 *
 * Detection priority:
 *
 * 1. Npm_config_user_agent (most reliable, set by all package managers)
 * 2. Binary path analysis (fallback for non-standard environments)
 *
 * @example
 *   ;```typescript
 *   // During: npm install
 *   detectPackageManager() // 'npm'
 *
 *   // During: pnpm install
 *   detectPackageManager() // 'pnpm'
 *
 *   // During: yarn install
 *   detectPackageManager() // 'yarn'
 *
 *   // Outside package manager context
 *   detectPackageManager() // undefined
 *   ```
 *
 * @returns The detected package manager or null if unable to determine
 */
/*@__NO_SIDE_EFFECTS__*/
export function detectPackageManager(): PackageManagerType {
  const userAgent = getPackageManagerUserAgent()

  if (userAgent) {
    // User agent format: "pnpm/8.15.1 npm/? node/v20.11.0 darwin arm64"
    // Extract the first part before the slash.
    const match = userAgent.match(/^(bun|npm|pnpm|yarn)\//)
    if (match) {
      return match[1] as PackageManagerType
    }
  }

  /* c8 ignore start - argv0-based PM fallback only fires when
     npm_config_user_agent / lifecycle env detection both miss.
     In test runs argv0 is always the test runner's node binary,
     not a PM shim. */
  const argv0 = process.argv[0]
  if (argv0) {
    if (argv0.includes('/pnpm/') || argv0.includes('\\pnpm\\')) {
      return 'pnpm'
    }
    if (
      argv0.includes('/yarn/') ||
      argv0.includes('\\yarn\\') ||
      argv0.includes('/.yarn/') ||
      argv0.includes('\\.yarn\\')
    ) {
      return 'yarn'
    }
    if (argv0.includes('/bun/') || argv0.includes('\\bun\\')) {
      return 'bun'
    }
    // If in node_modules but no other match, assume npm.
    if (
      argv0.includes('/node_modules/') ||
      argv0.includes('\\node_modules\\')
    ) {
      return 'npm'
    }
  }
  /* c8 ignore stop */

  return undefined
}

/**
 * Get the package manager name and version from user agent.
 *
 * @example
 *   ;```typescript
 *   getPackageManagerInfo()
 *   // { name: 'pnpm', version: '8.15.1' }
 *   ```
 *
 * @returns Object with name and version, or null if not available
 */
/*@__NO_SIDE_EFFECTS__*/
export function getPackageManagerInfo():
  | {
      name: string
      version: string
    }
  | undefined {
  const userAgent = getPackageManagerUserAgent()
  if (!userAgent) {
    return undefined
  }

  // Parse "pnpm/8.15.1 npm/? node/v20.11.0 darwin arm64".
  const match = userAgent.match(/^([^/]+)\/([^\s]+)/)
  if (match?.[1] && match[2]) {
    return {
      name: match[1],
      version: match[2],
    }
  }

  return undefined
}

/**
 * Get the package manager user agent from environment. Package managers set
 * npm_config_user_agent with format: "npm/8.19.2 node/v18.12.0 darwin arm64"
 *
 * @example
 *   ;```typescript
 *   getPackageManagerUserAgent()
 *   // npm: "npm/10.2.4 node/v20.11.0 darwin arm64 workspaces/false"
 *   // pnpm: "pnpm/8.15.1 npm/? node/v20.11.0 darwin arm64"
 *   // yarn: "yarn/1.22.19 npm/? node/v20.11.0 darwin arm64"
 *   ```
 *
 * @returns The user agent string or undefined
 */
/*@__NO_SIDE_EFFECTS__*/
export function getPackageManagerUserAgent(): string | undefined {
  return getEnvValue('npm_config_user_agent')
}
