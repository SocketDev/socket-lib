/**
 * @file Read a layered config — a base config that higher layers may override
 *   or extend. Generic over the layer directories, the base name, and the file
 *   extension: `readConfigLayers('vitest', { dirs: ['.config/fleet',
 *   '.config/repo'] })` reads each `<dir>/vitest.json` in precedence order and
 *   returns the layers that exist. Callers apply their own merge, because merge
 *   policy varies (a denylist unions all layers; an allowlist takes the highest
 *   layer that declares one; an array key concatenates). `mergeConfigArray`
 *   covers the concat case across any number of layers. `resolveRepoConfig` is
 *   a thin fleet-convention wrapper (fleet default + repo override) over the
 *   generic reader. Lives in the published lib because it is the only import
 *   root the `.git-hooks/_shared` and `.claude/hooks/_shared` trees (which do
 *   not cross-import) plus `.config/*` can all reach.
 */

import { readJsonSync } from '../fs/read-json'
import { findGitRoot } from '../git/repo'
import { processCwd } from '../primordials/process'

import { getNodePath } from '../node/path'

// Fleet convention: the cascaded default lives in `.config/fleet`, a per-repo
// override in `.config/repo`. Lowest precedence first.
const FLEET_LAYER_DIRS: readonly string[] = ['.config/fleet', '.config/repo']

export interface ReadConfigLayersOptions {
  // Layer directories, LOWEST precedence first. Each is joined to `rootDir` (or
  // used as-is when absolute). A `<dir>/<name><ext>` that is absent or
  // unparseable contributes no layer.
  dirs: readonly string[]
  // Directory relative layer dirs resolve against. Defaults to the git root
  // discovered from `cwd` (or `cwd` when not in a repo), so a caller in a
  // subdirectory still finds root-level config.
  rootDir?: string | undefined
  // Starting directory for git-root discovery when `rootDir` is not given.
  // Defaults to the current working directory.
  cwd?: string | undefined
  // File extension including the dot. Defaults to `.json`.
  ext?: string | undefined
}

export interface RepoConfigTiers<T> {
  // The cascaded fleet default from `.config/fleet/<name>.json`, or undefined
  // when the file is absent or unparseable.
  fleet: T | undefined
  // The per-repo override from `.config/repo/<name>.json`, or undefined when
  // absent or unparseable.
  repo: T | undefined
}

export interface ResolveRepoConfigOptions {
  // Directory the `.config/*` paths resolve against. Defaults to the git root
  // discovered from `cwd` (or `cwd` itself when not in a repo).
  repoRoot?: string | undefined
  // Starting directory for git-root discovery when `repoRoot` is not given.
  // Defaults to the current working directory.
  cwd?: string | undefined
}

/**
 * Concatenate one array-valued key across all layers — the common merge for a
 * list that higher layers EXTEND rather than replace (e.g. extra exclude
 * globs). Layers contribute in precedence order; a non-array value for the key
 * (or a missing key, or an `undefined` layer) contributes nothing.
 *
 * @param layers - The layers from `readConfigLayers` (or any object array).
 * @param key - The array-valued property to concatenate.
 *
 * @returns Each layer's entries in order; `[]` when no layer has the array.
 */
export function mergeConfigArray<
  T extends Record<string, unknown>,
  K extends keyof T,
>(
  layers: ReadonlyArray<T | undefined>,
  key: K,
): Array<T[K] extends Array<infer E> ? E : never> {
  const out: unknown[] = []
  for (let i = 0, { length } = layers; i < length; i += 1) {
    const value = layers[i]?.[key]
    if (Array.isArray(value)) {
      out.push(...value)
    }
  }
  return out as Array<T[K] extends Array<infer E> ? E : never>
}

/**
 * Concatenate one array-valued key across the fleet + repo tiers. Fleet entries
 * first, then repo entries. Convenience over `mergeConfigArray` for the `{
 * fleet, repo }` shape.
 *
 * @param tiers - The `{ fleet, repo }` from `resolveRepoConfig`.
 * @param key - The array-valued property to concatenate.
 *
 * @returns Fleet entries followed by repo entries; `[]` when neither is an
 *   array.
 */
export function mergeRepoConfigArray<
  T extends Record<string, unknown>,
  K extends keyof T,
>(
  tiers: RepoConfigTiers<T>,
  key: K,
): Array<T[K] extends Array<infer E> ? E : never> {
  return mergeConfigArray<T, K>([tiers.fleet, tiers.repo], key)
}

/**
 * Read a named config from an ordered list of layer directories.
 *
 * For each dir in `dirs`, reads `<rootDir>/<dir>/<name><ext>`; layers that are
 * absent or unparseable are skipped (never throws — config reads are
 * best-effort). The returned array preserves `dirs` order (lowest precedence
 * first), so the last element is the highest-precedence layer present.
 *
 * @example
 *   ;```typescript
 *   const layers = readConfigLayers<VitestConfig>('vitest', {
 *     dirs: ['.config/base', '.config/team', '.config/local'],
 *   })
 *   // layers === every one of those that existed, in that order
 *   ```
 *
 * @param name - Base name of the config file (no directory, no extension).
 * @param options - Layer dirs + resolution options.
 *
 * @returns Parsed layers in precedence order; empty when none exist.
 */
export function readConfigLayers<T = unknown>(
  name: string,
  options: ReadConfigLayersOptions,
): T[] {
  const opts = { __proto__: null, ...options } as ReadConfigLayersOptions
  const path = getNodePath()
  const cwd = opts.cwd ?? processCwd()
  const rootDir = opts.rootDir ?? findGitRoot(cwd)
  const ext = opts.ext ?? '.json'
  const file = `${name}${ext}`
  const layers: T[] = []
  const { dirs } = opts
  for (let i = 0, { length } = dirs; i < length; i += 1) {
    const value = readJsonSync(path.join(rootDir, dirs[i]!, file), {
      throws: false,
    }) as T | undefined
    if (value !== undefined) {
      layers.push(value)
    }
  }
  return layers
}

/**
 * Fleet-convention reader: a repo override (`.config/repo`) layered over the
 * cascaded fleet default (`.config/fleet`). A thin wrapper over
 * `readConfigLayers` that returns the named `{ fleet, repo }` shape callers
 * already use; either tier is `undefined` when absent or unparseable.
 *
 * @example
 *   ;```typescript
 *   const { fleet, repo } = resolveRepoConfig<VitestTiers>('vitest')
 *   const nonIsolated = [
 *     ...(fleet?.nonIsolated ?? []),
 *     ...(repo?.nonIsolated ?? []),
 *   ]
 *   ```
 *
 * @param name - Base name of the config file (no directory, no `.json`).
 * @param options - `repoRoot` / `cwd` for path resolution.
 *
 * @returns `{ fleet, repo }` parsed tiers; either may be `undefined`.
 */
export function resolveRepoConfig<T = unknown>(
  name: string,
  options?: ResolveRepoConfigOptions | undefined,
): RepoConfigTiers<T> {
  const opts = { __proto__: null, ...options } as ResolveRepoConfigOptions
  // Read each tier through a single-dir call so the position-to-name mapping
  // stays unambiguous when only one tier exists (readConfigLayers drops absent
  // layers, which would otherwise shift positions).
  const base = { cwd: opts.cwd, rootDir: opts.repoRoot }
  const [fleet] = readConfigLayers<T>(name, {
    ...base,
    dirs: [FLEET_LAYER_DIRS[0]!],
  })
  const [repo] = readConfigLayers<T>(name, {
    ...base,
    dirs: [FLEET_LAYER_DIRS[1]!],
  })
  return { fleet, repo }
}
