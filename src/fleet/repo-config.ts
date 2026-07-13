/**
 * @file Fleet-convention config reader: a per-repo override (`.config/repo`)
 *   layered over the cascaded fleet default (`.config/fleet`). A thin wrapper
 *   over the generic `config/layers` reader that returns the named `{ fleet,
 *   repo }` shape Socket callers use, plus the `{ fleet, repo }` array-merge
 *   convenience. The generic, convention-agnostic primitives
 *   (`readConfigLayers`, `mergeConfigArray`) live in `config/layers`. Lives in
 *   the published lib because it is the only import root the
 *   `.git-hooks/_shared` and `.claude/hooks/_shared` trees (which do not
 *   cross-import) plus `.config/*` can all reach.
 */

import { mergeConfigArray, readConfigLayers } from '../config/layers'

// Fleet convention: the cascaded default lives in `.config/fleet`, a per-repo
// override in `.config/repo`. Lowest precedence first.
export const FLEET_LAYER_DIRS: readonly string[] = [
  '.config/fleet',
  '.config/repo',
]

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
 * Concatenate one array-valued key across the fleet + repo tiers. Fleet entries
 * first, then repo entries. Convenience over `mergeConfigArray` for the `{
 * fleet, repo }` shape.
 *
 * @param tiers - The `{ fleet, repo }` from `resolveRepoConfig`.
 * @param key - The array-valued property to concatenate.
 *
 * @returns Fleet entries followed by repo entries; `[]` when neither is an
 *   array.
 *
 * @unused No internal or Socket consumers.
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
