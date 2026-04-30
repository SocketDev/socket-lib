/**
 * @fileoverview Package operations including extraction, packing, and I/O.
 */

import {
  getPackageExtensions,
  getPackumentCache,
  getPacoteCachePath,
} from '../constants/packages'
import { getAbortSignal } from '../constants/process'
import { REGISTRY_SCOPE_DELIMITER } from '../constants/socket'

import cacache from '../external/cacache'
import libnpmpack from '../external/libnpmpack'
import makeFetchHappen from '../external/make-fetch-happen'
import npmPackageArg from '../external/npm-package-arg'
// @ts-expect-error - external vendored module
import { PackageURL } from '../external/@socketregistry/packageurl-js'
import pacote from '../external/pacote'
import * as semver from '../external/semver'

import { readJson, readJsonSync } from '../fs'
import { isObjectObject, merge } from '../objects'
import type {
  ExtractOptions,
  NormalizeOptions,
  PackageJson,
  PacoteOptions,
  ReadPackageJsonOptions,
} from '../packages'
import { normalizePackageJson } from './normalize'
import { resolvePackageJsonPath } from '../paths/packages'
import {
  getRepoUrlDetails,
  gitHubTagRefUrl,
  gitHubTgzUrl,
  isGitHubTgzSpec,
  isGitHubUrlSpec,
} from './specs'
import { toEditablePackageJson, toEditablePackageJsonSync } from './edit'

