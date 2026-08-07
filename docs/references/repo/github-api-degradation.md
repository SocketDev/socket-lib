# Working around a degraded GitHub API

Two functions in `src/` carry unusual-looking fallback logic because GitHub's
REST API has a failure mode that does not look like a failure. This note
records why the code is shaped the way it is.

## The failure mode

During a GitHub Elasticsearch incident, REST returns **200 OK with a zero-byte
body**. The status line says success and the payload is empty, so any code that
trusts the status code concludes "this resource does not exist" and proceeds
confidently with the wrong answer.

That is worse than an error. A 500 would retry; a silent empty body gets
recorded as a real negative.

## `getReleaseAssetUrl`: cross-check with GraphQL

On a 200-with-empty-body, the code cross-checks via GraphQL
`repository.release(tagName)`. GraphQL runs on a different backend, so when
REST is degraded GraphQL is usually still serving the same data.

The two transports expose the same asset data with one field-name difference,
`downloadUrl` versus `browser_download_url`, which
`fetchReleaseAssetsViaGraphQL` normalizes. After normalization both paths rejoin
the same asset matcher, so the rest of the function never learns which transport
produced the list.

The fallback has three outcomes, and they are deliberately different:

| GraphQL result  | What it means                         | What the code does                                                                            |
| --------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| Assets returned | REST was degraded, GraphQL is healthy | Continue matching as normal                                                                   |
| `undefined`     | No release with that tag exists       | Throw a clear error, so a genuinely missing tag is not masked as a transient                  |
| GraphQL throws  | Both transports are unhappy           | Let `pRetry` retry the whole call, REST included, so we get backoff rather than a blind error |

## `resolveRef`: the tier cascade

A caller hands us a string `ref` without saying what kind it is. It might be a
tag (`v1.2.3`), a branch (`main`), or a raw commit SHA. REST has three separate
endpoints for those and no single "resolve any ref" endpoint, so the code tries
each in order - tag first as the most common, then branch, then commit. The
first 200 wins.

### Why empty-body is tracked separately from 404

A real 404 means "this tier did not match, keep walking". `v1.2.3` is not a
branch, so the `heads/v1.2.3` lookup 404s and the cascade moves on. That is
normal.

A `GitHubEmptyBodyError` means something different: GitHub is degraded, and even
a real match would come back looking absent. Continuing the cascade in that
state just multiplies wasted calls, fails all three tiers, and then either gives
up or falls back anyway.

Recording the signal in `sawEmptyBody` lets the code finish the cascade and then
make a single GraphQL call that resolves all three ref forms at once on a
different backend.

### A naming wart

The `note404` parameter really tracks "what kind of error we just caught", not
strictly a 404. The name reads correctly from the caller's point of view, where
the meaning is "this tier did not match", but it is imprecise. Renaming would
touch every catch site for limited benefit, so it stays.
