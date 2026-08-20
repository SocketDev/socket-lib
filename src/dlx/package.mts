/**
 * @file DLX package execution — install and execute npm packages. This module
 *   provides functionality to install and execute npm packages in the
 *   ~/.socket/_dlx directory, similar to npx but with Socket's own cache. Uses
 *   content-addressed storage like npm's _npx:
 *
 *   - Hash is generated from package spec (name@version)
 *   - Each unique spec gets its own directory: ~/.socket/_dlx/<hash>/
 *   - Allows caching multiple versions of the same package Concurrency
 *     protection:
 *   - Uses process-lock to prevent concurrent installation corruption
 *   - Lock file created at ~/.socket/_dlx/<hash>/concurrency.lock
 *   - Uses npm npx's concurrency.lock naming convention (5s stale, 2s touching)
 *   - Prevents multiple processes from corrupting the same package installation
 *     Version range handling:
 *   - Exact versions (1.0.0) use cache if available
 *   - Range versions (^1.0.0, ~1.0.0) auto-force to get latest within range
 *   - User can override with explicit force: false Key difference from
 *     dlx/binary.ts:
 *   - dlx/binary.ts: Downloads standalone binaries from URLs
 *   - dlx/package.ts: Installs npm packages from registries Implementation:
 *   - Uses Arborist for package installation (like npx, no npm CLI required)
 *   - Split into downloadNpmPackage() and executePackage() for flexibility
 *   - dlxPackage() combines both for convenience Module shape: this file holds
 *     the three async orchestrators (`dlxPackage`, `downloadNpmPackage`,
 *     `ensurePackageInstalled`) and the synchronous `executePackage`. The
 *     supporting surface lives in sibling leaves and is re-exported here so
 *     existing `dlx/package` importers keep working unchanged:
 *   - types — `./types`
 *   - PURL + firewall — `./firewall`
 *   - spec parsing — `./spec`
 *   - binary resolution — `./binary-resolution`
 *   - lazy `node:fs` / `node:path` + LRU cache — `./shared`
 */

import { isWin32 } from '../constants/platform.mjs'
import {
  equalHashes,
  HashMismatchError,
  parseHash,
} from '../crypto/integrity.mjs'
import { isError } from '../errors/predicates.mjs'
import Arborist from '../external/@npmcli/arborist.js'
import { safeMkdir } from '../fs/safe.mjs'
import { normalizePath } from '../paths/normalize.mjs'
import { getSocketCacacheDir, getSocketDlxDir } from '../paths/socket.mjs'
import { processLock } from '../process/lock-instance.mjs'
import { spawn } from '../process/spawn/child.mjs'
import { readTopLevelFromIdealTree } from './arborist.mjs'
import { generateCacheKey } from './cache.mjs'

import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import {
  findBinaryPath,
  makePackageBinsExecutable,
} from './binary-resolution.mjs'
import { checkFirewallPurls } from './firewall.mjs'
import { parsePackageSpec } from './spec.mjs'

import type {
  DlxPackageOptions,
  DlxPackageResult,
  DownloadNpmPackageResult,
  EnsurePackageInstallOptions,
} from './types.mjs'
import type { SpawnExtra, SpawnOptions } from '../process/spawn/types.mjs'

import { ErrorCtor } from '../primordials/error.mjs'

import { RegExpPrototypeTest } from '../primordials/regexp.mjs'

/**
 * Regex to check if a version string contains range operators. Matches any
 * version with range operators: ~, ^, >, <, =, x, X, *, spaces, or ||.
 */
const rangeOperatorsRegExp = /[~^><=xX* ]|\|\|/

/**
 * Execute a package via DLX - install if needed and run its binary.
 *
 * This is the Socket equivalent of npx/pnpm dlx/yarn dlx, but using our own
 * cache directory (~/.socket/_dlx) and installation logic.
 *
 * Auto-forces reinstall for version ranges to get latest within range.
 *
 * @example
 *   ;```typescript
 *   // Download and execute cdxgen
 *   const result = await dlxPackage(['--version'], {
 *     spec: '@cyclonedx/cdxgen@10.0.0',
 *   })
 *   await result.spawnPromise
 *   ```
 */
