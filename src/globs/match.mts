/**
 * @file `glob` (async) and `globSync` — fast-glob wrappers with a
 *   `node:fs.glob` fast-path when the option surface lines up.
 *   `canUseNodeFsGlob` is the per-call gate. Trailing-slash workaround for
 *   fast-glob ignore patterns
 *   ───────────────────────────────────────────────────────── TL;DR: when you
 *   pass `ignore: ['**\/dist/']` to fast-glob, the `dist` directory still gets
 *   walked. Strip the trailing slash before passing it to fast-glob and the
 *   ignore actually takes effect. Why this exists ─────────────── The gitignore
 *   convention is to write directory entries with a trailing slash: `dist/`,
 *   `node_modules/`, `coverage/`. Tools that translate gitignore lines into
 *   glob patterns (including socket-cli's `globWithGitIgnore` helper,
 *   npm-packlist, etc.) preserve that slash. fast-glob has TWO independent
 *   filters that handle the trailing slash differently:
 *
 *   1. The DEEP filter decides whether to walk INTO a candidate directory. The
 *      deep filter compiles `**\/dist/` into a regex that requires a trailing
 *      slash on the input, but it tests `entryPath = 'dist'` (no slash, because
 *      readdir entries don't include one). So fast-glob walks in anyway.
 *   2. The ENTRY filter (post-walk) retries with a trailing slash appended for
 *      directory entries — so it correctly excludes the results, but only AFTER
 *      the entire subtree has been walked. Net effect: a `dist/` ignore pattern
 *      correctly removes contents from the result array, but only after
 *      walking. On a 300k-file `dist/` under tight memory this is the
 *      difference between "instant" and "OOM kill". Stripping the trailing
 *      slash makes it `**\/dist`, which both filters interpret correctly.
 */

import { getNodeFs } from '../node/fs.mjs'
import { getNodeFsPromises } from '../node/fs-promises.mjs'
import { resolve } from '../paths/normalize.mjs'
import { pFilter } from '../promises/iterate.mjs'
import { fromAsync } from '../promises/resolvers.mjs'

import {
  getFastGlob,
  normalizeGlobResults,
  normalizeIgnorePatterns,
} from './shared.mjs'

import type { FastGlobOptions, Pattern } from './types.mjs'
import type { Options as FastGlobLibOptions } from 'fast-glob'

import { ObjectKeys } from '../primordials/object.mjs'

/**
 * Whether the caller's option bag is fully expressible with `node:fs.glob`
 * (`cwd` + `exclude`). Any other option means we must fall back to fast-glob,
 * which exposes the wider surface.
 *
 * Exported for unit tests; not part of the public API.
 *
 * @internal
 */
export function canUseNodeFsGlob(
  options: FastGlobOptions | undefined,
): boolean {
  if (!options) {
    return true
  }
  // Use ObjectKeys via primordials? Standard for-in is fine here for
  // type-narrowed access — the option object is plain.
  for (const key of ObjectKeys(options)) {
    if (key !== 'cwd' && key !== 'ignore') {
      return false
    }
  }
  return true
}

/**
 * `node:fs.glob` / `node:fs.globSync` have no `onlyFiles` notion — they
 * return directories alongside files. fast-glob (the path this fast path
 * mirrors) defaults to `onlyFiles: true`, so the two engines must agree on
 * the default or the same pattern over the same tree returns a different
 * result set depending on which engine ran. Resolves each entry to an
 * absolute path relative to the effective cwd and drops directories via a
 * `stat` call — the same filtering fast-glob itself has to do internally.
 */
export async function filterToFilesAsync(
  entries: string[],
  cwd: string | undefined,
  fsPromises: ReturnType<typeof getNodeFsPromises>,
): Promise<string[]> {
  const effectiveCwd = cwd ? resolve(cwd) : resolve()
  return await pFilter(entries, async entry => {
    try {
      // Needs the Stats object's isDirectory(), not just existence.
      // oxlint-disable-next-line socket/prefer-exists-sync -- dir check
      const stats = await fsPromises.stat(resolve(effectiveCwd, entry))
      return !stats.isDirectory()
    } catch {
      // Entry vanished between the walk and the stat (race) — drop it,
      // same as fast-glob would with a broken/missing entry.
      return false
    }
  })
}

