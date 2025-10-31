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
 * - Lock file created at ~/.socket/_dlx/<hash>/concurrency.lock
 * - Uses npm npx's concurrency.lock naming convention (5s stale, 2s touching)
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
import { readJsonSync } from './fs'
import { normalizePath } from './path'
import { getSocketDlxDir } from './paths'
import { processLock } from './process-lock'
import type { SpawnExtra, SpawnOptions } from './spawn'
import { spawn } from './spawn'

let _npmPackageArg: typeof import('npm-package-arg') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getNpmPackageArg() {
  if (_npmPackageArg === undefined) {
    _npmPackageArg = /*@__PURE__*/ require('./external/npm-package-arg')
  }
  return _npmPackageArg as typeof import('npm-package-arg')
}

let _pacote: typeof import('pacote') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getPacote() {
  if (_pacote === undefined) {
    _pacote = /*@__PURE__*/ require('./external/pacote')
  }
  return _pacote as typeof import('pacote')
}

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
   * Binary name to execute (optional - auto-detected in most cases).
   *
   * Auto-detection logic:
   * 1. If package has only one binary, uses it automatically
   * 2. Tries user-provided binaryName
   * 3. Tries last segment of package name (e.g., 'cli' from '@socketsecurity/cli')
   * 4. Falls back to first binary
   *
   * Only needed when package has multiple binaries and auto-detection fails.
   *
   * @example
   * // Auto-detected (single binary)
   * { package: '@socketsecurity/cli' }  // Finds 'socket' binary automatically
   *
   * // Explicit (multiple binaries)
   * { package: 'some-tool', binaryName: 'specific-tool' }
   */
  binaryName?: string | undefined
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
 * Parse package spec into name and version using npm-package-arg.
 * Examples:
 * - 'lodash@4.17.21' → { name: 'lodash', version: '4.17.21' }
 * - '@scope/pkg@1.0.0' → { name: '@scope/pkg', version: '1.0.0' }
 * - 'lodash' → { name: 'lodash', version: undefined }
 */
function parsePackageSpec(spec: string): {
  name: string
  version: string | undefined
} {
  try {
    const npa = getNpmPackageArg()
    const parsed = npa(spec)

    // Extract version from different types of specs.
    // For registry specs, use fetchSpec (the version/range).
    // For git/file/etc, version will be undefined.
    const version =
      parsed.type === 'tag'
        ? parsed.fetchSpec
        : parsed.type === 'version' || parsed.type === 'range'
          ? parsed.fetchSpec
          : undefined

    return {
      name: parsed.name || spec,
      version,
    }
  } catch {
    // Fallback to simple parsing if npm-package-arg fails.
    const atIndex = spec.lastIndexOf('@')
    if (atIndex === -1 || spec.startsWith('@')) {
      // No version or scoped package without version.
      return { name: spec, version: undefined }
    }
    return {
      name: spec.slice(0, atIndex),
      version: spec.slice(atIndex + 1),
    }
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

  // Ensure package directory exists before creating lock.
  // The lock directory will be created inside this directory.
  try {
    await fs.mkdir(packageDir, { recursive: true })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(
        `Permission denied creating package directory: ${packageDir}\n` +
          'Please check directory permissions or run with appropriate access.',
        { cause: e },
      )
    }
    if (code === 'EROFS') {
      throw new Error(
        `Cannot create package directory on read-only filesystem: ${packageDir}\n` +
          'Ensure the filesystem is writable or set SOCKET_DLX_DIR to a writable location.',
        { cause: e },
      )
    }
    throw new Error(`Failed to create package directory: ${packageDir}`, {
      cause: e,
    })
  }

  // Use process lock to prevent concurrent installations.
  // Uses npm npx's concurrency.lock naming convention.
  const lockPath = path.join(packageDir, 'concurrency.lock')

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

      // Use pacote to extract the package.
      // Pacote leverages npm cache when available but doesn't require npm CLI.
      const pacoteCachePath = getPacoteCachePath()
      try {
        await getPacote().extract(packageSpec, installedDir, {
          // Use consistent pacote cache path (respects npm cache locations when available).
          cache: pacoteCachePath || path.join(packageDir, '.cache'),
        })
      } catch (e) {
        const code = (e as any).code
        if (code === 'E404' || code === 'ETARGET') {
          throw new Error(
            `Package not found: ${packageSpec}\n` +
              'Verify the package exists on npm registry and check the version.\n' +
              `Visit https://www.npmjs.com/package/${packageName} to see available versions.`,
            { cause: e },
          )
        }
        if (
          code === 'ENOTFOUND' ||
          code === 'ETIMEDOUT' ||
          code === 'EAI_AGAIN'
        ) {
          throw new Error(
            `Network error installing ${packageSpec}\n` +
              'Check your internet connection and try again.',
            { cause: e },
          )
        }
        throw new Error(
          `Failed to install package: ${packageSpec}\n` +
            `Destination: ${installedDir}\n` +
            'Check npm registry connectivity or package name.',
          { cause: e },
        )
      }

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
 * Intelligently handles packages with single or multiple binaries.
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
    // Single binary - use it directly.
    binPath = bin
  } else if (typeof bin === 'object' && bin !== null) {
    const binObj = bin as Record<string, string>
    const binKeys = Object.keys(binObj)

    // If only one binary, use it regardless of name.
    if (binKeys.length === 1) {
      binPath = binObj[binKeys[0]!]
    } else {
      // Multiple binaries - try to find the right one:
      // 1. User-provided binaryName
      // 2. Last segment of package name (e.g., 'cli' from '@socketsecurity/cli')
      // 3. Full package name without scope (e.g., 'cli' from '@socketsecurity/cli')
      // 4. First binary as fallback
      const lastSegment = packageName.split('/').pop()
      const candidates = [
        binaryName,
        lastSegment,
        packageName.replace(/^@[^/]+\//, ''),
      ].filter(Boolean)

      for (const candidate of candidates) {
        if (candidate && binObj[candidate]) {
          binPath = binObj[candidate]
          break
        }
      }

      // Fallback to first binary if nothing matched.
      if (!binPath && binKeys.length > 0) {
        binPath = binObj[binKeys[0]!]
      }
    }
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
  const {
    binaryName,
    force: userForce,
    package: packageSpec,
  } = {
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
  const binaryPath = findBinaryPath(packageDir, packageName, binaryName)

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