export async function dlxPackage(
  args: readonly string[] | string[],
  options: DlxPackageOptions,
  spawnExtra?: SpawnExtra | undefined,
): Promise<DlxPackageResult> {
  // Download the package.
  options = { __proto__: null, ...options } as typeof options
  const downloadResult = await downloadNpmPackage(options)

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
 * Download and install a package without executing it. This is useful for
 * self-update or when you need the package files but don't want to run the
 * binary immediately.
 *
 * @example
 *   ;```typescript
 *   // Install @socketsecurity/cli without running it
 *   const result = await downloadNpmPackage({
 *     spec: '@socketsecurity/cli@1.2.0',
 *     force: true,
 *   })
 *   console.log('Installed to:', result.packageDir)
 *   console.log('Binary at:', result.binaryPath)
 *   ```
 */
export async function downloadNpmPackage(
  options: DlxPackageOptions,
): Promise<DownloadNpmPackageResult> {
  const {
    binaryName,
    force: userForce,
    hash,
    installRoot,
    lockfile,
    spec: packageSpec,
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
    { force, install: { hash, installRoot, lockfile } },
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
 * Install package to ~/.socket/_dlx/<hash>/ if not already installed. Uses
 * pacote for installation (no npm CLI required). Protected by process lock to
 * prevent concurrent installation corruption.
 *
 * @example
 *   ```typescript
 *   const { installed, packageDir } = await ensurePackageInstalled(
 *   'prettier',
 *   'prettier@3.0.0',
 *   { force: false },
 *   )
 *   console.log(`Installed: ${installed}, dir: ${packageDir}`)
 *   ```
 */
export async function ensurePackageInstalled(
  packageName: string,
  packageSpec: string,
  options?:
    | {
        force?: boolean | undefined
        install?: EnsurePackageInstallOptions | undefined
      }
    | undefined,
): Promise<{ installed: boolean; packageDir: string }> {
  const { force, install } = { __proto__: null, ...options } as {
    force: boolean | undefined
    install: EnsurePackageInstallOptions | undefined
  }
  const fs = getNodeFs()
  const path = getNodePath()
  // installRoot bypasses the cache layout entirely: the caller picks the
  // exact directory Arborist installs under, no cacheKey appended. They
  // own per-spec separation. Default keeps the historical content-addressed
  // <dlxDir>/<cacheKey>/ layout for collision-free parallel specs.
  const packageDir = normalizePath(
    install?.installRoot ??
      path.join(getSocketDlxDir(), generateCacheKey(packageSpec)),
  )
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
      // Double-check if already installed, unless force is set.
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
      // Sniff: explicit { type, value } wins; bare string whose first
      // non-whitespace character is `{` is JSON content, else a filesystem
      // path.
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

      // Install package and dependencies using Arborist, the way npx does.
      // Split into buildIdealTree → firewall check → reify so we can
      // scan all resolved packages before downloading any tarballs.
      try {
        // Arborist is imported at the top
        // External Arborist constructor
        /* c8 ignore start */
        const arb = new Arborist({
          path: packageDir,
          // Use Socket's shared cacache directory (~/.socket/_cacache).
          /* c8 ignore stop */
          cache: getSocketCacacheDir(),
          // Skip devDependencies for a production-only install, like npx.
          omit: ['dev'],
          // Security: Skip install/preinstall/postinstall scripts to prevent arbitrary code execution.
          ignoreScripts: true,
          // Security: Enable binary links so dlx can run the package binary.
          binLinks: true,
          // Suppress funding messages; ephemeral dlx installs don't need them.
          fund: false,
          // Skip the audit; ephemeral dlx installs don't need it.
          audit: false,
          // Suppress output; ephemeral dlx installs don't need it.
          silent: true,
        })

        // Resolve dependency tree from registry metadata, no tarballs.
        /* c8 ignore next - External Arborist call */
        const idealTree = await arb.buildIdealTree({ add: [packageSpec] })

        // If the caller pinned a hash, verify it against the top-level
        // package's registry-declared integrity (sourced from the
        // idealTree, independently of anything this code path computes)
        // before spending a firewall check or a tarball download on the
        // wrong package/version.
        if (install?.hash !== undefined) {
          const top = readTopLevelFromIdealTree(idealTree, packageName)
          if (!equalHashes(install.hash, top.integrity)) {
            throw new HashMismatchError(
              parseHash(install.hash),
              parseHash(top.integrity),
            )
          }
        }

        // Check resolved packages against Socket Firewall API (public).
        /* c8 ignore next - External API call */
        await checkFirewallPurls(arb, packageName)

        // Download tarballs and install. Reuses the cached idealTree.
        // save: true creates package.json and package-lock.json at the root,
        // like npx.
        /* c8 ignore next - External Arborist call */
        await arb.reify({ save: true })
      } catch (e) {
        // Rethrow a hash-pin mismatch without wrapping — the caller asked
        // to pin an exact package and needs to see that specifically, not
        // a generic install failure.
        if (e instanceof HashMismatchError) {
          throw e
        }
        // Rethrow firewall block errors without wrapping.
        if (isError(e) && e.message.startsWith('Socket Firewall blocked')) {
          throw e
        }
        const code = (e as { code?: string | undefined } | null)?.code
        if (code === 'E404' || code === 'ETARGET') {
          throw new ErrorCtor(
            `Package not found: ${packageSpec}\n` +
              'Verify the package exists on npm registry and check the version.\n' +
              `Visit https://www.npmjs.com/package/${packageName} to see available versions.`,
            { cause: e },
          )
        }
        if (
          code === 'EAI_AGAIN' ||
          code === 'ENOTFOUND' ||
          code === 'ETIMEDOUT'
        ) {
          throw new ErrorCtor(
            `Network error installing ${packageSpec}\n` +
              'Check your internet connection and try again.',
            { cause: e },
          )
        }
        throw new ErrorCtor(
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
 * Execute a package's binary with cross-platform shell handling. The package
 * must already be installed (use downloadNpmPackage first).
 *
 * On Windows, script files (.bat, .cmd, .ps1) require shell: true. Matches
 * npm/npx execution behavior.
 *
 * @example
 *   ;```typescript
 *   // Execute an already-installed package
 *   const downloaded = await downloadNpmPackage({ spec: 'cowsay@1.5.0' })
 *   const result = await executePackage(
 *     downloaded.binaryPath,
 *     ['Hello World'],
 *     { stdio: 'inherit' },
 *   )
 *   ```
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
  const needsShell = isWin32() && /\.(?:bat|cmd|ps1)$/i.test(binaryPath)

  const finalOptions = needsShell
    ? {
        ...spawnOptions,
        // oxlint-disable-next-line socket/prefer-shell-win32 -- already gated by `needsShell` (isWin32() && .bat/.cmd/.ps1), so this branch only runs on Windows for a script extension; shell: true is the intended cmd.exe wrap.
        shell: true,
      }
    : spawnOptions

  return spawn(binaryPath, args, finalOptions, spawnExtra)
}

// Re-exports — preserve the historical `dlx/package` surface so
// downstream importers don't have to chase the split. The lazy
// `node:fs` / `node:path` loaders were removed: use the canonical
// `getNodeFs` / `getNodePath` from `@socketsecurity/lib/node/{fs,path}`
// instead.
export { binaryPathCacheSet } from './shared.mjs'
export {
  findBinaryPath,
  makePackageBinsExecutable,
  resolveBinaryPath,
} from './binary-resolution.mjs'
export { checkFirewallPurls, npmPurl } from './firewall.mjs'
export { parsePackageSpec } from './spec.mjs'
export type {
  DlxPackageOptions,
  DlxPackageResult,
  DownloadNpmPackageResult,
  EnsurePackageInstallOptions,
} from './types.mjs'
