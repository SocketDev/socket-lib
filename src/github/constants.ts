/**
 * @fileoverview GitHub API URL + cache-TTL constants. Inlined so values
 * are captured at coverage-mode bundle time rather than referenced
 * through a module graph indirection.
 */

/**
 * GitHub REST API base URL.
 */
export const GITHUB_API_BASE_URL = 'https://api.github.com'

/**
 * GitHub GraphQL API endpoint.
 */
export const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'

/**
 * Default TTL for the GitHub cache (5 minutes). Used by ref resolution
 * and the GHSA cache layer.
 */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
