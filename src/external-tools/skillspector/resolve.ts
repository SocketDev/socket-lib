/**
 * @file `resolveSkillSpector()` — SkillSpector resolution entry point. Tries
 *   each source in order:
 *
 *   1. VFS — smol binary's embedded skillspector (if packed)
 *   2. PATH — `which skillspector` (pipx-installed binaries land here too; the
 *      source field distinguishes `'pipx'` vs `'path'`)
 *   3. UV-project — `uv sync --locked` against a uv project (the most locked-down
 *      tier; every transitive version pinned in uv.lock). Only runs when
 *      `uvProjectDir` + `uvBin` are supplied.
 *   4. DLX-venv — `~/.socket/_dlx/skillspector/<sha>/` with the pinned SHA (the
 *      pip-from-git-SHA fallback when no uv project is available). Returns
 *      `undefined` when all enabled sources miss. Memoized per
 *      sha+cacheDir+uvProjectDir+localOnly tuple.
 */

import { MapCtor } from '../../primordials/map-set'

import { skillspectorFromDlx } from './from-dlx'
import { skillspectorFromPath } from './from-path'
import { skillspectorFromUv } from './from-uv'
import { skillspectorFromVfs } from './from-vfs'

import type { ResolvedSkillSpector } from './types'

export interface ResolveSkillSpectorOptions {
  /**
   * Tier-3 install spec — the pinned upstream SHA. Required when `localOnly` is
   * unset (without a SHA, the DLX tier can't run).
   */
  readonly sha?: string | undefined
  /**
   * DLX cache override. Defaults to `~/.socket/_dlx/skillspector/<sha>`.
   */
  readonly cacheDir?: string | undefined
  /**
   * UV-project tier: absolute path to a uv project dir (a `pyproject.toml` +
   * `uv.lock` pinning the SHA + its closure). When set together with `uvBin`,
   * the locked-uv tier runs ahead of the DLX-venv tier.
   */
  readonly uvProjectDir?: string | undefined
  /**
   * UV-project tier: absolute path to the `uv` executable
   * (typically `resolveUv().path`). Required to run the locked-uv tier.
   */
  readonly uvBin?: string | undefined
  /**
   * When true, only the VFS + PATH tiers run. Use for check-mode invocations
   * that want to fail-fast if the tool isn't already installed.
   */
  readonly localOnly?: boolean | undefined
}

const resolutionCache = new MapCtor<
  string,
  Promise<ResolvedSkillSpector | undefined>
>()

export function cacheKey(options: ResolveSkillSpectorOptions): string {
  const opts = { __proto__: null, ...options } as typeof options
  return `${opts.sha ?? ''}|${opts.cacheDir ?? ''}|${opts.uvProjectDir ?? ''}|${opts.localOnly ? 'local' : 'full'}`
}

export async function doResolveSkillSpector(
  options: ResolveSkillSpectorOptions,
): Promise<ResolvedSkillSpector | undefined> {
  const opts = { __proto__: null, ...options } as typeof options
  const fromVfs = await skillspectorFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await skillspectorFromPath()
  if (fromPath) {
    return fromPath
  }
  // localOnly stops after the already-installed tiers (VFS + PATH) — no install.
  if (opts.localOnly) {
    return undefined
  }
  // UV-project tier (preferred): the locked closure, when a project + uv exist.
  if (opts.uvProjectDir && opts.uvBin) {
    const fromUv = await skillspectorFromUv({
      projectDir: opts.uvProjectDir,
      uvBin: opts.uvBin,
    })
    if (fromUv) {
      return fromUv
    }
  }
  // DLX-venv fallback: pip-from-git-SHA when no uv project is available.
  if (!opts.sha) {
    return undefined
  }
  return skillspectorFromDlx({ sha: opts.sha, cacheDir: opts.cacheDir })
}

/**
 * Memoizing wrapper around {@link doResolveSkillSpector}.
 */
export async function resolveSkillSpector(
  opts: ResolveSkillSpectorOptions = {},
): Promise<ResolvedSkillSpector | undefined> {
  const key = cacheKey(opts)
  const existing = resolutionCache.get(key)
  if (existing) {
    return existing
  }
  const promise = doResolveSkillSpector(opts)
  resolutionCache.set(key, promise)
  return promise
}
