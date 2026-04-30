/**
 * @fileoverview Safe Arborist wrapper for dlx installs and lockfile-only
 * resolution.
 *
 * Every Arborist invocation in this module is configured with a fixed set
 * of security-hardening options mirroring socket-cli v1.1.79 SafeArborist:
 *
 *   - audit:         false   — no network call to the npm audit endpoint
 *   - fund:          false   — no collection/display of funding URLs
 *   - ignoreScripts: true    — no preinstall/install/postinstall scripts
 *   - progress:      false   — no progress bar on stdout
 *   - saveBundle:    false   — never update bundledDependencies
 *   - silent:        true    — suppress Arborist's default log output
 *
 * `save` varies by operation: {@link safeIdealTree} uses `save: true` so
 * Arborist writes `package-lock.json`; {@link safeReify} uses `save: false`
 * so the caller's `package.json` is never rewritten.
 *
 * A `.npmrc` with the equivalent settings is also written into the
 * install directory as a belt-and-suspenders defense for any downstream
 * tool that reads it.
 */

import Arborist from '../external/@npmcli/arborist'
import { getSocketCacacheDir } from '../paths/socket'

import { ErrorCtor, JSONParse, ObjectKeys } from '../primordials'

let _fs: typeof import('node:fs') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

let _path: typeof import('node:path') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Shared options for the safe-arborist operations below.
 */
export interface SafeArboristOptions {
  /**
   * Install directory. Arborist reads `package.json` (and, for reify,
   * `package-lock.json`) from this directory and creates `node_modules`
   * here when installing.
   *
   * Must already exist before calling. The caller is responsible for its
   * lifecycle (including cleanup of tmp directories).
   */
  path: string

  /**
   * Refuse to resolve any version published after this date. Passed to
   * Arborist (and pacote) as the `before` option. Matches npm's
   * `min-release-age` semantics once a caller converts days → Date.
   */
  before?: Date | undefined

  /**
   * Suppress Arborist's default log output.
   * @default true
   */
  quiet?: boolean | undefined
}

/**
 * Result of {@link safeIdealTree}.
 */
export interface SafeIdealTreeResult {
  /**
   * SRI integrity of the top-level resolved package as advertised by the
   * registry (sourced from Arborist's idealTree, not from a tarball).
   */
  integrity: string
  /** Resolved package name. */
  name: string
  /** Resolved package version. */
  version: string
  /** `package-lock.json` JSON content written by Arborist. */
  lockfile: string
}

/**
 * Options for {@link safeReify}.
 */
export interface SafeReifyOptions extends SafeArboristOptions {
  /**
   * When true, Arborist reifies against the existing `package-lock.json`
   * in `path` without rewriting it. When false, Arborist may update the
   * lockfile to match resolved dependencies.
   *
   * Pin-mode callers set this to true so committed lockfiles are the
   * authoritative resolution.
   *
   * @default true
   */
  packageLock?: boolean | undefined
}

/**
 * Fixed Arborist options that must not be overridden by callers.
 * Mirrors socket-cli v1.1.79's SafeArborist overrides:
 *   audit: false, fund: false, ignoreScripts: true, save: false,
 *   saveBundle: false, silent: true, progress: false
 */
function getBaseArboristOptions(installPath: string, quiet: boolean) {
  return {
    __proto__: null,
    path: installPath,
    cache: getSocketCacacheDir(),
    audit: false,
    fund: false,
    ignoreScripts: true,
    progress: false,
    save: false,
    saveBundle: false,
    silent: quiet,
  } as unknown as ConstructorParameters<typeof Arborist>[0]
}

/**
 * Read the single declared dependency from a package.json. We only
 * support one top-level dep per snapshot, which keeps the result
 * unambiguous (no "which of N deps did we pin?").
 */
function readSingleDependency(packageJsonPath: string): string {
  const fs = getFs()
  const raw = fs.readFileSync(packageJsonPath, 'utf8')
  const pkg = JSONParse(raw) as {
    dependencies?: Record<string, string>
  }
  const deps = pkg.dependencies ?? {}
  const names = ObjectKeys(deps)
  if (names.length !== 1) {
    throw new ErrorCtor(
      `safeIdealTree expects exactly one top-level dependency in ${packageJsonPath}, found ${names.length}`,
    )
  }
  return names[0]!
}

/**
 * Read the top-level package from an Arborist idealTree's inventory.
 * Arborist's `Inventory` extends `Map`, so iteration yields `[key, node]`
 * pairs — use `.values()` to get nodes directly.
 */
function readTopLevelFromIdealTree(
  tree: unknown,
  targetName: string,
): {
  name: string
  version: string
  integrity: string
} {
  type Node = {
    name?: string
    version?: string
    integrity?: string
    depth?: number
    isProjectRoot?: boolean
  }
  const root = tree as {
    inventory?: Map<string, Node> & { values(): IterableIterator<Node> }
  } | null
  const inventory = root?.inventory
  if (!inventory || typeof inventory.values !== 'function') {
    throw new ErrorCtor('Arborist idealTree missing inventory')
  }
  for (const node of inventory.values()) {
    if (node.isProjectRoot) {
      continue
    }
    if (node.name === targetName && node.depth === 1) {
      if (!node.version || !node.integrity) {
        throw new ErrorCtor(
          `Arborist idealTree node for ${targetName} missing version/integrity`,
        )
      }
      return {
        name: node.name,
        version: node.version,
        integrity: node.integrity,
      }
    }
  }
  throw new ErrorCtor(
    `Arborist idealTree inventory has no top-level node for ${targetName}`,
  )
}

