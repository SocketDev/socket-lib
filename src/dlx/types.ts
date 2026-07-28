/**
 * @file Public option / result interfaces for dlx package operations. Split out
 *   of `dlx/package.ts` so consumers can import these types without pulling in
 *   the implementation.
 *
 *   - `DownloadNpmPackageResult` — what `downloadNpmPackage` returns
 *   - `EnsurePackageInstallOptions` — shared install-pinning options
 *   - `DlxPackageOptions` — full options for `dlxPackage` / `downloadNpmPackage`
 *   - `DlxPackageResult` — what `dlxPackage` returns
 */

import type { HashSpec } from '../integrity'
import type { LockfileSpec } from './lockfile'
import type { spawn } from '../process/spawn/child'
import type { SpawnOptions } from '../process/spawn/types'

export interface DownloadNpmPackageResult {
  /**
   * Path to the binary.
   */
  binaryPath: string
  /**
   * Whether the package was newly installed.
   */
  installed: boolean
  /**
   * Path to the installed package directory.
   */
  packageDir: string
}

/**
 * Shared install-pinning options used by both {@link DlxPackageOptions} and the
 * lower-level `ensurePackageInstalled`.
 */
export interface EnsurePackageInstallOptions {
  /**
   * Expected hash of the top-level package tarball. Accepts either: - A bare
   * sha512 SRI string (sniffed as integrity). - A bare sha256 hex string
   * (sniffed as checksum). - An explicit `{ type: 'integrity' | 'checksum',
   * value }` object.
   */
  hash?: HashSpec | undefined

  /**
   * Override the install root passed to Arborist. By default, the install root
   * is `~/.socket/_dlx/<cacheKey>/` (or `SOCKET_DLX_DIR/<cacheKey>/`) — keyed
   * by spec so multiple specs share a parent dir without colliding. When
   * `installRoot` is set, the install root is the value verbatim — no cacheKey
   * subdirectory.
   *
   * In both cases the package itself lands at
   * `<installRoot>/node_modules/<packageName>/` with transitive deps as
   * siblings under the same `node_modules/` directory. That layout is a fixed
   * property of Arborist; this option only controls the parent.
   *
   * That means **the caller is responsible for keeping per-spec installs
   * separated** — calling twice with the same `installRoot` but different specs
   * (e.g. `ink@7` and `ink@8`) overwrites the earlier install. Either pass a
   * different `installRoot` per spec or pass `force: true` to accept the
   * overwrite.
   *
   * Pass a sentinel name (e.g. `_dlx`, `_pkg`, `vendor`) — never one that ends
   * in `node_modules`, since that turns the install root into something
   * parent-walking resolvers, IDE indexers, and pnpm hoisting will mistake for
   * a workspace `node_modules/`.
   *
   * Use cases:
   *
   * - Build pipelines that want the install gitignored alongside their own
   *   outputs and walkable by tools that resolve through `node_modules` (e.g.
   *   esbuild's `nodePaths`).
   * - Tests that need a deterministic, easily-cleaned install path.
   */
  installRoot?: string | undefined

  /**
   * Vendored `package-lock.json` to drive a reproducible install. Accepts a
   * filesystem path (sniffed) or raw JSON content (sniffed via leading `{`), or
   * an explicit `{ type: 'path' | 'content', value }` object.
   *
   * When provided, the lockfile is written into the install dir before Arborist
   * runs and a hardened `.npmrc` is placed alongside it.
   */
  lockfile?: LockfileSpec | undefined
}

export interface DlxPackageOptions extends EnsurePackageInstallOptions {
  /**
   * Binary name to execute (optional - auto-detected in most cases).
   *
   * Auto-detection logic: 1. If the package has only one binary, uses it
   * automatically 2. Tries user-provided binaryName 3. Tries last segment of
   * the package name (e.g., 'cli' from '@socketsecurity/cli') 4. Falls back to
   * first binary.
   *
   * Only needed when the package has multiple binaries and auto-detection
   * fails.
   *
   * @example
   *   // Auto-detected (single binary)
   *   { spec: '@socketsecurity/cli' }  // Finds 'socket' binary automatically
   *
   *   // Explicit (multiple binaries)
   *   { spec: 'some-tool', binaryName: 'specific-tool' }
   */
  binaryName?: string | undefined

  /**
   * Force reinstallation even if the package exists. Aligns with npx --yes/-y
   * flag behavior.
   */
  force?: boolean | undefined

  /**
   * Suppress output (quiet mode). Aligns with npx --quiet/-q and pnpm
   * --silent/-s flags.
   */
  quiet?: boolean | undefined

  /**
   * Additional spawn options for the execution.
   */
  spawnOptions?: SpawnOptions | undefined

  /**
   * Package spec to install (e.g., '@cyclonedx/cdxgen@10.0.0'). Aligns with npx
   * --package flag. Named `spec` to match `downloadPipPackage({ spec })`.
   */
  spec: string

  /**
   * Skip confirmation prompts (auto-approve). Aligns with npx --yes/-y flag.
   */
  yes?: boolean | undefined
}

export interface DlxPackageResult {
  /**
   * Path to the binary that was executed.
   */
  binaryPath: string
  /**
   * Whether the package was newly installed.
   */
  installed: boolean
  /**
   * Path to the installed package directory.
   */
  packageDir: string
  /**
   * The spawn promise for the running process.
   */
  spawnPromise: ReturnType<typeof spawn>
}
