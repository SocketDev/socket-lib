/**
 * @file Package manifest and packument fetching utilities.
 */

import {
  getPackageDefaultNodeRange,
  getPackageDefaultSocketCategories,
  getPackumentCache,
} from '../constants/packages'
import { getAbortSignal } from '../process/abort'
import {
  SOCKET_GITHUB_ORG,
  SOCKET_REGISTRY_REPO_NAME,
} from '../constants/socket'

import npmPackageArg from '../external/npm-package-arg'
import pacote from '../external/pacote'
import semver from '../external/semver'

import { isArray } from '../arrays/predicates'
import { isPlainObject } from '../objects/predicates'
import { objectEntries } from '../objects/sort'
import { resolvePackageJsonEntryExports } from './exports'
import { isRegistryFetcherType } from './validation'

import type { PackageJson, PacoteOptions } from './types'

import { ObjectFromEntries } from '../primordials/object'
const abortSignal = getAbortSignal()
const packageDefaultNodeRange = getPackageDefaultNodeRange()
const PACKAGE_DEFAULT_SOCKET_CATEGORIES = getPackageDefaultSocketCategories()
const packumentCache = getPackumentCache()

const pkgScopePrefixRegExp = /^@socketregistry\//

/**
 * Create a package.json object for a Socket registry package.
 *
 * @example
 *   ;```typescript
 *   const pkgJson = createPackageJson('is-number', 'packages/npm/is-number', {
 *     version: '1.0.0',
 *     description: 'Check if a value is a number',
 *   })
 *   ```
 */
export function createPackageJson(
  sockRegPkgName: string,
  directory: string,
  options?: PackageJson | undefined,
): PackageJson {
  const {
    dependencies,
    description,
    engines,
    exports: entryExportsRaw,
    files,
    keywords,
    main,
    overrides,
    resolutions,
    sideEffects,
    socket,
    type,
    version,
  } = { __proto__: null, ...options } as PackageJson
  const name = `@socketregistry/${sockRegPkgName.replace(pkgScopePrefixRegExp, '')}`
  const entryExports = resolvePackageJsonEntryExports(entryExportsRaw)
  const githubUrl = `https://github.com/${SOCKET_GITHUB_ORG}/${SOCKET_REGISTRY_REPO_NAME}`
  return {
    __proto__: null,
    name,
    version,
    license: 'MIT',
    description,
    keywords,
    homepage: `${githubUrl}/tree/main/${directory}`,
    repository: {
      type: 'git',
      url: `git+${githubUrl}.git`,
      directory,
    },
    ...(type ? { type } : {}),
    ...(isPlainObject(entryExports) ? { exports: { ...entryExports } } : {}),
    ...(entryExports ? {} : { main: `${main ?? './index.js'}` }),
    sideEffects: sideEffects !== undefined && !!sideEffects,
    ...(isPlainObject(dependencies)
      ? { dependencies: { ...dependencies } }
      : {}),
    ...(isPlainObject(overrides) ? { overrides: { ...overrides } } : {}),
    ...(isPlainObject(resolutions) ? { resolutions: { ...resolutions } } : {}),
    ...(isPlainObject(engines)
      ? {
          engines: ObjectFromEntries(
            objectEntries(engines).map((pair: [PropertyKey, unknown]) => {
              const strKey = String(pair[0])
              const result: [string, unknown] = [strKey, pair[1]]
              if (strKey === 'node') {
                // module is imported at the top
                const { 1: range } = result
                if (
                  typeof range === 'string' &&
                  range &&
                  packageDefaultNodeRange
                ) {
                  // Roughly check Node range as semver.coerce will strip leading
                  // v's, carets (^), comparators (<,<=,>,>=,=), and tildes (~).
                  const coercedRange = semver.coerce(range)
                  if (
                    !semver.satisfies(
                      coercedRange?.version ?? '0.0.0',
                      packageDefaultNodeRange,
                    )
                  ) {
                    result[1] = packageDefaultNodeRange
                  }
                }
              }
              return result
            }),
          ),
        }
      : { engines: { node: packageDefaultNodeRange } }),
    files: isArray(files) ? files.slice() : ['*.d.ts', '*.js'],
    ...(isPlainObject(socket)
      ? { socket: { ...socket } }
      : {
          socket: {
            // Valid categories are: cleanup, levelup, speedup, tuneup
            categories: PACKAGE_DEFAULT_SOCKET_CATEGORIES,
          },
        }),
  } as PackageJson
}

/**
 * Fetch the manifest for a package.
 *
 * @example
 *   ;```typescript
 *   const manifest = await fetchPackageManifest('lodash@4.17.21')
 *   ```
 */
export async function fetchPackageManifest(
  pkgNameOrId: string,
  options?: PacoteOptions,
): Promise<unknown> {
  const pacoteOptions = {
    __proto__: null,
    signal: abortSignal,
    ...options,
    packumentCache,
    preferOffline: true,
  } as PacoteOptions & { where?: string | undefined }
  const { signal } = pacoteOptions
  if (signal?.aborted) {
    return undefined
  }
  // module is imported at the top
  let result: unknown
  try {
    result = await pacote.manifest(pkgNameOrId, pacoteOptions)
  } catch {}
  if (signal?.aborted) {
    return undefined
  }
  if (result) {
    // module is imported at the top
    const spec = npmPackageArg(pkgNameOrId, pacoteOptions.where)
    if (isRegistryFetcherType(spec.type)) {
      return result
    }
  }
  // Convert a manifest not fetched by RegistryFetcher to one that is.
  if (result) {
    const typedResult = result as { name: string; version: string }
    return await fetchPackageManifest(
      `${typedResult.name}@${typedResult.version}`,
      pacoteOptions,
    )
  }
  return undefined
}

/**
 * Fetch the packument (package document) for a package.
 *
 * @example
 *   ;```typescript
 *   const packument = await fetchPackagePackument('lodash')
 *   ```
 */
export async function fetchPackagePackument(
  pkgNameOrId: string,
  options?: PacoteOptions,
): Promise<unknown> {
  // module is imported at the top
  try {
    return await pacote.packument(pkgNameOrId, {
      __proto__: null,
      signal: abortSignal,
      ...options,
      packumentCache,
      preferOffline: true,
    })
  } catch {}
  return undefined
}