/**
 * Run Arborist in `packageLockOnly` mode against a directory that already
 * contains a `package.json` with a single dependency. Resolves the graph
 * against the registry and writes `package-lock.json` into `path`, but
 * does NOT install into `node_modules`.
 *
 * Used by snapshot/bootstrap flows to obtain a lockfile + top-level
 * integrity without paying for a full install.
 *
 * Uses `save: true` (rather than our usual `save: false`) so Arborist
 * actually writes the lockfile — without that flag, `reify()` in
 * `packageLockOnly` mode with no `add` list skips the write.
 */
export async function safeIdealTree(
  options: SafeArboristOptions,
): Promise<SafeIdealTreeResult> {
  const fs = getFs()
  const path = getPath()
  const { before, path: installPath, quiet = true } = options
  const targetName = readSingleDependency(
    path.join(installPath, 'package.json'),
  )
  const arb = new Arborist({
    ...(getBaseArboristOptions(installPath, quiet) as object),
    ...(before !== undefined ? { before } : {}),
    packageLockOnly: true,
    save: true,
  } as unknown as ConstructorParameters<typeof Arborist>[0])
  /* c8 ignore next - External Arborist call */
  const tree = await arb.buildIdealTree()
  /* c8 ignore next - External Arborist call */
  await arb.reify()
  const top = readTopLevelFromIdealTree(tree, targetName)
  const lockfile = await fs.promises.readFile(
    path.join(installPath, 'package-lock.json'),
    'utf8',
  )
  return { ...top, lockfile }
}

/**
 * Install into `node_modules` using Arborist's reify operation. Honors
 * the committed `package-lock.json` in `path` when `packageLock: true`.
 *
 * Does not fetch registry metadata for versions already pinned by the
 * lockfile — arborist uses the lockfile's `integrity` strings to fetch
 * tarballs by ssri. This is the strongest form of pinning pnpm/npm
 * offer.
 */
export async function safeReify(options: SafeReifyOptions): Promise<void> {
  const { packageLock = true, path: installPath, quiet = true } = options
  const arb = new Arborist({
    ...(getBaseArboristOptions(installPath, quiet) as object),
    packageLock,
  } as unknown as ConstructorParameters<typeof Arborist>[0])
  /* c8 ignore next - External Arborist call */
  await arb.reify()
}

/**
 * Options for {@link writeSafeNpmrc}. Optional release-age hints are
 * echoed into the generated `.npmrc` as defense-in-depth for any
 * downstream tool that shells out to npm/pnpm in the directory.
 */
export interface WriteSafeNpmrcOptions {
  /** npm `min-release-age` (days). Mutually exclusive with minReleaseMins. */
  minReleaseDays?: number | undefined
  /** pnpm `minimumReleaseAge` (minutes). Mutually exclusive with minReleaseDays. */
  minReleaseMins?: number | undefined
}

/**
 * Write a hardened `.npmrc` into `path`. Used by both preview and pin
 * flows as a second layer of protection alongside the Arborist options.
 *
 * Content written (always):
 *   ignore-scripts=true
 *   audit=false
 *   fund=false
 *   save=false
 *   save-bundle=false
 *   progress=false
 *
 * When {@link WriteSafeNpmrcOptions.minReleaseDays} is set, also writes:
 *   min-release-age=<days>
 *
 * When {@link WriteSafeNpmrcOptions.minReleaseMins} is set, also writes
 * the pnpm-style equivalent:
 *   minimum-release-age=<minutes>
 */
export async function writeSafeNpmrc(
  installPath: string,
  options?: WriteSafeNpmrcOptions | undefined,
): Promise<void> {
  const fs = getFs()
  const path = getPath()
  const { minReleaseDays, minReleaseMins } = {
    __proto__: null,
    ...options,
  } as WriteSafeNpmrcOptions
  if (minReleaseDays !== undefined && minReleaseMins !== undefined) {
    throw new ErrorCtor(
      'writeSafeNpmrc: minReleaseDays and minReleaseMins are mutually exclusive',
    )
  }
  const lines = [
    'ignore-scripts=true',
    'audit=false',
    'fund=false',
    'save=false',
    'save-bundle=false',
    'progress=false',
  ]
  if (minReleaseDays !== undefined) {
    lines.push(`min-release-age=${minReleaseDays}`)
  }
  if (minReleaseMins !== undefined) {
    lines.push(`minimum-release-age=${minReleaseMins}`)
  }
  await fs.promises.writeFile(
    path.join(installPath, '.npmrc'),
    lines.join('\n') + '\n',
    'utf8',
  )
}
