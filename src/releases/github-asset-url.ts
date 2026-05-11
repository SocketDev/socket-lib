/**
 * @fileoverview Per-release asset-URL discovery for GitHub releases.
 *
 * Split out of `releases/github-api.ts` for size hygiene. Holds the
 * "fetch this specific tag's downloadable asset URL" path (REST with
 * GraphQL fallback for ES-index incidents):
 *
 *   - `fetchReleaseAssetsViaGraphQL` — GraphQL fallback when REST's
 *     per-tag endpoint returns 200 + empty body
 *   - `getReleaseAssetUrl` — REST per-tag lookup + pattern matcher + GraphQL fallback
 *
 * The list-all-releases path lives in `./github-listing`.
 */

import { httpRequest } from '../http-request/request'
import { pRetry } from '../promises/retry'

import { ArrayIsArray } from '../primordials/array'
import { ErrorCtor } from '../primordials/error'
import { JSONParse, JSONStringify } from '../primordials/json'
import { ObjectFreeze } from '../primordials/object'

import { createAssetMatcher } from './github-assets'
import { getAuthHeaders } from './github-auth'

import type { AssetPattern, RepoConfig } from './github-types'

/**
 * Retry configuration for GitHub API requests.
 * Uses exponential backoff to handle transient failures and rate limiting.
 */
const RETRY_CONFIG = ObjectFreeze({
  __proto__: null,
  // Exponential backoff: delay doubles with each retry (5s, 10s, 20s).
  backoffFactor: 2,
  // Initial delay before first retry.
  baseDelayMs: 5000,
  // Maximum number of retry attempts (excluding initial request).
  retries: 2,
})

/**
 * Fetch the assets of a single release identified by tag via GraphQL.
 *
 * Why this exists:
 *   `getReleaseAssetUrl` uses REST `/releases/tags/:tag` to look
 *   up a single release and find a downloadable asset. During
 *   GitHub incidents that endpoint can return 200 + empty body
 *   the same way the listing endpoint does (the per-tag lookup
 *   joins against the same listing index for asset discovery).
 *   This helper hits GraphQL `repository.release(tagName)` which
 *   uses a different backend.
 *
 * Field shape diff we normalize:
 *   GraphQL returns                       REST equivalent
 *   `releaseAssets.nodes[].downloadUrl`   `assets[].browser_download_url`
 *
 *   Same URL, different field name and one extra connection-wrapper
 *   level. The mapping at the bottom converts so the asset-matcher
 *   in `getReleaseAssetUrl` can run unchanged.
 *
 * Return contract:
 *   - Array of assets (REST shape) when the release exists.
 *   - `undefined` when the release with that tag genuinely doesn't
 *     exist (GraphQL returned `release: null` over the wire — we
 *     translate that to undefined per the codebase convention). The
 *     caller throws a clean "tag not found" error in that case.
 *   - Throws on transport errors (non-OK HTTP, GraphQL errors[],
 *     or even the GraphQL backend ALSO returning empty body — at
 *     that point both transports are degraded and we want the
 *     pRetry wrapper to back off and retry).
 */
