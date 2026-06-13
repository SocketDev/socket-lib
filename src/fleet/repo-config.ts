/**
 * @file Resolve a fleet config that a repo may override. The fleet cascades a
 *   default to `.config/fleet/<name>.json`; a repo may shadow or extend it with
 *   `.config/repo/<name>.json`. Hooks, lint rules, and build config all need
 *   the same "read both tiers" step but apply DIFFERENT merge policies (a
 *   denylist unions both tiers; an allowlist takes the repo's when present else
 *   the fleet's; array tiers concatenate). So this returns BOTH parsed tiers
 *   and lets the caller compose — the shared part is the path convention + the
 *   safe read, not one fixed merge. A small array-concat helper covers the
 *   common case. Lives in the published lib because it is the only import root
 *   both the `.git-hooks/_shared` and `.claude/hooks/_shared` trees (which do
 *   not cross-import) plus `.config/*` can all reach.
 */

import { readJsonSync } from '../fs/read-json'
import { findGitRoot } from '../git/repo'
import { processCwd } from '../primordials/process'

import { getNodePath } from '../node/path'

/**
 * Concatenate one array-valued key across both tiers — the common merge for a
 * list that a repo EXTENDS rather than replaces (e.g. extra exclude globs).
 * Fleet entries come first, then repo entries; non-array tiers contribute
 * nothing.
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
  const out: unknown[] = []
  const fleetVal = tiers.fleet?.[key]
  if (Array.isArray(fleetVal)) {
    out.push(...fleetVal)
  }
  const repoVal = tiers.repo?.[key]
  if (Array.isArray(repoVal)) {
    out.push(...repoVal)
  }
  return out as Array<T[K] extends Array<infer E> ? E : never>
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
  // discovered from `cwd` (or `cwd` itself when not in a repo), so callers in a
  // subdirectory still find the repo-root config.
  repoRoot?: string | undefined
  // Starting directory for git-root discovery when `repoRoot` is not given.
  // Defaults to the current working directory.
  cwd?: string | undefined
}

/**
 * Read the fleet + repo tiers of a `.config` entry by base name.
 *
 * Reads `<repoRoot>/.config/fleet/<name>.json` and
 * `<repoRoot>/.config/repo/<name>.json`. Each tier is `undefined` when its file
 * is absent or unparseable (never throws — config reads are best-effort). The
 * caller decides how to merge the two tiers.
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
  const path = getNodePath()
  const cwd = opts.cwd ?? processCwd()
  const repoRoot = opts.repoRoot ?? findGitRoot(cwd)
  const fleet = readJsonSync(
    path.join(repoRoot, '.config', 'fleet', `${name}.json`),
    { throws: false },
  ) as T | undefined
  const repo = readJsonSync(
    path.join(repoRoot, '.config', 'repo', `${name}.json`),
    { throws: false },
  ) as T | undefined
  return { fleet, repo }
}
