/**
 * @fileoverview Resolve a GitHub git ref via GraphQL.
 *
 * Split out of `github/refs.ts` for size hygiene. The fallback the
 * REST tier-cascade calls when it detects the documented "200 + empty
 * body" incident shape — GraphQL hits a different backend at GitHub
 * (not the same Elasticsearch index as REST listings) and stays
 * consistent through those incidents.
 */

import { httpRequest } from '../http-request/request'

import { JSONParse, JSONStringify } from '../primordials/json'

import { getGitHubToken } from './token'
import { GITHUB_GRAPHQL_URL } from './types'

import type { GitHubFetchOptions } from './types'

/**
 * Resolve a ref to its commit SHA via GraphQL.
 *
 * Why this function exists:
 *   This is the fallback that `fetchRefSha` calls when the REST
 *   tier-cascade detects the "GitHub returned 200 + empty body"
 *   incident shape. GraphQL hits a different backend than REST
 *   listings, so it stays consistent through the kinds of incidents
 *   that produce empty REST responses.
 *
 * What it does:
 *   The REST cascade needs three separate calls (tag, branch,
 *   commit) because REST has no single "resolve any ref" endpoint.
 *   GraphQL DOES — `Repository.ref(qualifiedName)` resolves
 *   tags AND branches by their fully-qualified name, and
 *   `Repository.object(oid)` resolves a raw commit SHA. We bundle
 *   all three into ONE query using GraphQL aliases (`tagRef`,
 *   `branchRef`, `commit`) and pick whichever resolved.
 *
 * Annotated vs lightweight tags:
 *   In Git, a "lightweight tag" is just a name that points directly
 *   at a commit. An "annotated tag" is a separate object (with
 *   tagger info, message, etc.) that itself points at the commit.
 *   GraphQL's `Tag.target` field gives us the commit SHA for
 *   annotated tags in one shot — REST needs a *second* HTTP call
 *   to dereference. The `... on Tag { target { oid } }` /
 *   `... on Commit { oid }` inline-fragments handle both shapes.
 *
 * Return contract:
 *   - Returns the SHA string when any form matches.
 *   - Returns `undefined` when the ref genuinely doesn't exist as a
 *     tag, branch, OR commit. The caller treats `undefined` the same
 *     as "REST cascade also failed" — a real "ref not found".
 *   - Returns `undefined` (not throws) on transport-level failures too:
 *     non-OK HTTP, empty GraphQL body, or JSON parse error. The
 *     REST cascade's "ref not found" message is more useful to the
 *     end user than a GraphQL transport error.
 */
export async function fetchRefShaViaGraphQL(
  owner: string,
  repo: string,
  ref: string,
  options: GitHubFetchOptions,
): Promise<string | undefined> {
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
    // Either GraphQL itself failed (non-OK status) or it ALSO
    // returned an empty body — both backends are degraded. Return
    // undefined so the caller surfaces the original REST error rather
    // than re-throwing here. We deliberately don't recurse to
    // another transport because there isn't a third option.
    return undefined
  }
  let parsed: {
    data?: {
      repository?: {
        tagRef?: {
          target?:
            | { __typename: 'Tag'; target?: { oid: string } }
            | { __typename: 'Commit'; oid: string }
            | null
        } | null
        branchRef?: { target?: { oid: string } | null } | null
        commit?: { __typename?: string; oid?: string } | null
      } | null
    }
    errors?: Array<{ message: string }>
  }
  try {
    parsed = JSONParse(response.body.toString('utf8'))
  } catch {
    return undefined
  }
  // GraphQL has two ways of saying "no":
  //
  //   1. The aliased field comes back as `null` (e.g.
  //      `tagRef: null`). This is GraphQL's normal way of saying
  //      "the lookup ran but found nothing." It is NOT in the
  //      response's `errors[]` array — it's just a null in `data`.
  //   2. A genuine error (malformed query, repo doesn't exist,
  //      auth missing) shows up in the top-level `errors[]` array.
  //
  // For form-level "not found" we want behavior #1 — keep walking
  // the alias list. We only treat `errors[]` as a hard failure if
  // the entire `data.repository` came back null (e.g. wrong owner
  // / repo / private and we're unauthenticated).
  //
  // Walk the aliases in the SAME priority order as the REST
  // cascade (tag → branch → commit) so the function's behavior is
  // identical to REST when both backends return data.
  const repoData = parsed.data?.repository
  // Defensive: GraphQL endpoint always returns repository for a valid query.
  /* c8 ignore start */
  if (!repoData) {
    return undefined
  }
  /* c8 ignore stop */
  const tagTarget = repoData.tagRef?.target
  if (tagTarget) {
    // GraphQL annotated-tag vs. lightweight-tag/commit cascade. Both
    // arms reachable depending on the ref type, but tests don't always
    // mock both.
    /* c8 ignore start */
    if (tagTarget.__typename === 'Tag') {
      return tagTarget.target?.oid ?? undefined
    }
    if (tagTarget.__typename === 'Commit') {
      return tagTarget.oid ?? undefined
    }
    /* c8 ignore stop */
  }
  const branchOid = repoData.branchRef?.target?.oid
  if (branchOid) {
    return branchOid
  }
  // Commit fallback fires only when neither tagRef nor branchRef yields
  // an oid; tests seed at least one of them.
  /* c8 ignore start */
  if (repoData.commit?.__typename === 'Commit' && repoData.commit.oid) {
    return repoData.commit.oid
  }
  return undefined
  /* c8 ignore stop */
}
