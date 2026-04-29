/**
 * @fileoverview GitHub API authentication header helpers.
 */

import process from 'node:process'

/**
 * Get GitHub authentication headers if token is available.
 * Checks GH_TOKEN or GITHUB_TOKEN environment variables.
 *
 * @returns Headers object with Authorization header if token exists.
 *
 * @example
 * ```typescript
 * const headers = getAuthHeaders()
 * // { Accept: 'application/vnd.github+json', Authorization: 'Bearer ...' }
 * ```
 */
export function getAuthHeaders(): Record<string, string> {
  const token = process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN']
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}
