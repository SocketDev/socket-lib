/**
 * @file DLX binary execution utilities for Socket ecosystem. High-level entry
 *   points for downloading standalone URL-hosted binaries (not npm packages —
 *   see `./package` for those) and executing them with cross-platform shell
 *   handling.
 *
 *   - `dlxBinary` — download when needed + execute
 *   - `executeBinary` — execute an already-cached binary Supporting surface lives
 *     in sibling leaves and is re-exported here so existing `dlx/binary`
 *     importers keep working unchanged:
 *   - lazy `node:fs` / `node:path` / `node:crypto` + LRU cache — `./shared`
 *   - types — `./binary-types`
 *   - on-disk cache metadata — `./binary-cache`
 *   - download + integrity verification — `./binary-download`
 */

import { getArch, isWin32 } from '../constants/platform.mjs'
import { DLX_BINARY_CACHE_TTL } from '../constants/time.mjs'
import { readJson } from '../fs/read-json.mjs'
import { safeMkdir } from '../fs/safe.mjs'
import { normalizePath } from '../paths/normalize.mjs'
import { spawn } from '../process/spawn/child.mjs'
import { generateCacheKey } from './cache.mjs'

import { parseHash } from '../crypto/integrity.mjs'

import { ArrayIsArray } from '../primordials/array.mjs'

import { ErrorCtor } from '../primordials/error.mjs'

import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import {
  getBinaryCacheMetadataPath,
  getDlxCachePath,
  isBinaryCacheValid,
  writeBinaryCacheMetadata,
} from './binary-cache.mjs'
import { downloadBinaryFile, verifyCachedBinary } from './binary-download.mjs'

import type { DlxBinaryOptions, DlxBinaryResult } from './binary-types.mjs'
import type { SpawnExtra, SpawnOptions } from '../process/spawn/types.mjs'

/**
 * Download and execute a binary from a URL with caching.
 *
 * @example
 *   ;```typescript
 *   const result = await dlxBinary(['--version'], {
 *     url: 'https://example.com/tool-linux-x64',
 *     name: 'tool',
 *   })
 *   await result.spawnPromise
 *   ```
 */
export async function dlxBinary(
  args: readonly string[] | string[],
  options?: DlxBinaryOptions | undefined,
  spawnExtra?: SpawnExtra | undefined,
): Promise<DlxBinaryResult> {
  const {
    cacheTtl = DLX_BINARY_CACHE_TTL,
    createWriteStream,
    force: userForce = false,
    hash,
    integrity: rawIntegrity,
    name,
    sha256: rawSha256,
    spawnOptions,
    url,
    yes,
  } = { __proto__: null, ...options } as DlxBinaryOptions
  let integrity = rawIntegrity
  let sha256 = rawSha256
  if (hash !== undefined) {
    const parsed = parseHash(hash)
    if (parsed.algorithm === 'sha256') {
      sha256 = parsed.hex
    } else {
      integrity = parsed.sri
    }
  }
  const fs = getNodeFs()
  const path = getNodePath()
  // Map --yes flag to force behavior (auto-approve/skip prompts)
  const force = yes === true ? true : userForce
  // Generate cache paths similar to pnpm/npx structure.
  const cacheDir = getDlxCachePath()
  const nodeProcess = getNodeProcess()
  const binaryName = name || `binary-${nodeProcess.platform}-${getArch()}`
  // Create spec from URL and binary name for unique cache identity.
  const spec = `${url}:${binaryName}`
  const cacheKey = generateCacheKey(spec)
  const cacheEntryDir = path.join(cacheDir, cacheKey)
  const binaryPath = normalizePath(path.join(cacheEntryDir, binaryName))

  let downloaded = false
  let computedIntegrity = integrity

  // Check if we need to download.
  if (
    !force &&
    fs.existsSync(cacheEntryDir) &&
    (await isBinaryCacheValid(cacheEntryDir, cacheTtl))
  ) {
    // Binary is cached and valid, read the integrity from metadata.
    try {
      const metaPath = getBinaryCacheMetadataPath(cacheEntryDir)
      const metadata = await readJson(metaPath, { throws: false })
      if (
        metadata !== null &&
        typeof metadata === 'object' &&
        !ArrayIsArray(metadata) &&
        typeof (metadata as Record<string, unknown>)['integrity'] === 'string'
      ) {
        computedIntegrity = (metadata as Record<string, unknown>)[
          'integrity'
        ] as string
        // Re-check binary exists after reading metadata (TOCTOU protection).
        // Prevents race where binary is deleted between validity check and use.
        if (fs.existsSync(binaryPath)) {
          // A cache hit skips downloadBinaryFile, and with it the pin check that
          // function performs, so measure the on-disk bytes here. Otherwise a
          // pinned caller is protected only on the first fetch per machine.
          await verifyCachedBinary(binaryPath, { integrity, sha256 })
        } else {
          downloaded = true
        }
      } else {
        // If metadata is invalid, re-download.
        downloaded = true
      }
    } catch {
      // If we can't read metadata, re-download.
      downloaded = true
    }
  } else {
    downloaded = true
  }

  if (downloaded) {
    // Ensure cache directory exists before downloading.
    try {
      await safeMkdir(cacheEntryDir)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ErrorCtor(
          `Permission denied creating binary cache directory: ${cacheEntryDir}\n` +
            'Please check directory permissions or run with appropriate access.',
          { cause: e },
        )
      }
      if (code === 'EROFS') {
        throw new ErrorCtor(
          `Cannot create binary cache directory on read-only filesystem: ${cacheEntryDir}\n` +
            'Ensure the filesystem is writable or set SOCKET_DLX_DIR to a writable location.',
          { cause: e },
        )
      }
      throw new ErrorCtor(
        `Failed to create binary cache directory: ${cacheEntryDir}`,
        { cause: e },
      )
    }

    // Download the binary.
    computedIntegrity = await downloadBinaryFile(url, binaryPath, {
      createWriteStream,
      integrity,
      sha256,
    })

    // Get file size for metadata (intentional: need stats.size, not just existence).
    // oxlint-disable-next-line socket/prefer-exists-sync -- need stats.size
    const stats = await fs.promises.stat(binaryPath)
    await writeBinaryCacheMetadata(
      cacheEntryDir,
      cacheKey,
      url,
      computedIntegrity || '',
      stats.size,
    )
  }

  // Execute the binary.
  // On Windows, script files (.bat, .cmd, .ps1) require shell: true because
  // they are not executable on their own and must be run through cmd.exe.
  // Note: .exe files are actual binaries and don't need shell mode.
  const needsShell = isWin32() && /\.(?:bat|cmd|ps1)$/i.test(binaryPath)
  // Windows cmd.exe PATH resolution behavior:
  // When shell: true on Windows with .cmd/.bat/.ps1 files, spawn will automatically
  // strip the full path down to just the basename without extension. Windows cmd.exe
  // then searches for the binary in directories listed in PATH, trying each extension
  // from PATHEXT environment variable until it finds a match.
  //
  // Since our binaries are downloaded to a custom cache directory that's not in PATH
  // (unlike system package managers like npm/pnpm/yarn which are already in PATH),
  // we must prepend the cache directory to PATH so cmd.exe can locate the binary.
  const finalSpawnOptions = needsShell
    ? {
        ...spawnOptions,
        env: {
          ...spawnOptions?.env,
          PATH: `${cacheEntryDir}${path.delimiter}${nodeProcess.env['PATH'] || ''}`,
        },
        // oxlint-disable-next-line socket/prefer-shell-win32 -- already gated by `needsShell` (isWin32() && .bat/.cmd/.ps1), so this branch only runs on Windows for a script extension; shell: true is the intended cmd.exe wrap.
        shell: true,
      }
    : spawnOptions
  const spawnPromise = spawn(binaryPath, args, finalSpawnOptions, spawnExtra)

  return {
    binaryPath,
    downloaded,
    spawnPromise,
  }
}

