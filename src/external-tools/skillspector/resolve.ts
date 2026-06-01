/**
 * @file `resolveSkillSpector()` — SkillSpector resolution entry point. Tries
 *   each source in order:
 *
 *   1. VFS — smol binary's embedded skillspector (if packed)
 *   2. PATH — `which skillspector` (pipx-installed binaries land here too;
 *      the source field distinguishes `'pipx'` vs `'path'`)
 *   3. DLX-venv — `~/.socket/_dlx/skillspector/<sha>/` with the pinned SHA
 *
 *   Returns `undefined` when all enabled sources miss. Memoized per
 *   sha+cacheDir+localOnly tuple.
 */

import { MapCtor } from '../../primordials/map-set'

import { skillspectorFromDlx } from './from-dlx'
import { skillspectorFromPath } from './from-path'
import { skillspectorFromVfs } from './from-vfs'

import type { ResolvedSkillSpector } from './types'

export interface ResolveSkillSpectorOptions {
  /**
   * Tier-3 install spec — the pinned upstream SHA. Required when
   * `localOnly` is unset (without a SHA, the DLX tier can't run).
   */
  readonly sha?: string | undefined
  /**
   * Tier-3 cache override. Defaults to
   * `~/.socket/_dlx/skillspector/<sha>`.
   */
  readonly cacheDir?: string | undefined
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

export function cacheKey(opts: ResolveSkillSpectorOptions): string {
  return `${opts.sha ?? ''}|${opts.cacheDir ?? ''}|${opts.localOnly ? 'local' : 'full'}`
}

export async function doResolveSkillSpector(
  opts: ResolveSkillSpectorOptions,
): Promise<ResolvedSkillSpector | undefined> {
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
  if (opts.localOnly || !opts.sha) {
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