/**
 * Sync twin of {@link filterToFilesAsync}.
 */
export function filterToFilesSync(
  entries: string[],
  cwd: string | undefined,
  fs: ReturnType<typeof getNodeFs>,
): string[] {
  const effectiveCwd = cwd ? resolve(cwd) : resolve()
  const files: string[] = []
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]!
    try {
      // Needs the Stats object's isDirectory(), not just existence.
      // oxlint-disable-next-line socket/prefer-exists-sync -- dir check
      if (!fs.statSync(resolve(effectiveCwd, entry)).isDirectory()) {
        files.push(entry)
      }
    } catch {
      // Entry vanished between the walk and the stat (race) — drop it.
    }
  }
  return files
}

/**
 * Asynchronously find files matching glob patterns.
 *
 * @example
 *   ;```typescript
 *   const files = await glob('src/*.ts', { cwd: '/tmp/project' })
 *   console.log(files) // ['src/index.ts', 'src/utils.ts']
 *   ```
 */
export async function glob(
  patterns: Pattern | Pattern[],
  options?: FastGlobOptions | undefined,
): Promise<string[]> {
  // Strip trailing slashes from ignore patterns before fast-glob sees
  // them; otherwise `dist/` from a .gitignore-derived list silently
  // walks the whole subtree. See the file header above.
  options = { __proto__: null, ...options } as typeof options
  const normalizedIgnore = normalizeIgnorePatterns(options?.ignore)
  // Prefer node:fs/promises.glob (added v22.0.0, Stable) when the
  // option surface lines up. Avoids loading fast-glob entirely.
  /* c8 ignore start */
  if (canUseNodeFsGlob(options)) {
    const fsPromises = getNodeFsPromises()
    const out = await fromAsync(
      fsPromises.glob(patterns as string | readonly string[], {
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(normalizedIgnore ? { exclude: normalizedIgnore } : {}),
      }),
    )
    const files = await filterToFilesAsync(out, options?.cwd, fsPromises)
    return normalizeGlobResults(files)
  }
  /* c8 ignore stop */
  /* c8 ignore next - External fast-glob call */
  const fastGlob = getFastGlob()
  const out = await fastGlob.glob(patterns, {
    ...(options as FastGlobLibOptions),
    ...(normalizedIgnore ? { ignore: normalizedIgnore } : {}),
  })
  return normalizeGlobResults(out)
}

/**
 * Synchronously find files matching glob patterns. Wrapper around
 * fast-glob.sync.
 *
 * @example
 *   ;```typescript
 *   const files = globSync('*.json', { cwd: '/tmp/project' })
 *   console.log(files) // ['package.json', 'tsconfig.json']
 *   ```
 */
export function globSync(
  patterns: Pattern | Pattern[],
  options?: FastGlobOptions | undefined,
): string[] {
  // Strip trailing slashes from ignore patterns; same workaround as
  // the async `glob` above, see file header.
  options = { __proto__: null, ...options } as typeof options
  const normalizedIgnore = normalizeIgnorePatterns(options?.ignore)
  // Prefer node:fs.globSync (added v22.0.0, Stable) when the option
  // surface lines up. Avoids loading fast-glob entirely.
  /* c8 ignore start */
  if (canUseNodeFsGlob(options)) {
    const fs = getNodeFs()
    const out = [
      ...fs.globSync(patterns as string | readonly string[], {
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(normalizedIgnore ? { exclude: normalizedIgnore } : {}),
      }),
    ] as string[]
    return normalizeGlobResults(filterToFilesSync(out, options?.cwd, fs))
  }
  /* c8 ignore stop */
  /* c8 ignore next - External fast-glob call */
  const fastGlob = getFastGlob()
  return normalizeGlobResults(
    fastGlob.globSync(patterns, {
      ...(options as FastGlobLibOptions),
      ...(normalizedIgnore ? { ignore: normalizedIgnore } : {}),
    }),
  )
}
