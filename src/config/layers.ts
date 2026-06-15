/**
 * @file Read a layered config — a base config that higher layers may override
 *   or extend. Generic over the layer directories, the base name, and the file
 *   extension: `readConfigLayers('vitest', { dirs: ['.config/base',
 *   '.config/local'] })` reads each `<dir>/vitest.json` in precedence order and
 *   returns the layers that exist. Callers apply their own merge, because merge
 *   policy varies (a denylist unions all layers; an allowlist takes the highest
 *   layer that declares one; an array key concatenates). `mergeConfigArray`
 *   covers the concat case across any number of layers. No fleet knowledge
 *   lives here — the fleet-convention `.config/fleet` + `.config/repo` wrapper
 *   is `fleet/repo-config`'s `resolveRepoConfig`, a thin layer over this
 *   reader.
 */

import { readJsonSync } from '../fs/read-json'
import { findGitRoot } from '../git/repo'
import { processCwd } from '../primordials/process'

import { getNodePath } from '../node/path'

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
