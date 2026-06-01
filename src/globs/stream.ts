/**
 * @file `globStreamLicenses` — license-file discovery as an async stream.
 *   Specialized for the npm-packlist-style license file search (`LICENSE*`,
 *   `COPYING*`, etc.) with optional originals inclusion.
 */

import {
  LICENSE_GLOB,
  LICENSE_GLOB_RECURSIVE,
  LICENSE_ORIGINAL_GLOB_RECURSIVE,
} from '../paths/globs'
import { ArrayIsArray } from '../primordials/array'

import {
  defaultIgnore,
  getFastGlob,
  normalizeIgnorePatterns,
} from './_internal'

import type { GlobOptions } from './types'

/**
 * Create a stream of license file paths matching glob patterns.
 *
 * @example
 *   ;```typescript
 *   const stream = globStreamLicenses('/tmp/my-package')
 *   for await (const licensePath of stream) {
 *     console.log(licensePath)
 *   }
 *   ```
 */
export function globStreamLicenses(
  dirname: string,
  options?: GlobOptions,
): NodeJS.ReadableStream {
  const {
    ignore: ignoreOpt,
    ignoreOriginals,
    recursive,
    ...globOptions
  } = { __proto__: null, ...options } as GlobOptions
  // Caller-supplied ignore arrays may contain gitignore-style
  // directory patterns (`dist/`); normalize them. Our defaultIgnore
  // entries are already trailing-slash-free.
  const baseIgnore = ArrayIsArray(ignoreOpt)
    ? normalizeIgnorePatterns(ignoreOpt)!
    : (defaultIgnore as readonly string[] as string[])
  const ignore: string[] = [...baseIgnore, '**/*.{cjs,cts,js,json,mjs,mts,ts}']
  if (ignoreOriginals) {
    ignore.push(LICENSE_ORIGINAL_GLOB_RECURSIVE)
  }
  /* c8 ignore start - External fast-glob call */
  const fastGlob = getFastGlob()
  return fastGlob.globStream(
    [recursive ? LICENSE_GLOB_RECURSIVE : LICENSE_GLOB],
    {
      __proto__: null,
      absolute: true,
      caseSensitiveMatch: false,
      cwd: dirname,
      ...globOptions,
      ...(ignore ? { ignore } : {}),
    } as import('fast-glob').Options,
  )
  /* c8 ignore stop */
}
