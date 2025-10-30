/**
 * @fileoverview DLX package execution - Install and execute npm packages.
 *
 * This module provides functionality to install and execute npm packages
 * in the ~/.socket/_dlx directory, similar to npx but with Socket's own cache.
 *
 * Uses content-addressed storage like npm's _npx:
 * - Hash is generated from package spec (name@version)
 * - Each unique spec gets its own directory: ~/.socket/_dlx/<hash>/
 * - Allows caching multiple versions of the same package
 *
 * Concurrency protection:
 * - Uses process-lock to prevent concurrent installation corruption
 * - Lock file created at ~/.socket/_dlx/<hash>/.lock
 * - Aligned with npm npx's concurrency.lock strategy (5s stale, 2s touching)
 * - Prevents multiple processes from corrupting the same package installation
 *
 * Version range handling:
 * - Exact versions (1.0.0) use cache if available
 * - Range versions (^1.0.0, ~1.0.0) auto-force to get latest within range
 * - User can override with explicit force: false
 *
 * Key difference from dlx-binary.ts:
 * - dlx-binary.ts: Downloads standalone binaries from URLs
 * - dlx-package.ts: Installs npm packages from registries
 *
 * Implementation:
 * - Uses pacote for package installation (no npm CLI required)
 * - Split into downloadPackage() and executePackage() for flexibility
 * - dlxPackage() combines both for convenience
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

import { WIN32 } from './constants/platform'
import { getPacoteCachePath } from './constants/packages'
import { generateCacheKey } from './dlx'
import pacote from './external/pacote'
import { readJsonSync } from './fs'
import { normalizePath } from './path'
import { getSocketDlxDir } from './paths'
import { processLock } from './process-lock'
import type { SpawnExtra, SpawnOptions } from './spawn'
import { spawn } from './spawn'

/**
 * Regex to check if a version string contains range operators.
 * Matches any version with range operators: ~, ^, >, <, =, x, X, *, spaces, or ||.
 */
const rangeOperatorsRegExp = /[~^><=xX* ]|\|\|/

export interface DownloadPackageResult {
  /** Path to the installed package directory. */
  packageDir: string
  /** Path to the binary. */
  binaryPath: string
  /** Whether the package was newly installed. */
  installed: boolean
}

export interface DlxPackageOptions {
  /**
   * Package to install (e.g., '@cyclonedx/cdxgen@10.0.0').
   */
  package: string
  /**
   * Force reinstallation even if package exists.
   */
  force?: boolean | undefined
  /**
   * Additional spawn options for the execution.
   */
  spawnOptions?: SpawnOptions | undefined
}

export interface DlxPackageResult {
  /** Path to the installed package directory. */
  packageDir: string
  /** Path to the binary that was executed. */
  binaryPath: string
  /** Whether the package was newly installed. */
  installed: boolean
  /** The spawn promise for the running process. */
  spawnPromise: ReturnType<typeof spawn>
}

/**
 * Parse package spec into name and version.
 * Examples:
 * - 'lodash@4.17.21' → { name: 'lodash', version: '4.17.21' }
 * - '@scope/pkg@1.0.0' → { name: '@scope/pkg', version: '1.0.0' }
 * - 'lodash' → { name: 'lodash', version: undefined }
 */
function parsePackageSpec(spec: string): {
  name: string
  version: string | undefined
} {
  // Handle scoped packages (@scope/name@version).
  if (spec.startsWith('@')) {
    const parts = spec.split('@')
    if (parts.length === 3) {
      // @scope@version -> Invalid, but handle gracefully.
      return { name: parts[1], version: parts[2] }
    }
    if (parts.length === 2) {
      // @scope/name with no version.
      return { name: `@${parts[1]}`, version: undefined }
    }
    // @scope/name@version.
    const scopeAndName = `@${parts[1]}`
    return { name: scopeAndName, version: parts[2] }
  }

  // Handle unscoped packages (name@version).
  const atIndex = spec.lastIndexOf('@')
  if (atIndex === -1) {
    return { name: spec, version: undefined }
  }

  return {
    name: spec.slice(0, atIndex),
    version: spec.slice(atIndex + 1),
  }
}

/**
 * Install package to ~/.socket/_dlx/<hash>/ if not already installed.
 * Uses pacote for installation (no npm CLI required).
 * Protected by process lock to prevent concurrent installation corruption.
 */
async function ensurePackageInstalled(
  packageName: string,
  packageSpec: string,
  force: boolean,
): Promise<{ installed: boolean; packageDir: string }> {
  const cacheKey = generateCacheKey(packageSpec)
  const packageDir = normalizePath(path.join(getSocketDlxDir(), cacheKey))
  const installedDir = normalizePath(
    path.join(packageDir, 'node_modules', packageName),
  )

  // Use process lock to prevent concurrent installations.
  // Similar to npm npx's concurrency.lock approach.
  const lockPath = path.join(packageDir, '.lock')

  return await processLock.withLock(
    lockPath,
    async () => {
      // Double-check if already installed (unless force).
      // Another process may have installed while waiting for lock.
      if (!force && existsSync(installedDir)) {
        // Verify package.json exists.
        const pkgJsonPath = path.join(installedDir, 'package.json')
        if (existsSync(pkgJsonPath)) {
          return { installed: false, packageDir }
        }
      }

      // Ensure package directory exists.
      await fs.mkdir(packageDir, { recursive: true })

      // Use pacote to extract the package.
      // Pacote leverages npm cache when available but doesn't require npm CLI.
      const pacoteCachePath = getPacoteCachePath()
      await pacote.extract(packageSpec, installedDir, {
        // Use consistent pacote cache path (respects npm cache locations when available).
        cache: pacoteCachePath || path.join(packageDir, '.cache'),
      })

      return { installed: true, packageDir }
    },
    {
      // Align with npm npx locking strategy.
      staleMs: 5000,
      touchIntervalMs: 2000,
    },
  )
}

