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

import { fromAsync } from '../promises/resolvers'

import {
  getFastGlob,
  getFs,
  getFsPromises,
  normalizeGlobResults,
  normalizeIgnorePatterns,
} from './_internal'

import type { FastGlobOptions, Pattern } from './types'

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
  for (const key of Object.keys(options)) {
    if (key !== 'cwd' && key !== 'ignore') {
      return false
    }
  }
  return true
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
/*@__NO_SIDE_EFFECTS__*/
export async function glob(
  patterns: Pattern | Pattern[],
  options?: FastGlobOptions,
): Promise<string[]> {
  // Strip trailing slashes from ignore patterns before fast-glob sees
  // them; otherwise `dist/` from a .gitignore-derived list silently
  // walks the whole subtree. See the file header above.
  const normalizedIgnore = normalizeIgnorePatterns(options?.ignore)
  // Prefer node:fs/promises.glob (added v22.0.0, Stable) when the
  // option surface lines up. Avoids loading fast-glob entirely.
  /* c8 ignore start */
  if (canUseNodeFsGlob(options)) {
    const out = await fromAsync(
      getFsPromises().glob(patterns as string | readonly string[], {
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(normalizedIgnore ? { exclude: normalizedIgnore } : {}),
      }),
    )
    return normalizeGlobResults(out)
  }
  /* c8 ignore stop */
  /* c8 ignore next - External fast-glob call */
  const fastGlob = getFastGlob()
  const out = await fastGlob.glob(patterns, {
    ...(options as import('fast-glob').Options),
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
/*@__NO_SIDE_EFFECTS__*/
export function globSync(
  patterns: Pattern | Pattern[],
  options?: FastGlobOptions,
): string[] {
  // Strip trailing slashes from ignore patterns; same workaround as
  // the async `glob` above, see file header.
  const normalizedIgnore = normalizeIgnorePatterns(options?.ignore)
  // Prefer node:fs.globSync (added v22.0.0, Stable) when the option
  // surface lines up. Avoids loading fast-glob entirely.
  /* c8 ignore start */
  if (canUseNodeFsGlob(options)) {
    return normalizeGlobResults([
      ...getFs().globSync(patterns as string | readonly string[], {
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(normalizedIgnore ? { exclude: normalizedIgnore } : {}),
      }),
    ] as string[])
  }
  /* c8 ignore stop */
  /* c8 ignore next - External fast-glob call */
  const fastGlob = getFastGlob()
  return normalizeGlobResults(
    fastGlob.globSync(patterns, {
      ...(options as import('fast-glob').Options),
      ...(normalizedIgnore ? { ignore: normalizedIgnore } : {}),
    }),
  )
}
