/**
 * @file Read + parse a package.json. The package-aware layer over
 *   `fs/read-json`: resolves a dir-or-file path to its package.json, parses,
 *   and optionally normalizes or returns an editable instance.
 */

import { readJson, readJsonSync } from '../fs/read-json'
import { resolvePackageJsonPath } from '../paths/packages'

import { toEditablePackageJson, toEditablePackageJsonSync } from './edit'
import { normalizePackageJson } from './normalize'

import type {
  NormalizeOptions,
  PackageJson,
  ReadPackageJsonOptions,
} from './types'

/**
 * Read and parse a package.json file asynchronously.
 *
 * @example
 *   ;```typescript
 *   const pkgJson = await readPackageJson('/tmp/my-project')
 *   console.log(pkgJson?.name)
 *   ```
 */
export async function readPackageJson(
  filepath: string,
  options?: ReadPackageJsonOptions | undefined,
): Promise<PackageJson | undefined> {
  const { editable, normalize, throws, ...normalizeOptions } = {
    __proto__: null,
    ...options,
  } as ReadPackageJsonOptions
  const pkgJson = (await readJson(resolvePackageJsonPath(filepath), {
    throws,
  })) as PackageJson | undefined
  if (pkgJson) {
    if (editable) {
      return (await toEditablePackageJson(pkgJson, {
        path: filepath,
        normalize,
        ...normalizeOptions,
      })) as PackageJson
    }
    return normalize ? normalizePackageJson(pkgJson, normalizeOptions) : pkgJson
  }
  return undefined
}

/**
 * Read and parse package.json from a file path synchronously.
 *
 * @example
 *   ;```typescript
 *   const pkgJson = readPackageJsonSync('/tmp/my-project')
 *   console.log(pkgJson?.name)
 *   ```
 */
export function readPackageJsonSync(
  filepath: string,
  options?:
    | (NormalizeOptions & {
        editable?: boolean | undefined
        throws?: boolean | undefined
      })
    | undefined,
): PackageJson | undefined {
  const { editable, normalize, throws, ...normalizeOptions } = {
    __proto__: null,
    ...options,
  } as NormalizeOptions & {
    editable?: boolean | undefined
    throws?: boolean | undefined
    normalize?: boolean | undefined
  }
  const pkgJson = readJsonSync(resolvePackageJsonPath(filepath), { throws }) as
    | PackageJson
    | undefined
  if (pkgJson) {
    if (editable) {
      return toEditablePackageJsonSync(pkgJson, {
        path: filepath,
        normalize,
        ...normalizeOptions,
      }) as PackageJson
    }
    return normalize ? normalizePackageJson(pkgJson, normalizeOptions) : pkgJson
  }
  return undefined
}
