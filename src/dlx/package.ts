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
 * - Uses Arborist for package installation (like npx, no npm CLI required)
 * - Split into downloadPackage() and executePackage() for flexibility
 * - dlxPackage() combines both for convenience
 */

import { WIN32 } from '../constants/platform'
import { SOCKET_LIB_USER_AGENT } from '../constants/socket'
import { isError } from '../errors'
import Arborist from '../external/@npmcli/arborist'
import libnpmexec from '../external/libnpmexec'
import npmPackageArg from '../external/npm-package-arg'
import { readJsonSync, safeMkdir } from '../fs'
import { httpJson } from '../http-request'
import { normalizePath } from '../paths/normalize'
import { getSocketCacacheDir, getSocketDlxDir } from '../paths/socket'
import { processLock } from '../process-lock'
import { spawn } from '../spawn'
import { generateCacheKey } from './cache'

import type { HashSpec } from './integrity'
import type { LockfileSpec } from './lockfile'
import type { SpawnExtra, SpawnOptions } from '../spawn'

import {
  ErrorCtor,
  MapCtor,
  ObjectKeys,
  ObjectValues,
  PromiseAllSettled,
  RegExpPrototypeTest,
  SetCtor,
  StringPrototypeLastIndexOf,
  StringPrototypeReplace,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../primordials'

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

/**
 * Regex to check if a version string contains range operators.
 * Matches any version with range operators: ~, ^, >, <, =, x, X, *, spaces, or ||.
 */
const rangeOperatorsRegExp = /[~^><=xX* ]|\|\|/

const FIREWALL_API_URL = 'https://firewall-api.socket.dev/purl'
const FIREWALL_TIMEOUT = 10_000
const FIREWALL_BLOCK_SEVERITIES: ReadonlySet<string> = new SetCtor([
  'critical',
  'high',
])

// Cache for binary path resolution to avoid repeated extension checks
// on Windows. Bounded LRU: a long-running process that resolves many
// distinct binary paths used to accumulate entries forever, and entries
// for paths that have since been garbage-collected by `cleanDlxCache`
// were never reclaimed. Map iteration order = insertion order; accessing
// an entry re-inserts it to bump recency.
const BINARY_PATH_CACHE_MAX_SIZE = 200
const binaryPathCache = new MapCtor<string, string>()

function binaryPathCacheSet(key: string, value: string): void {
  if (binaryPathCache.has(key)) {
    binaryPathCache.delete(key)
  } else if (binaryPathCache.size >= BINARY_PATH_CACHE_MAX_SIZE) {
    const oldest = binaryPathCache.keys().next().value
    if (oldest !== undefined) {
      binaryPathCache.delete(oldest)
    }
  }
  binaryPathCache.set(key, value)
}

interface FirewallAlert {
  severity?: string
  type?: string
  key?: string
}

interface FirewallResponse {
  alerts?: FirewallAlert[]
}

export interface DownloadPackageResult {
  /** Path to the installed package directory. */
  packageDir: string
  /** Path to the binary. */
  binaryPath: string
  /** Whether the package was newly installed. */
  installed: boolean
}

/**
 * Shared install-pinning options used by both {@link DlxPackageOptions}
 * and the lower-level {@link ensurePackageInstalled}.
 */
export interface EnsurePackageInstallOptions {
  /**
   * Expected hash of the top-level package tarball. Accepts either:
   * - A bare sha512 SRI string (sniffed as integrity).
   * - A bare sha256 hex string (sniffed as checksum).
   * - An explicit `{ type: 'integrity' | 'checksum', value }` object.
   */
  hash?: HashSpec | undefined

  /**
   * Vendored `package-lock.json` to drive a reproducible install. Accepts
   * a filesystem path (sniffed) or raw JSON content (sniffed via leading
   * `{`), or an explicit `{ type: 'path' | 'content', value }` object.
   *
   * When provided, the lockfile is written into the install dir before
   * Arborist runs and a hardened `.npmrc` is placed alongside it.
   */
  lockfile?: LockfileSpec | undefined
}

export interface DlxPackageOptions extends EnsurePackageInstallOptions {
  /**
   * Package to install (e.g., '@cyclonedx/cdxgen@10.0.0').
   * Aligns with npx --package flag.
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
   * Aligns with npx --yes/-y flag behavior.
   */
  force?: boolean | undefined

  /**
   * Skip confirmation prompts (auto-approve).
   * Aligns with npx --yes/-y flag.
   */
  yes?: boolean | undefined

  /**
   * Suppress output (quiet mode).
   * Aligns with npx --quiet/-q and pnpm --silent/-s flags.
   */
  quiet?: boolean | undefined

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
 * Check all resolved packages in an Arborist ideal tree against the
 * Socket Firewall API (public, no auth required).
 * Throws if any dependency has critical or high severity alerts.
 *
 * @param arb - Arborist instance with populated idealTree
 * @param requestedPackage - Top-level package name (for error messages)
 * @private
 */
async function checkFirewallPurls(
  arb: InstanceType<typeof Arborist>,
  requestedPackage: string,
): Promise<void> {
  const idealTree = arb.idealTree
  if (!idealTree) {
    return
  }

  // Collect PURLs for all non-root resolved nodes.
  const purls: Array<{ purl: string; name: string; version: string }> = []
  for (const node of idealTree.inventory.values()) {
    if (node.isProjectRoot) {
      continue
    }
    const { name, version } = node.package
    if (!name || !version) {
      continue
    }
    purls.push({ purl: npmPurl(name, version), name, version })
  }
  if (purls.length === 0) {
    return
  }

  const blocked: Array<{
    name: string
    version: string
    alerts: string[]
  }> = []

  // Check all PURLs against the public firewall API in parallel.
  await PromiseAllSettled(
    purls.map(async ({ name, purl, version }) => {
      try {
        const data = await httpJson<FirewallResponse>(
          `${FIREWALL_API_URL}/${encodeURIComponent(purl)}`,
          {
            headers: { 'User-Agent': SOCKET_LIB_USER_AGENT },
            timeout: FIREWALL_TIMEOUT,
            retries: 1,
            retryDelay: 500,
          },
        )
        const blocking = (data.alerts ?? []).filter(
          a => a.severity && FIREWALL_BLOCK_SEVERITIES.has(a.severity),
        )
        if (blocking.length > 0) {
          blocked.push({
            name,
            version,
            alerts: blocking.map(
              a => `${a.severity}: ${a.type ?? a.key ?? 'unknown'}`,
            ),
          })
        }
      } catch {
        // Firewall API errors are non-fatal — allow install to proceed.
      }
    }),
  )

  if (blocked.length > 0) {
    const details = blocked
      .map(b => `  ${b.name}@${b.version}: ${b.alerts.join(', ')}`)
      .join('\n')
    throw new ErrorCtor(
      `Socket Firewall blocked installation of "${requestedPackage}".\n` +
        `The following dependencies have security alerts:\n${details}\n\n` +
        'Visit https://socket.dev for more information.',
    )
  }
}

/**
 * Lazily load the fs module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load the path module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @returns The Node.js path module
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
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
  options: DlxPackageOptions,
  spawnExtra?: SpawnExtra | undefined,
): Promise<DlxPackageResult> {
  // Download the package.
  const downloadResult = await downloadPackage(options)

  // Execute the binary.
  const spawnPromise = executePackage(
    downloadResult.binaryPath,
    args,
    options.spawnOptions,
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
    hash,
    lockfile,
    package: packageSpec,
    yes,
  } = {
    __proto__: null,
    ...options,
  } as DlxPackageOptions

  // Parse package spec.
  const { name: packageName, version: packageVersion } =
    parsePackageSpec(packageSpec)

  // Determine force behavior:
  // 1. Explicit force takes precedence
  // 2. --yes flag implies force (auto-approve/skip prompts)
  // 3. Version ranges auto-force to get latest
  const isVersionRange =
    packageVersion !== undefined &&
    RegExpPrototypeTest(rangeOperatorsRegExp, packageVersion)
  const force =
    userForce !== undefined ? userForce : yes === true ? true : isVersionRange

  // Build full package spec for installation.
  const fullPackageSpec = packageVersion
    ? `${packageName}@${packageVersion}`
    : packageName

  // Ensure package is installed.
  const { installed, packageDir } = await ensurePackageInstalled(
    packageName,
    fullPackageSpec,
    force,
    { hash, lockfile },
  )

  // Find binary path.
  const binaryPath = findBinaryPath(packageDir, packageName, binaryName)

  // Make all binaries in the package executable on Unix systems.
  makePackageBinsExecutable(packageDir, packageName)

  return {
    binaryPath,
    installed,
    packageDir,
  }
}

/**
 * Install package to ~/.socket/_dlx/<hash>/ if not already installed.
 * Uses pacote for installation (no npm CLI required).
 * Protected by process lock to prevent concurrent installation corruption.
 *
 * @example
 * ```typescript
 * const { installed, packageDir } = await ensurePackageInstalled(
 *   'prettier',
 *   'prettier@3.0.0',
 *   false
 * )
 * console.log(`Installed: ${installed}, dir: ${packageDir}`)
 * ```
 */
export async function ensurePackageInstalled(
  packageName: string,
  packageSpec: string,
  force: boolean,
  install?: EnsurePackageInstallOptions | undefined,
): Promise<{ installed: boolean; packageDir: string }> {
  const fs = getFs()
  const path = getPath()
  const cacheKey = generateCacheKey(packageSpec)
  const packageDir = normalizePath(path.join(getSocketDlxDir(), cacheKey))
  const installedDir = normalizePath(
    path.join(packageDir, 'node_modules', packageName),
  )

  // Ensure package directory exists before creating lock.
  // The lock directory will be created inside this directory.
  try {
    await safeMkdir(packageDir)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') {
      throw new ErrorCtor(
        `Permission denied creating package directory: ${packageDir}\n` +
          'Please check directory permissions or run with appropriate access.',
        { cause: e },
      )
    }
    if (code === 'EROFS') {
      throw new ErrorCtor(
        `Cannot create package directory on read-only filesystem: ${packageDir}\n` +
          'Ensure the filesystem is writable or set SOCKET_DLX_DIR to a writable location.',
        { cause: e },
      )
    }
    throw new ErrorCtor(`Failed to create package directory: ${packageDir}`, {
      cause: e,
    })
  }

  // Use process lock to prevent concurrent installations.
  // Uses npm npx's concurrency.lock naming convention.
  const lockPath = path.join(packageDir, 'concurrency.lock')

  return await processLock.withLock(
    lockPath,
    async () => {
      // fs is imported at the top
      // Double-check if already installed (unless force).
      // Another process may have installed while waiting for lock.
      if (!force && fs.existsSync(installedDir)) {
        // Verify package.json exists.
        const pkgJsonPath = path.join(installedDir, 'package.json')
        if (fs.existsSync(pkgJsonPath)) {
          return { installed: false, packageDir }
        }
      }

      // If a lockfile was provided, materialize it into packageDir and
      // drop a hardened .npmrc alongside. Arborist picks up both.
      // Sniff: explicit { type, value } wins; bare string with leading `{`
      // (after whitespace) is JSON content, else a filesystem path.
      if (install?.lockfile !== undefined) {
        const spec = install.lockfile
        const lockDest = path.join(packageDir, 'package-lock.json')
        let isContent: boolean
        let value: string
        if (typeof spec === 'string') {
          isContent = spec.trimStart().startsWith('{')
          value = spec
        } else {
          isContent = spec.type === 'content'
          value = spec.value
        }
        if (isContent) {
          fs.writeFileSync(lockDest, value, 'utf8')
        } else {
          fs.copyFileSync(value, lockDest)
        }
        fs.writeFileSync(
          path.join(packageDir, '.npmrc'),
          'ignore-scripts=true\naudit=false\nfund=false\nsave=false\n',
          'utf8',
        )
      }

      // Install package and dependencies using Arborist (like npx does).
      // Split into buildIdealTree → firewall check → reify so we can
      // scan all resolved packages before downloading any tarballs.
      try {
        // Arborist is imported at the top
        /* c8 ignore next 3 - External Arborist constructor */
        const arb = new Arborist({
          path: packageDir,
          // Use Socket's shared cacache directory (~/.socket/_cacache).
          cache: getSocketCacacheDir(),
          // Skip devDependencies (production-only like npx).
          omit: ['dev'],
          // Security: Skip install/preinstall/postinstall scripts to prevent arbitrary code execution.
          ignoreScripts: true,
          // Security: Enable binary links (needed for dlx to execute the package binary).
          binLinks: true,
          // Suppress funding messages (unneeded for ephemeral dlx installs).
          fund: false,
          // Skip audit (unneeded for ephemeral dlx installs).
          audit: false,
          // Suppress output (unneeded for ephemeral dlx installs).
          silent: true,
        })

        // Step 1: Resolve dependency tree (registry metadata only, no tarballs).
        /* c8 ignore next - External Arborist call */
        await arb.buildIdealTree({ add: [packageSpec] })

        // Step 2: Check resolved packages against Socket Firewall API (public).
        /* c8 ignore next - External API call */
        await checkFirewallPurls(arb, packageName)

        // Step 3: Download tarballs and install. Reuses the cached idealTree.
        // save: true creates package.json and package-lock.json at the root (like npx).
        /* c8 ignore next - External Arborist call */
        await arb.reify({ save: true })
      } catch (e) {
        // Rethrow firewall block errors without wrapping.
        if (isError(e) && e.message.startsWith('Socket Firewall blocked')) {
          throw e
        }
        const code = (e as { code?: string } | null)?.code
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
 * Execute a package's binary with cross-platform shell handling.
 * The package must already be installed (use downloadPackage first).
 *
 * On Windows, script files (.bat, .cmd, .ps1) require shell: true.
 * Matches npm/npx execution behavior.
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
  // On Windows, script files (.bat, .cmd, .ps1) require shell: true
  // because they are not executable on their own and must be run through cmd.exe.
  // .exe files are actual binaries and don't need shell mode.
  const needsShell = WIN32 && /\.(?:bat|cmd|ps1)$/i.test(binaryPath)

  const finalOptions = needsShell
    ? {
        ...spawnOptions,
        shell: true,
      }
    : spawnOptions

  return spawn(binaryPath, args, finalOptions, spawnExtra)
}

/**
 * Find the binary path for an installed package.
 * Uses npm's bin resolution strategy with user-friendly fallbacks.
 * Resolves platform-specific wrappers (.cmd, .ps1, etc.) on Windows.
 *
 * Resolution strategy (cherry-picked from libnpmexec):
 * 1. Use npm's getBinFromManifest (handles aliases and standard cases)
 * 2. Fall back to user-provided binaryName if npm's strategy fails
 * 3. Try last segment of package name as final fallback
 * 4. Use first binary as last resort
 *
 * @example
 * ```typescript
 * const binPath = findBinaryPath(
 *   '/tmp/.socket/_dlx/a1b2c3d4',
 *   'prettier'
 * )
 * console.log(`Binary: ${binPath}`)
 * ```
 */
export function findBinaryPath(
  packageDir: string,
  packageName: string,
  binaryName?: string,
): string {
  const path = getPath()
  const installedDir = normalizePath(
    path.join(packageDir, 'node_modules', packageName),
  )
  const pkgJsonPath = path.join(installedDir, 'package.json')

  // Read package.json to find bin entry.
  const pkgJson = readJsonSync(pkgJsonPath) as Record<string, unknown>
  const bin = pkgJson['bin']

  let binName: string | undefined
  let binPath: string | undefined

  if (typeof bin === 'string') {
    // Single binary - use it directly.
    binPath = bin
  } else if (typeof bin === 'object' && bin !== null) {
    const binObj = bin as Record<string, string>
    const binKeys = ObjectKeys(binObj)

    // If only one binary, use it regardless of name.
    if (binKeys.length === 1) {
      binName = binKeys[0]!
      binPath = binObj[binName]
    } else {
      // Multiple binaries - use npm's battle-tested resolution strategy first.
      try {
        /* c8 ignore next 6 - External libnpmexec call */
        const { getBinFromManifest } = libnpmexec
        binName = getBinFromManifest({
          name: packageName,
          bin: binObj,
          _id: `${packageName}@${(pkgJson as { version?: string }).version || 'unknown'}`,
        })
        binPath = binObj[binName]
      } catch {
        // npm's strategy failed - fall back to user-friendly resolution:
        // 1. User-provided binaryName
        // 2. Last segment of package name (e.g., 'cli' from '@socketsecurity/cli')
        // 3. First binary as fallback
        const lastSegment = packageName.split('/').pop() ?? packageName
        const candidates = [
          binaryName,
          lastSegment,
          packageName.replace(/^@[^/]+\//, ''),
        ].filter(Boolean)

        for (const candidate of candidates) {
          if (candidate && binObj[candidate]) {
            binName = candidate
            binPath = binObj[candidate]
            break
          }
        }

        // Fallback to first binary if nothing matched.
        if (!binPath && binKeys.length > 0) {
          binName = binKeys[0]!
          binPath = binObj[binName]
        }
      }
    }
  }

  if (!binPath) {
    throw new ErrorCtor(`No binary found for package "${packageName}"`)
  }

  const rawPath = normalizePath(path.join(installedDir, binPath))

  // Resolve platform-specific wrapper (Windows .cmd/.ps1/etc.)
  return resolveBinaryPath(rawPath)
}

/**
 * Make all binaries in an installed package executable.
 * Reads the package.json bin field and makes all binaries executable (chmod 0o755).
 * Handles both single binary (string) and multiple binaries (object) formats.
 *
 * Aligns with npm's approach:
 * - Uses 0o755 permission (matches npm's cmd-shim)
 * - Reads bin field from package.json (matches npm's bin-links and libnpmexec)
 * - Handles both string and object bin formats
 *
 * References:
 * - npm cmd-shim: https://github.com/npm/cmd-shim/blob/main/lib/index.js
 * - npm getBinFromManifest: https://github.com/npm/libnpmexec/blob/main/lib/get-bin-from-manifest.js
 *
 * @example
 * ```typescript
 * makePackageBinsExecutable(
 *   '/tmp/.socket/_dlx/a1b2c3d4',
 *   'prettier'
 * )
 * ```
 */
export function makePackageBinsExecutable(
  packageDir: string,
  packageName: string,
): void {
  if (WIN32) {
    // Windows doesn't need chmod
    return
  }

  const fs = getFs()
  const path = getPath()
  const installedDir = normalizePath(
    path.join(packageDir, 'node_modules', packageName),
  )
  const pkgJsonPath = path.join(installedDir, 'package.json')

  try {
    const pkgJson = readJsonSync(pkgJsonPath) as Record<string, unknown>
    const bin = pkgJson['bin']

    if (!bin) {
      return
    }

    const binPaths: string[] = []

    if (typeof bin === 'string') {
      // Single binary
      binPaths.push(bin)
    } else if (typeof bin === 'object' && bin !== null) {
      // Multiple binaries
      const binObj = bin as Record<string, string>
      binPaths.push(...ObjectValues(binObj))
    }

    // Make all binaries executable
    for (const binPath of binPaths) {
      const fullPath = normalizePath(path.join(installedDir, binPath))
      if (fs.existsSync(fullPath)) {
        try {
          fs.chmodSync(fullPath, 0o755)
        } catch {
          // Ignore chmod errors on individual binaries
        }
      }
    }
  } catch {
    // Ignore errors reading package.json or making binaries executable
    // This is non-critical functionality
  }
}

/**
 * Build a PURL string for an npm package.
 * Follows the PURL spec for the npm type:
 *   - Scoped: `@scope/pkg` → `pkg:npm/%40scope/pkg@version`
 *   - Unscoped: `pkg` → `pkg:npm/pkg@version`
 *
 */
export function npmPurl(name: string, version: string): string {
  const encoded = StringPrototypeStartsWith(name, '@')
    ? `%40${StringPrototypeSlice(name, 1)}`
    : name
  // PURL spec: '+' in version must be encoded as %2B
  const encodedVersion = StringPrototypeReplace(version, /\+/g, '%2B')
  return `pkg:npm/${encoded}@${encodedVersion}`
}

/**
 * Parse package spec into name and version using npm-package-arg.
 * Examples:
 * - 'lodash@4.17.21' → { name: 'lodash', version: '4.17.21' }
 * - '@scope/pkg@1.0.0' → { name: '@scope/pkg', version: '1.0.0' }
 * - 'lodash' → { name: 'lodash', version: undefined }
 *
 * @example
 * ```typescript
 * parsePackageSpec('lodash@4.17.21')
 * // { name: 'lodash', version: '4.17.21' }
 *
 * parsePackageSpec('@scope/pkg')
 * // { name: '@scope/pkg', version: undefined }
 * ```
 */
export function parsePackageSpec(spec: string): {
  name: string
  version: string | undefined
} {
  try {
    // npmPackageArg is imported at the top
    /* c8 ignore next - External npm-package-arg call */
    const parsed = npmPackageArg(spec)

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
    const atIndex = StringPrototypeLastIndexOf(spec, '@')
    if (atIndex === -1 || atIndex === 0) {
      // No version or scoped package without version (@ only at position 0).
      return { name: spec, version: undefined }
    }
    const sliced = StringPrototypeSlice(spec, atIndex + 1)
    return {
      name: StringPrototypeSlice(spec, 0, atIndex),
      // A trailing `@` (e.g. `'pkg@'`) yields an empty slice — normalize
      // to undefined so downstream "no version" checks behave.
      version: sliced || undefined,
    }
  }
}

/**
 * Resolve binary path with cross-platform wrapper support.
 * On Windows, checks for .cmd, .bat, .ps1, .exe wrappers in order.
 * On Unix, uses path directly.
 *
 * Aligns with npm/npx binary resolution strategy.
 *
 * @example
 * ```typescript
 * const resolved = resolveBinaryPath('/tmp/.socket/_dlx/a1b2c3d4/prettier')
 * // On Windows: may resolve to '.cmd' or '.ps1' wrapper
 * // On Unix: returns the path unchanged
 * ```
 */
export function resolveBinaryPath(basePath: string): string {
  if (!WIN32) {
    // Unix: use path directly
    return basePath
  }

  const fs = getFs()

  // Check cache first - validate with existsSync.
  const cached = binaryPathCache.get(basePath)
  if (cached) {
    if (fs.existsSync(cached)) {
      // Bump recency on hit.
      binaryPathCacheSet(basePath, cached)
      return cached
    }
    // Cached path no longer exists, remove stale entry.
    binaryPathCache.delete(basePath)
  }

  // Windows: check for wrappers in priority order
  // Order matches npm bin-links creation: .cmd, .ps1, .exe, then bare
  const extensions = ['.cmd', '.bat', '.ps1', '.exe', '']

  for (const ext of extensions) {
    const testPath = basePath + ext
    if (fs.existsSync(testPath)) {
      // Cache the result.
      binaryPathCacheSet(basePath, testPath)
      return testPath
    }
  }

  // Fallback to original path if no wrapper found
  return basePath
}
