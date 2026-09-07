/**
 * @file Resolve a GitHub git ref via GraphQL. Split out of `github/refs.ts` for
 *   size hygiene. The fallback the REST tier-cascade calls when it detects the
 *   documented "200 + empty body" incident shape — GraphQL hits a different
 *   backend at GitHub (not the same Elasticsearch index as REST listings) and
 *   stays consistent through those incidents.
 */

import { httpRequest } from '../http-request/request.mjs'

import { JSONParse, JSONStringify } from '../primordials/json.mjs'

import { getGitHubToken } from './token.mjs'
import { GITHUB_GRAPHQL_URL } from './constants.mjs'

import type { GitHubFetchOptions } from './types.mjs'

export type GraphqlRefResponse = {
  data?:
    | {
        repository?:
          | {
              tagRef?:
                | {
                    target?:
                      | {
                          __typename: 'Tag'
                          target?: { oid: string } | undefined
                        }
                      | { __typename: 'Commit'; oid: string }
                      | null
                      | undefined
                  }
                | null
                | undefined
              branchRef?:
                | { target?: { oid: string } | null | undefined }
                | null
                | undefined
              commit?:
                | {
                    __typename?: string | undefined
                    oid?: string | undefined
                  }
                | null
                | undefined
            }
          | null
          | undefined
      }
    | undefined
  errors?: Array<{ message: string }> | undefined
}

/**
 * Resolve a ref through GraphQL, preferring tags, then branches, then commits.
 */
export async function fetchRefShaViaGraphQL(
  owner: string,
  repo: string,
  ref: string,
  options: GitHubFetchOptions,
): Promise<string | undefined> {
  options = { __proto__: null, ...options } as typeof options
  const token = options.token || getGitHubToken()
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'socket-registry-github-client',
    ...options.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  // Resolve all three forms in one query. The `aliasName: ref(...)`
  // syntax assigns each lookup a stable key in the response so we
  // don't have to guess which one matched — we just check each
  // alias in priority order (tag → branch → commit) below.
  const query = `query($owner: String!, $repo: String!, $tag: String!, $branch: String!, $oid: GitObjectID!) {
    repository(owner: $owner, name: $repo) {
      tagRef: ref(qualifiedName: $tag) {
        target {
          __typename
          ... on Tag { target { oid } }
          ... on Commit { oid }
        }
      }
      branchRef: ref(qualifiedName: $branch) {
        target { oid }
      }
      commit: object(oid: $oid) {
        __typename
        ... on Commit { oid }
      }
    }
  }`
  // GraphQL's `oid` argument is a GitObjectID scalar — it must
  // syntactically look like a 40-character hex SHA, or the entire
  // GraphQL query is rejected as malformed BEFORE any resolution
  // happens. If the user passed a tag or branch name (which won't
  // match the SHA shape), we substitute the all-zeros SHA so the
  // query parses. The `commit:` alias then resolves to null (no
  // such commit), and we fall through to the tag/branch results.
  // Without this guard, calling `fetchRefShaViaGraphQL(..., 'main')`
  // would throw a confusing "Argument 'oid' on Field 'object' has
  // an invalid value" error and the tag/branch lookups never run.
  // SHA-detect ternary: ref-as-sha arm fires only when caller passes
  // a hex SHA, which most ref tests don't.
  /* c8 ignore next 2 */
  const looksLikeSha = /^[a-f0-9]{40}$/i.test(ref)
  const oidArg = looksLikeSha ? ref : '0000000000000000000000000000000000000000'
  const response = await httpRequest(GITHUB_GRAPHQL_URL, {
    body: JSONStringify({
      query,
      variables: {
        branch: `refs/heads/${ref}`,
        oid: oidArg,
        owner,
        repo,
        tag: `refs/tags/${ref}`,
      },
    }),
    headers,
    method: 'POST',
  })
  if (!response.ok || response.body.byteLength === 0) {
    // Either GraphQL itself failed with a non-OK status or it ALSO
    // returned an empty body — both backends are degraded. Return
    // undefined so the caller surfaces the original REST error rather
    // than re-throwing here. We deliberately don't recurse to
    // another transport because there isn't a third option.
    return undefined
  }
  let parsed: GraphqlRefResponse
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch {
    return undefined
  }
  const repoData = parsed.data?.repository
  return repoData ? resolveGraphqlRefOid(repoData) : undefined
}

export function resolveGraphqlRefOid(
  repoData: NonNullable<NonNullable<GraphqlRefResponse['data']>['repository']>,
): string | undefined {
  const tagTarget = repoData.tagRef?.target
  if (tagTarget) {
    // GraphQL annotated-tag vs. lightweight-tag/commit cascade. Both
    // arms reachable depending on the ref type, but tests don't always
    // mock both.
    if (tagTarget.__typename === 'Tag') {
      return tagTarget.target?.oid ?? undefined
    }
    if (tagTarget.__typename === 'Commit') {
      return tagTarget.oid ?? undefined
    }
  }
  const branchOid = repoData.branchRef?.target?.oid
  if (branchOid) {
    return branchOid
  }
  // Commit fallback fires only when neither tagRef nor branchRef yields
  // an oid; tests seed at least one of them.
  if (repoData.commit?.__typename === 'Commit' && repoData.commit.oid) {
    return repoData.commit.oid
  }
  return undefined
}