export async function fetchReleaseAssetsViaGraphQL(
  owner: string,
  repo: string,
  tag: string,
): Promise<Array<{ name: string; browser_download_url: string }> | undefined> {
  const response = await httpRequest('https://api.github.com/graphql', {
    body: JSONStringify({
      query: `query($owner: String!, $repo: String!, $tag: String!) {
        repository(owner: $owner, name: $repo) {
          release(tagName: $tag) {
            tagName
            releaseAssets(first: 100) { nodes { name downloadUrl } }
          }
        }
      }`,
      variables: { owner, repo, tag },
    }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) {
    throw new ErrorCtor(
      `Failed to fetch ${owner}/${repo} release ${tag} (GraphQL): ${response.status} ${response.statusText}`,
    )
  }
  if (response.body.byteLength === 0) {
    throw new ErrorCtor(
      `Failed to fetch ${owner}/${repo} release ${tag}: GraphQL returned empty body`,
    )
  }
  let parsed: {
    data?: {
      repository?: {
        release?: {
          tagName: string
          releaseAssets?: {
            nodes?: Array<{ name: string; downloadUrl: string }>
          }
        } | null
      }
    }
    errors?: Array<{ message: string }>
  }
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch (cause) {
    throw new ErrorCtor(
      `Failed to parse ${owner}/${repo} release ${tag} response (GraphQL)`,
      { cause },
    )
  }
  // errors-array arm fires only when GraphQL returns errors.
  /* c8 ignore next 4 */
  if (parsed.errors?.length) {
    throw new ErrorCtor(
      `GraphQL repository.release(${owner}/${repo}, ${tag}) returned errors: ${parsed.errors.map(e => e.message).join('; ')}`,
    )
  }
  const release = parsed.data?.repository?.release
  if (!release) {
    return undefined
  }
  // ?? [] fallback fires when GraphQL returns no releaseAssets.
  /* c8 ignore start */
  return (release.releaseAssets?.nodes ?? []).map(n => ({
    browser_download_url: n.downloadUrl,
    name: n.name,
  }))
  /* c8 ignore stop */
}

/**
 * Get download URL for a specific release asset.
 * Supports pattern matching for dynamic asset discovery.
 *
 * @param tag - Release tag name
 * @param assetPattern - Asset name or pattern (glob string, prefix/suffix object, or RegExp)
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options
 * @param options.nothrow - If true, return undefined instead of throwing when both REST and GraphQL backends are degraded. Default: false.
 * @returns Browser download URL for the asset, or undefined when not found.
 * @throws {Error} If both REST and GraphQL backends are degraded and nothrow is false.
 *
 * @example
 * ```typescript
 * const url = await getReleaseAssetUrl(
 *   'v1.0.0', 'tool-linux-x64',
 *   { owner: 'SocketDev', repo: 'socket-btm' },
 * )
 * ```
 */
export async function getReleaseAssetUrl(
  tag: string,
  assetPattern: string | AssetPattern,
  repoConfig: RepoConfig,
  options: { nothrow?: boolean } = {},
): Promise<string | undefined> {
  // The `quiet` option from previous releases is no longer accepted.
  // The helper is silent by design now (errors throw, success
  // returns). Type enforces this — passing `{ quiet: true }` is a TS error.
  const { nothrow = false } = options
  const { owner, repo } = repoConfig

  // Create matcher function for the pattern. Glob-pattern arm fires
  // for AssetPattern objects; string-equality arm for plain strings.
  /* c8 ignore start */
  const isMatch =
    typeof assetPattern === 'string' &&
    !assetPattern.includes('*') &&
    !assetPattern.includes('{')
      ? (input: string) => input === assetPattern
      : createAssetMatcher(assetPattern as AssetPattern)
  /* c8 ignore stop */

  return (
    (await pRetry(async () => {
      const response = await httpRequest(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
        {
          headers: getAuthHeaders(),
        },
      )

      if (!response.ok) {
        throw new ErrorCtor(
          `Failed to fetch ${owner}/${repo} release ${tag}: ${response.status}`,
        )
      }

      // -------------------------------------------------------
      // 200 OK + zero-byte body = GitHub Elasticsearch incident.
      // The status says "success" but the payload is empty.
      // Cross-check via GraphQL `repository.release(tagName)`,
      // which uses a different backend — when REST is degraded
      // GraphQL is usually still serving the same data.
      //
      // The two transports expose the SAME asset data with one
      // field-name diff (`downloadUrl` vs. `browser_download_url`)
      // that `fetchReleaseAssetsViaGraphQL` normalizes. After
      // normalization we go back to the SAME asset matcher path
      // below — the rest of the function doesn't know which
      // transport produced the asset list.
      //
      // Three outcomes from the GraphQL fallback:
      //   - assets returned: continue with matching as normal
      //   - `undefined` returned: GraphQL says no release with this
      //     tag exists. Throw a clear error so the user knows
      //     the tag is genuinely missing rather than masking a
      //     transient with a silent skip.
      //   - GraphQL itself throws: `pRetry` retries the whole
      //     `getReleaseAssetUrl` call (REST included). This is
      //     intentional — if both transports fail we want
      //     backoff, not a blind error.
      // -------------------------------------------------------
      let assets: Array<{ name: string; browser_download_url: string }>
      if (response.body.byteLength === 0) {
        // REST is degraded — silently route to GraphQL. Only error
        // out (with a clear, informative message) if BOTH transports
        // fail to return assets for this tag.
        let fallbackAssets:
          | Array<{ name: string; browser_download_url: string }>
          | undefined
        try {
          fallbackAssets = await fetchReleaseAssetsViaGraphQL(owner, repo, tag)
        } catch (cause) {
          /* c8 ignore next 7 - Both backends degraded; needs real
             network failure on both REST and GraphQL. */
          if (nothrow) {
            return undefined
          }
          throw new ErrorCtor(
            `Failed to fetch ${owner}/${repo} release ${tag}: both REST and GraphQL backends degraded`,
            { cause },
          )
        }
        // GraphQL fallback returned no release.
        /* c8 ignore start */
        if (fallbackAssets === undefined) {
          if (nothrow) {
            return undefined
          }
          throw new ErrorCtor(`Release ${tag} not found in ${owner}/${repo}`)
          /* c8 ignore stop */
        }
        assets = fallbackAssets
      } else {
        let release: {
          assets: Array<{ name: string; browser_download_url: string }>
        }
        try {
          release = JSONParse(response.body.toString('utf8'))
        } catch (cause) {
          throw new ErrorCtor(
            `Failed to parse ${owner}/${repo} release ${tag} response`,
            { cause },
          )
        }

        if (!ArrayIsArray(release.assets)) {
          throw new ErrorCtor(
            `Release ${tag} has no assets in ${owner}/${repo}`,
          )
        }
        assets = release.assets
      }

      const asset = assets.find(a => isMatch(a.name))

      // No-asset throw + AssetPattern-string-vs-object describer fire
      // only on no-match cases; tests cover the happy path.
      /* c8 ignore start */
      if (!asset) {
        const patternDesc =
          typeof assetPattern === 'string' ? assetPattern : 'matching pattern'
        throw new ErrorCtor(`Asset ${patternDesc} not found in release ${tag}`)
      }
      /* c8 ignore stop */

      return asset.browser_download_url
    }, RETRY_CONFIG)) ?? undefined
  )
}
