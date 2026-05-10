/**
 * @fileoverview Public type surface for `github/*` modules — interfaces,
 * named errors, and the API base-URL constants. Pure types and small
 * value constants only; no I/O or runtime side effects so this module
 * stays cheap to import everywhere.
 */

/**
 * GitHub API base URL constant. Inlined so the value is captured at
 * coverage-mode bundle time rather than referenced through a module
 * graph indirection.
 */
export const GITHUB_API_BASE_URL = 'https://api.github.com'

export const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'

/**
 * Default TTL for the GitHub cache (5 minutes). Used by ref resolution
 * and the GHSA cache layer.
 */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

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
 *   nothing to do with our code — but it's the only signal upstream
 *   sees. This class wraps that case in a *named* error so callers
 *   can `instanceof GitHubEmptyBodyError` and choose what to do:
 *   retry the same endpoint later, fall back to GraphQL (which uses
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

/**
 * Options for GitHub API fetch requests.
 */
export interface GitHubFetchOptions {
  /**
   * GitHub authentication token.
   * If not provided, will attempt to use token from environment variables.
   */
  token?: string | undefined
  /**
   * Additional HTTP headers to include in the request.
   * Will be merged with default headers (Accept, User-Agent, Authorization).
   */
  headers?: Record<string, string> | undefined
}

/**
 * Error thrown when GitHub API rate limit is exceeded.
 * Extends the standard Error with additional rate limit information.
 */
export interface GitHubRateLimitError extends Error {
  /** HTTP status code (always 403 for rate limit errors) */
  status: number
  /**
   * Date when the rate limit will reset.
   * Undefined if reset time is not available in response headers.
   */
  resetTime?: Date | undefined
}

/**
 * GitHub ref object returned by the API.
 * Represents a git reference (tag or branch).
 */
export interface GitHubRef {
  /** The object this ref points to */
  object: {
    /** SHA of the commit or tag object */
    sha: string
    /** Type of object ('commit' or 'tag') */
    type: string
    /** API URL to fetch the full object details */
    url: string
  }
  /** Full ref path (e.g., 'refs/tags/v1.0.0' or 'refs/heads/main') */
  ref: string
  /** API URL for this ref */
  url: string
}

/**
 * GitHub annotated tag object returned by the API.
 * Represents a git tag with metadata.
 */
export interface GitHubTag {
  /** Tag annotation message */
  message: string
  /** The commit this tag points to */
  object: {
    /** SHA of the commit */
    sha: string
    /** Type of object (usually 'commit') */
    type: string
    /** API URL to fetch the commit details */
    url: string
  }
  /** SHA of this tag object itself */
  sha: string
  /** Tag name (e.g., 'v1.0.0') */
  tag: string
  /**
   * Information about who created the tag.
   * Undefined for lightweight tags.
   */
  tagger?: {
    /** Tag creation date in ISO 8601 format */
    date: string
    /** Tagger's email address */
    email: string
    /** Tagger's name */
    name: string
  }
  /** API URL for this tag object */
  url: string
}

/**
 * GitHub commit object returned by the API.
 * Represents a git commit with metadata.
 */
export interface GitHubCommit {
  /** Full commit SHA */
  sha: string
  /** API URL for this commit */
  url: string
  /** Commit details */
  commit: {
    /** Commit message */
    message: string
    /** Author information */
    author: {
      /** Commit author date in ISO 8601 format */
      date: string
      /** Author's email address */
      email: string
      /** Author's name */
      name: string
    }
  }
}

/**
 * Options for resolving git refs to commit SHAs.
 */
export interface ResolveRefOptions {
  /**
   * GitHub authentication token.
   * If not provided, will attempt to use token from environment variables.
   */
  token?: string | undefined
}

/**
 * GitHub Security Advisory (GHSA) details.
 * Represents a complete security advisory from GitHub's database.
 */
export interface GhsaDetails {
  /** GHSA identifier (e.g., 'GHSA-xxxx-yyyy-zzzz') */
  ghsaId: string
  /** Short summary of the vulnerability */
  summary: string
  /** Detailed description of the vulnerability */
  details: string
  /** Severity level ('low', 'moderate', 'high', 'critical') */
  severity: string
  /** Alternative identifiers (CVE IDs, etc.) */
  aliases: string[]
  /** ISO 8601 timestamp when advisory was published */
  publishedAt: string
  /** ISO 8601 timestamp when advisory was last updated */
  updatedAt: string
  /**
   * ISO 8601 timestamp when advisory was withdrawn.
   * `null` if advisory is still active.
   */
  withdrawnAt: string | null
  /** External reference URLs for more information */
  references: Array<{ url: string }>
  /** Affected packages and version ranges */
  vulnerabilities: Array<{
    /** Package information */
    package: {
      /** Ecosystem (e.g., 'npm', 'pip', 'maven') */
      ecosystem: string
      /** Package name */
      name: string
    }
    /** Version range expression for vulnerable versions */
    vulnerableVersionRange: string
    /**
     * First patched version that fixes the vulnerability.
     * `null` if no patched version exists yet.
     */
    firstPatchedVersion: { identifier: string } | null
  }>
  /**
   * CVSS (Common Vulnerability Scoring System) information.
   * `null` if CVSS score is not available.
   */
  cvss: {
    /** CVSS score (0.0-10.0) */
    score: number
    /** CVSS vector string describing the vulnerability characteristics */
    vectorString: string
  } | null
  /** CWE (Common Weakness Enumeration) categories */
  cwes: Array<{
    /** CWE identifier (e.g., 'CWE-79') */
    cweId: string
    /** Human-readable CWE name */
    name: string
    /** Description of the weakness category */
    description: string
  }>
}