import {
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../primordials'

const abortSignal = getAbortSignal()
const packageExtensions = getPackageExtensions()
const packumentCache = getPackumentCache()
const pacoteCachePath = getPacoteCachePath()

// Initialize fetcher with cache settings
const fetcher = makeFetchHappen.defaults({
  cachePath: pacoteCachePath,
  // Prefer-offline: Staleness checks for cached data will be bypassed, but
  // missing data will be requested from the server.
  // https://github.com/npm/make-fetch-happen?tab=readme-ov-file#--optscache
  cache: 'force-cache',
})

/**
 * Extract a package to a destination directory.
 *
 * @example
 * ```typescript
 * await extractPackage('lodash@4.17.21', { dest: '/tmp/lodash' })
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
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
    await pacote.extract(pkgNameOrId, dest, extractOptions)
    if (typeof actualCallback === 'function') {
      await actualCallback(dest)
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
 * Find package extensions for a given package.
 *
 * @example
 * ```typescript
 * const extensions = findPackageExtensions('my-pkg', '1.0.0')
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function findPackageExtensions(
  pkgName: string,
  pkgVer: string,
): unknown {
  let result: unknown
  for (const entry of packageExtensions) {
    const selector = String(entry[0])
    const ext = entry[1]
    const lastAtSignIndex = selector.lastIndexOf('@')
    const name = selector.slice(0, lastAtSignIndex)
    if (pkgName === name) {
      // semver is imported at the top
      const range = selector.slice(lastAtSignIndex + 1)
      if (semver.satisfies(pkgVer, range)) {
        if (result === undefined) {
          result = {}
        }
        if (typeof ext === 'object' && ext !== null) {
          merge(result as object, ext)
        }
      }
    }
  }
  return result
}

/**
 * Get the release tag for a version.
 *
 * @example
 * ```typescript
 * getReleaseTag('lodash@latest')    // 'latest'
 * getReleaseTag('@scope/pkg@beta')  // 'beta'
 * getReleaseTag('lodash')           // ''
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getReleaseTag(spec: string): string {
  if (!spec) {
    return ''
  }
  // Handle scoped packages like @scope/package vs @scope/package@tag.
  let atIndex = -1
  if (StringPrototypeStartsWith(spec, '@')) {
    // Find the second @ for scoped packages.
    atIndex = StringPrototypeIndexOf(spec, '@', 1)
  } else {
    // Find the first @ for unscoped packages.
    atIndex = StringPrototypeIndexOf(spec, '@')
  }
  if (atIndex !== -1) {
    return StringPrototypeSlice(spec, atIndex + 1)
  }
  return ''
}

/**
 * Pack a package tarball using pacote.
 *
 * @example
 * ```typescript
 * const tarball = await packPackage('lodash@4.17.21')
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
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

/**
 * Read and parse a package.json file asynchronously.
 *
 * @example
 * ```typescript
 * const pkgJson = await readPackageJson('/tmp/my-project')
 * console.log(pkgJson?.name)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export async function readPackageJson(
  filepath: string,
  options?: ReadPackageJsonOptions,
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
 * ```typescript
 * const pkgJson = readPackageJsonSync('/tmp/my-project')
 * console.log(pkgJson?.name)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function readPackageJsonSync(
  filepath: string,
  options?: NormalizeOptions & { editable?: boolean; throws?: boolean },
): PackageJson | undefined {
  const { editable, normalize, throws, ...normalizeOptions } = {
    __proto__: null,
    ...options,
  } as NormalizeOptions & {
    editable?: boolean
    throws?: boolean
    normalize?: boolean
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

/**
 * Resolve GitHub tarball URL for a package specifier.
 *
 * @example
 * ```typescript
 * const url = await resolveGitHubTgzUrl('my-pkg@1.0.0', '/tmp/my-project')
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export async function resolveGitHubTgzUrl(
  pkgNameOrId: string,
  where?: unknown,
): Promise<string> {
  const whereIsPkgJson = isObjectObject(where)
  const pkgJson = whereIsPkgJson
    ? where
    : await readPackageJson(where as string, { normalize: true })
  if (!pkgJson) {
    return ''
  }
  const { version } = pkgJson
  // npmPackageArg is imported at the top
  const parsedSpec = npmPackageArg(
    pkgNameOrId,
    whereIsPkgJson ? undefined : (where as string),
  )
  const isTarballUrl = isGitHubTgzSpec(parsedSpec)
  if (isTarballUrl) {
    return parsedSpec.saveSpec || ''
  }
  const isGitHubUrl = isGitHubUrlSpec(parsedSpec)
  const repository = pkgJson.repository as { url?: string }
  const { project, user } = (isGitHubUrl
    ? parsedSpec.hosted
    : getRepoUrlDetails(repository?.url)) || { project: '', user: '' }

  /* c8 ignore start - External GitHub API calls */
  if (user && project) {
    let apiUrl = ''
    if (isGitHubUrl) {
      apiUrl = gitHubTagRefUrl(user, project, parsedSpec.gitCommittish || '')
    } else {
      // fetcher is initialized at the top
      const versionStr = version as string
      // First try to resolve the sha for a tag starting with "v", e.g. v1.2.3.
      apiUrl = gitHubTagRefUrl(user, project, `v${versionStr}`)
      if (!(await fetcher(apiUrl, { method: 'head' })).ok) {
        // If a sha isn't found, try again with the "v" removed, e.g. 1.2.3.
        apiUrl = gitHubTagRefUrl(user, project, versionStr)
        if (!(await fetcher(apiUrl, { method: 'head' })).ok) {
          apiUrl = ''
        }
      }
    }
    if (apiUrl) {
      // fetcher is initialized at the top
      const resp = await fetcher(apiUrl)
      const json = (await resp.json()) as { object?: { sha?: string } }
      const sha = json?.object?.sha
      if (sha) {
        return gitHubTgzUrl(user, project, sha)
      }
    }
  }
  /* c8 ignore stop */
  return ''
}

/**
 * Resolve full package name from a PURL object with custom delimiter.
 *
 * @example
 * ```typescript
 * resolvePackageName({ name: 'core', namespace: '@babel' })  // '@babel/core'
 * resolvePackageName({ name: 'lodash' })                     // 'lodash'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolvePackageName(
  purlObj: { name: string; namespace?: string },
  delimiter: string = '/',
): string {
  const { name, namespace } = purlObj
  return `${namespace ? `${namespace}${delimiter}` : ''}${name}`
}

/**
 * Convert npm package name to Socket registry format with delimiter.
 *
 * @example
 * ```typescript
 * resolveRegistryPackageName('@babel/core') // 'babel__core'
 * resolveRegistryPackageName('lodash')      // 'lodash'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolveRegistryPackageName(pkgName: string): string {
  const purlObj = PackageURL.fromString(`pkg:npm/${pkgName}`)
  return purlObj.namespace
    ? `${purlObj.namespace.slice(1)}${REGISTRY_SCOPE_DELIMITER}${purlObj.name}`
    : pkgName
}

// Re-export types from lib/packages.
export type { PackageJson } from '../packages'
