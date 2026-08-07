/**
 * @file Per-release asset-URL discovery for GitHub releases. Split out of
 *   `releases/github-api.ts` for size hygiene. Holds the "fetch this specific
 *   tag's downloadable asset URL" path (REST with GraphQL fallback for ES-index
 *   incidents):
 *
 *   - `fetchReleaseAssetsViaGraphQL` — GraphQL fallback when REST's per-tag
 *     endpoint returns 200 + empty body
 *   - `getReleaseAssetUrl` — REST per-tag lookup + pattern matcher + GraphQL
 *     fallback The list-all-releases path lives in `./github-listing`.
 */

import { httpRequest } from '../http-request/request'
import { pRetry } from '../promises/retry'

import { ArrayIsArray } from '../primordials/array'
import { ErrorCtor } from '../primordials/error'
import { JSONParse, JSONStringify } from '../primordials/json'

import { createAssetMatcher, describeAssetPatterns } from './github-assets'
import { getAuthHeaders } from './github-auth'
import { GITHUB_RETRY_CONFIG as RETRY_CONFIG } from './github-retry-config'

import type { AssetPattern, RepoConfig } from './github-types'

/**
 * Fetch the assets of a single release identified by tag via GraphQL.
 *
 * Why this exists: `getReleaseAssetUrl` uses REST `/releases/tags/:tag` to look
 * up a single release and find a downloadable asset. During GitHub incidents
 * that endpoint can return 200 + empty body the same way the listing endpoint
 * does (the per-tag lookup joins against the same listing index for asset
 * discovery). This helper hits GraphQL `repository.release(tagName)` which uses
 * a different backend.
 *
 * Field shape diff we normalize: GraphQL returns REST equivalent
 * `releaseAssets.nodes[].downloadUrl` `assets[].browser_download_url`
 *
 * Same URL, different field name and one extra connection-wrapper level. The
 * mapping at the bottom converts so the asset-matcher in `getReleaseAssetUrl`
 * can run unchanged.
 *
 * Return contract:
 *
 * - Array of assets (REST shape) when the release exists.
 * - `undefined` when the release with that tag genuinely doesn't exist (GraphQL
 *   returned `release: null` over the wire — we translate that to undefined per
 *   the codebase convention). The caller throws a clean "tag not found" error
 *   in that case.
 * - Throws on transport errors (non-OK HTTP, GraphQL errors[], or even the
 *   GraphQL backend ALSO returning empty body — at that point both transports
 *   are degraded and we want the pRetry wrapper to back off and retry).
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
    data?:
      | {
          repository?:
            | {
                release?:
                  | {
                      tagName: string
                      releaseAssets?:
                        | {
                            nodes?:
                              | Array<{ name: string; downloadUrl: string }>
                              | undefined
                          }
                        | undefined
                    }
                  | null
                  | undefined
              }
            | undefined
        }
      | undefined
    errors?: Array<{ message: string }> | undefined
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
 * Get download URL for a specific release asset. Supports pattern matching for
 * dynamic asset discovery.
 *
 * @example
 *   ;```typescript
 *   const url = await getReleaseAssetUrl('v1.0.0', 'tool-linux-x64', {
 *     owner: 'SocketDev',
 *     repo: 'socket-btm',
 *   })
 *   ```
 *
 * @param tag - Release tag name.
 * @param assetPattern - Asset name or pattern (glob string or RegExp), or
 *   an ordered candidate list — the first candidate that
 *   matches any release asset wins.
 * @param repoConfig - Repository configuration (owner/repo)
 * @param options - Additional options.
 * @param options.nothrow - If true, return undefined instead of throwing when
 *   both REST and GraphQL backends are degraded. Default: false.
 *
 * @returns Browser download URL for the asset, or undefined when not found.
 *
 * @throws {Error} If both REST and GraphQL backends are degraded and nothrow is
 *   false.
 */
export async function getReleaseAssetUrl(
  tag: string,
  assetPattern: AssetPattern | readonly AssetPattern[],
  repoConfig: RepoConfig,
  options: { nothrow?: boolean | undefined } = {},
): Promise<string | undefined> {
  // The `quiet` option from previous releases is no longer accepted.
  // The helper is silent by design now (errors throw, success
  // returns). Type enforces this — passing `{ quiet: true }` is a TS error.
  const { nothrow = false } = options
  const { owner, repo } = repoConfig

  // Normalize to an ordered candidate list; a single pattern is a
  // one-candidate list.
  const candidates: readonly AssetPattern[] = ArrayIsArray(assetPattern)
    ? assetPattern
    : [assetPattern]

  // Fetch the assets list with retry semantics for transient errors.
  // Matching the asset name happens AFTER the retry block — a no-match
  // is a deterministic failure on a stable payload, so retrying with
  // exponential backoff (RETRY_CONFIG) burns the test/CI clock for
  // nothing while the answer is fixed. Tests that exercise the
  // no-match path used to wait 5s + 10s = 15s before the final throw.
  const assets = await pRetry(async () => {
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

    // 200 OK with a zero-byte body is a GitHub Elasticsearch incident, not an
    // absent release: trusting the status here records a false negative. Cross-
    // check via GraphQL, which runs on a different backend. A `undefined` from
    // GraphQL means the tag genuinely does not exist and must throw rather than
    // skip; a GraphQL throw falls through to `pRetry` so both transports get
    // backoff. Detail: docs/references/repo/github-api-degradation.md
    let resolvedAssets: Array<{ name: string; browser_download_url: string }>
    if (response.body.byteLength === 0) {
      // REST is degraded — silently route to GraphQL. Only error
      // out, with a clear and informative message, if BOTH
      // transports fail to return assets for this tag.
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
      resolvedAssets = fallbackAssets
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
        throw new ErrorCtor(`Release ${tag} has no assets in ${owner}/${repo}`)
      }
      resolvedAssets = release.assets
    }

    return resolvedAssets
  }, RETRY_CONFIG)

  // pRetry returns undefined on signal-aborted; treat the same as the
  // fetched-but-empty case below.
  if (!assets) {
    if (nothrow) {
      return undefined
    }
    throw new ErrorCtor(`Release ${tag} not found in ${owner}/${repo}`)
  }

  // Try each candidate in order — the FIRST candidate that matches any
  // release asset wins. Candidate priority decides, not asset-list order.
  let asset: { name: string; browser_download_url: string } | undefined
  for (let i = 0, { length } = candidates; i < length; i += 1) {
    const candidate = candidates[i]!
    // Wildcard-free strings match by equality; glob/object/RegExp
    // candidates go through createAssetMatcher.
    /* c8 ignore start - Glob-vs-exact matcher split; both arms fire only
       across the full pattern-shape test matrix. */
    const isMatch =
      typeof candidate === 'string' &&
      !candidate.includes('*') &&
      !candidate.includes('{')
        ? (input: string) => input === candidate
        : createAssetMatcher(candidate)
    /* c8 ignore stop */
    asset = assets.find(a => isMatch(a.name))
    if (asset) {
      break
    }
  }

  if (!asset) {
    // Nothrow arm fires only for callers opting out of the throw.
    /* c8 ignore start - Nothrow no-match arm; covered via nothrow callers. */
    if (nothrow) {
      return undefined
    }
    /* c8 ignore stop */
    throw new ErrorCtor(
      `Asset ${describeAssetPatterns(candidates)} not found in release ${tag}`,
    )
  }

  return asset.browser_download_url
}
