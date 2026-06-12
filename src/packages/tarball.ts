/**
 * @file Package tarball operations: extract a package to a directory and pack a
 *   spec into a tarball, both via pacote/libnpmpack with the shared packument
 *   cache.
 */

import { getPackumentCache, getPacoteCachePath } from '../constants/packages'
import cacache from '../external/cacache'
import libnpmpack from '../external/libnpmpack'
import pacote from '../external/pacote'
import { normalizePath } from '../paths/normalize'
import { getAbortSignal } from '../process/abort'

import type { ExtractOptions, PacoteOptions } from './types'

const abortSignal = getAbortSignal()
const packumentCache = getPackumentCache()
const pacoteCachePath = getPacoteCachePath()

/**
 * Extract a package to a destination directory.
 *
 * @example
 *   ;```typescript
 *   await extractPackage('lodash@4.17.21', { dest: '/tmp/lodash' })
 *   ```
 */
export async function extractPackage(
  pkgNameOrId: string,
  options?: ExtractOptions,
  callback?: (destPath: string) => Promise<unknown>,
): Promise<void> {
  let actualCallback = callback
  let actualOptions = options
  // biome-ignore lint/complexity/noArguments: Function overload support.
  if (arguments.length === 2 && typeof options === 'function') {
    actualCallback = options
    actualOptions = undefined
  }
  const { dest, tmpPrefix, ...extractOptions_ } = {
    __proto__: null,
    ...actualOptions,
  } as ExtractOptions
  const extractOptions = {
    packumentCache,
    preferOffline: true,
    ...extractOptions_,
  }
  /* c8 ignore start - External package registry extraction */
  // pacote is imported at the top
  if (typeof dest === 'string') {
    // Normalize to forward slashes so the path pacote extracts to and the path
    // the caller later checks are the same string. pacote normalizes internally
    // before writing, so a raw `C:\…\extracted` dest is written as `C:/…/extracted`
    // and a caller asserting the backslash form finds nothing on Windows.
    const normalizedDest = normalizePath(dest)
    await pacote.extract(pkgNameOrId, normalizedDest, extractOptions)
    if (typeof actualCallback === 'function') {
      await actualCallback(normalizedDest)
    }
  } else {
    // The DefinitelyTyped types for cacache.tmp.withTmp are incorrect.
    // It DOES returns a promise.
    // cacache is imported at the top
    await cacache.tmp.withTmp(
      pacoteCachePath,
      { tmpPrefix },
      async (tmpDirPath: string) => {
        await pacote.extract(pkgNameOrId, tmpDirPath, extractOptions)
        if (typeof actualCallback === 'function') {
          await actualCallback(tmpDirPath)
        }
      },
    )
  }
  /* c8 ignore stop */
}

/**
 * Pack a package tarball using pacote.
 *
 * @example
 *   ;```typescript
 *   const tarball = await packPackage('lodash@4.17.21')
 *   ```
 */
export async function packPackage(
  spec: string,
  options?: PacoteOptions,
): Promise<unknown> {
  /* c8 ignore start - External package registry packing */
  // libnpmpack is imported at the top as libnpmpack
  return await libnpmpack(spec, {
    __proto__: null,
    signal: abortSignal,
    ...options,
    packumentCache,
    preferOffline: true,
  } as PacoteOptions)
  /* c8 ignore stop */
}
