/**
 * @file Network-facing package helpers: the lazily-initialized
 *   make-fetch-happen fetcher (shared cache) and GitHub tarball-URL resolution
 *   for a package spec.
 */

import { getPacoteCachePath } from '../constants/packages'
import makeFetchHappen from '../external/make-fetch-happen'
import npmPackageArg from '../external/npm-package-arg'
import { isPlainObject } from '../objects/predicates'

import { readPackageJson } from './read'
import {
  getRepoUrlDetails,
  gitHubTagRefUrl,
  gitHubTgzUrl,
  isGitHubTgzSpec,
  isGitHubUrlSpec,
} from './specs'

const pacoteCachePath = getPacoteCachePath()

// Lazily initialize the fetcher. Module-level eager init forced
// `makeFetchHappen` to load at import time, which pulls the heavy npm-pack
// bundle into any consumer that imports this module for an unrelated pure
// helper. Bundlers that stub npm-pack then crash at module load. A memoized
// getter defers the cost to the first fetcher use.
let cachedFetcher: ReturnType<typeof makeFetchHappen.defaults> | undefined

export function getFetcher(): ReturnType<typeof makeFetchHappen.defaults> {
  if (cachedFetcher === undefined) {
    cachedFetcher = makeFetchHappen.defaults({
      cachePath: pacoteCachePath,
      // Prefer-offline: Staleness checks for cached data will be bypassed, but
      // missing data will be requested from the server.
      // https://github.com/npm/make-fetch-happen?tab=readme-ov-file#--optscache
      cache: 'force-cache',
    })
  }
  return cachedFetcher
}

/**
 * Resolve GitHub tarball URL for a package specifier.
 *
 * @example
 *   ;```typescript
 *   const url = await resolveGitHubTgzUrl('my-pkg@1.0.0', '/tmp/my-project')
 *   ```
 */
export async function resolveGitHubTgzUrl(
  pkgNameOrId: string,
  where?: unknown,
): Promise<string> {
  const whereIsPkgJson = isPlainObject(where)
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
  const repository = pkgJson.repository as { url?: string | undefined }
  const { project, user } = (isGitHubUrl
    ? parsedSpec.hosted
    : getRepoUrlDetails(repository?.url)) || { project: '', user: '' }

  /* c8 ignore start - External GitHub API calls */
  if (user && project) {
    const fetcher = getFetcher()
    let apiUrl = ''
    if (isGitHubUrl) {
      apiUrl = gitHubTagRefUrl(user, project, parsedSpec.gitCommittish || '')
    } else {
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
      const resp = await fetcher(apiUrl)
      // resp.json() throws on non-JSON bodies (e.g. SFW block-page HTML
      // when api.github.com isn't allow-listed, or any other proxy
      // intercept that returns a non-JSON body). Treat that as "no
      // sha found" and fall through to the empty-string return; the
      // caller decides whether to retry without the GitHub URL.
      let json:
        | { object?: { sha?: string | undefined } | undefined }
        | undefined
      try {
        json = (await resp.json()) as {
          object?: { sha?: string | undefined } | undefined
        }
      } catch {
        json = undefined
      }
      const sha = json?.object?.sha
      if (sha) {
        return gitHubTgzUrl(user, project, sha)
      }
    }
  }
  /* c8 ignore stop */
  return ''
}