/**
 * Execute a cached binary without re-downloading. Similar to executePackage
 * from dlx/package. Binary must have been previously downloaded via
 * downloadBinary or dlxBinary.
 *
 * @example
 *   ;```typescript
 *   const { binaryPath } = await downloadBinary({
 *     url: 'https://example.com/tool-linux-x64',
 *     name: 'tool',
 *   })
 *   const result = executeBinary(binaryPath, ['--help'])
 *   ```
 *
 * @param binaryPath Path to the cached binary (from downloadBinary result)
 * @param args Arguments to pass to the binary.
 * @param spawnOptions Spawn options for execution.
 * @param spawnExtra Extra spawn configuration.
 *
 * @returns The spawn promise for the running process
 */
export function executeBinary(
  binaryPath: string,
  args: readonly string[] | string[],
  spawnOptions?: SpawnOptions | undefined,
  spawnExtra?: SpawnExtra | undefined,
): ReturnType<typeof spawn> {
  // On Windows, script files (.bat, .cmd, .ps1) require shell: true because
  // they are not executable on their own and must be run through cmd.exe.
  // Note: .exe files are actual binaries and don't need shell mode.
  const needsShell = isWin32() && /\.(?:bat|cmd|ps1)$/i.test(binaryPath)

  // Windows: prepend cache dir to PATH so cmd.exe can locate the binary.
  const path = getNodePath()
  const cacheEntryDir = path.dirname(binaryPath)
  const nodeProcess = getNodeProcess()
  const finalSpawnOptions = needsShell
    ? {
        ...spawnOptions,
        env: {
          ...spawnOptions?.env,
          PATH: `${cacheEntryDir}${path.delimiter}${nodeProcess.env['PATH'] || ''}`,
        },
        // oxlint-disable-next-line socket/prefer-shell-win32 -- already gated by `needsShell` (isWin32() && .bat/.cmd/.ps1), so this branch only runs on Windows for a script extension; shell: true is the intended cmd.exe wrap.
        shell: true,
      }
    : spawnOptions

  return spawn(binaryPath, args, finalSpawnOptions, spawnExtra)
}

// Re-exports — preserve the historical `dlx/binary` surface so
// downstream importers don't have to chase the split. The lazy
// `node:fs` / `node:path` / `node:crypto` loaders were removed: use
// the canonical `getNodeFs` / `getNodePath` / `getNodeCrypto` from
// `@socketsecurity/lib/node/{fs,path,crypto}` instead.
export {
  cleanDlxCache,
  getBinaryCacheMetadataPath,
  getDlxCachePath,
  isBinaryCacheValid,
  listDlxCache,
  writeBinaryCacheMetadata,
} from './binary-cache.mjs'
export { downloadBinary, downloadBinaryFile } from './binary-download.mjs'
export type {
  DlxBinaryOptions,
  DlxBinaryResult,
  DlxMetadata,
} from './binary-types.mjs'
import { getNodeProcess } from '../node/process.mjs'