/**
 * Find the binary path for an installed package.
 */
function findBinaryPath(
  packageDir: string,
  packageName: string,
  binaryName?: string,
): string {
  const installedDir = normalizePath(
    path.join(packageDir, 'node_modules', packageName),
  )
  const pkgJsonPath = path.join(installedDir, 'package.json')

  // Read package.json to find bin entry.
  const pkgJson = readJsonSync(pkgJsonPath) as Record<string, unknown>
  const bin = pkgJson['bin']

  let binPath: string | undefined

  if (typeof bin === 'string') {
    // Single binary.
    binPath = bin
  } else if (typeof bin === 'object' && bin !== null) {
    // Multiple binaries - use binaryName or package name.
    const binName = binaryName || packageName.split('/').pop()
    binPath = (bin as Record<string, string>)[binName!]
  }

  if (!binPath) {
    throw new Error(`No binary found for package "${packageName}"`)
  }

  return normalizePath(path.join(installedDir, binPath))
}

/**
 * Execute a package via DLX - install if needed and run its binary.
 *
 * This is the Socket equivalent of npx/pnpm dlx/yarn dlx, but using
 * our own cache directory (~/.socket/_dlx) and installation logic.
 *
 * Auto-forces reinstall for version ranges to get latest within range.
 *
 * @example
 * ```typescript
 * // Download and execute cdxgen
 * const result = await dlxPackage(
 *   ['--version'],
 *   { package: '@cyclonedx/cdxgen@10.0.0' }
 * )
 * await result.spawnPromise
 * ```
 */
export async function dlxPackage(
  args: readonly string[] | string[],
  options?: DlxPackageOptions | undefined,
  spawnExtra?: SpawnExtra | undefined,
): Promise<DlxPackageResult> {
  // Download the package.
  const downloadResult = await downloadPackage(options!)

  // Execute the binary.
  const spawnPromise = executePackage(
    downloadResult.binaryPath,
    args,
    options?.spawnOptions,
    spawnExtra,
  )

  return {
    ...downloadResult,
    spawnPromise,
  }
}

/**
 * Download and install a package without executing it.
 * This is useful for self-update or when you need the package files
 * but don't want to run the binary immediately.
 *
 * @example
 * ```typescript
 * // Install @socketsecurity/cli without running it
 * const result = await downloadPackage({
 *   package: '@socketsecurity/cli@1.2.0',
 *   force: true
 * })
 * console.log('Installed to:', result.packageDir)
 * console.log('Binary at:', result.binaryPath)
 * ```
 */
export async function downloadPackage(
  options: DlxPackageOptions,
): Promise<DownloadPackageResult> {
  const { force: userForce, package: packageSpec } = {
    __proto__: null,
    ...options,
  } as DlxPackageOptions

  // Parse package spec.
  const { name: packageName, version: packageVersion } =
    parsePackageSpec(packageSpec)

  // Auto-force for version ranges to get latest within range.
  // User can still override with explicit force: false if they want cache.
  const isVersionRange =
    packageVersion !== undefined && rangeOperatorsRegExp.test(packageVersion)
  const force = userForce !== undefined ? userForce : isVersionRange

  // Build full package spec for installation.
  const fullPackageSpec = packageVersion
    ? `${packageName}@${packageVersion}`
    : packageName

  // Ensure package is installed.
  const { installed, packageDir } = await ensurePackageInstalled(
    packageName,
    fullPackageSpec,
    force,
  )

  // Find binary path.
  const binaryPath = findBinaryPath(packageDir, packageName)

  // Make binary executable on Unix systems.
  if (!WIN32 && existsSync(binaryPath)) {
    const { chmodSync } = require('node:fs')
    try {
      chmodSync(binaryPath, 0o755)
    } catch {
      // Ignore chmod errors.
    }
  }

  return {
    binaryPath,
    installed,
    packageDir,
  }
}

/**
 * Execute a package's binary.
 * The package must already be installed (use downloadPackage first).
 *
 * @example
 * ```typescript
 * // Execute an already-installed package
 * const downloaded = await downloadPackage({ package: 'cowsay@1.5.0' })
 * const result = await executePackage(
 *   downloaded.binaryPath,
 *   ['Hello World'],
 *   { stdio: 'inherit' }
 * )
 * ```
 */
export function executePackage(
  binaryPath: string,
  args: readonly string[] | string[],
  spawnOptions?: SpawnOptions | undefined,
  spawnExtra?: SpawnExtra | undefined,
): ReturnType<typeof spawn> {
  return spawn(binaryPath, args, spawnOptions, spawnExtra)
}
