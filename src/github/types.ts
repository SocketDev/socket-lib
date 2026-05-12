/**
 * @fileoverview Public type surface for `github/*` modules — pure
 * interfaces. No I/O or runtime side effects so this module stays
 * cheap to import everywhere. Constants live in `./constants`,
 * named errors in `./errors`.
 */

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
