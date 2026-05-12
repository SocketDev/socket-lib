/**
 * @fileoverview Named errors thrown by `github/*` helpers.
 */

/**
 * Thrown by `fetchGitHub` when GitHub returns HTTP 200 OK with a
 * zero-byte body — the "successful empty response" pattern.
 *
 * Why this exists (background for new contributors):
 *   GitHub's REST API has a documented failure mode that is *very*
 *   easy to miss in code review. During incidents where the search
 *   / Elasticsearch backing index is degraded (see GitHub status
 *   pages with titles like "search is degraded" or "Pull Requests
 *   degraded"), the REST `/repos/...` GET endpoints return:
 *     - HTTP status: 200 OK   ← looks like success
 *     - Body:        ""       ← but the payload is empty
 *     - Headers:     no Retry-After, no rate-limit signal, nothing
 *
 *   Without a typed error, calling code does
 *     `JSON.parse(response.body.toString('utf8'))`
 *   on an empty string, which throws a confusing
 *   `SyntaxError: Unexpected end of JSON input`. That error has
 *   nothing to do with bad code on our side; it's GitHub's incident
 *   manifesting as a parse failure several frames deep. We surface
 *   the actual condition (`200 + empty body`) as its own typed
 *   exception so the call path can either fall through to the
 *   GraphQL backend (which queries a different data path and uses
 *   a different backend and is unaffected by ES outages), or surface
 *   a clean message to the user.
 *
 *   The HTTP status is hard-coded to 200 because that's *exactly*
 *   what makes this insidious — a real 4xx/5xx would already be
 *   handled by the rate-limit / status-code branch above.
 */
export class GitHubEmptyBodyError extends Error {
  /** HTTP status (always 200 — that's what makes this case insidious). */
  status: number
  constructor(url: string) {
    // Library-API error: terse and stable so callers can switch on
    // .name / instanceof without parsing the message. The verbose
    // background ("documented incident shape", status URL) lives in
    // the JSDoc above the class declaration.
    super(`GitHub API returned HTTP 200 with empty body: ${url}`)
    this.name = 'GitHubEmptyBodyError'
    this.status = 200
  }
}
