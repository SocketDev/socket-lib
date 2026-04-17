/**
 * @fileoverview GitHub Actions environment variable getters.
 * Provides access to GitHub Actions CI/CD environment variables.
 */

import { getEnvValue } from './rewire'

/**
 * GH_TOKEN environment variable.
 * Alternative GitHub authentication token for API access (used by GitHub CLI).
 *
 * @returns The GH CLI token, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getGhToken } from '@socketsecurity/lib/env/github'
 *
 * const token = getGhToken()
 * // e.g. 'gho_abc123...' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGhToken(): string | undefined {
  return getEnvValue('GH_TOKEN')
}

/**
 * GITHUB_API_URL environment variable.
 * GitHub API URL (e.g., https://api.github.com).
 *
 * @returns The GitHub API URL, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getGithubApiUrl } from '@socketsecurity/lib/env/github'
 *
 * const apiUrl = getGithubApiUrl()
 * // e.g. 'https://api.github.com' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGithubApiUrl(): string | undefined {
  return getEnvValue('GITHUB_API_URL')
}

/**
 * GITHUB_BASE_REF environment variable.
 * GitHub pull request base branch.
 *
 * @returns The pull request base branch name, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getGithubBaseRef } from '@socketsecurity/lib/env/github'
 *
 * const baseRef = getGithubBaseRef()
 * // e.g. 'main' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGithubBaseRef(): string | undefined {
  return getEnvValue('GITHUB_BASE_REF')
}

/**
 * GITHUB_REF_NAME environment variable.
 * GitHub branch or tag name.
 *
 * @returns The branch or tag name, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getGithubRefName } from '@socketsecurity/lib/env/github'
 *
 * const refName = getGithubRefName()
 * // e.g. 'feature/my-branch' or 'v1.0.0'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGithubRefName(): string | undefined {
  return getEnvValue('GITHUB_REF_NAME')
}

/**
 * GITHUB_REF_TYPE environment variable.
 * GitHub ref type (branch or tag).
 *
 * @returns The ref type ('branch' or 'tag'), or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getGithubRefType } from '@socketsecurity/lib/env/github'
 *
 * const refType = getGithubRefType()
 * // e.g. 'branch' or 'tag'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGithubRefType(): string | undefined {
  return getEnvValue('GITHUB_REF_TYPE')
}

/**
 * GITHUB_REPOSITORY environment variable.
 * GitHub repository name in owner/repo format.
 *
 * @returns The repository name, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getGithubRepository } from '@socketsecurity/lib/env/github'
 *
 * const repo = getGithubRepository()
 * // e.g. 'SocketDev/socket-cli' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGithubRepository(): string | undefined {
  return getEnvValue('GITHUB_REPOSITORY')
}

/**
 * GITHUB_SERVER_URL environment variable.
 * GitHub server URL (e.g., https://github.com).
 *
 * @returns The GitHub server URL, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getGithubServerUrl } from '@socketsecurity/lib/env/github'
 *
 * const serverUrl = getGithubServerUrl()
 * // e.g. 'https://github.com' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGithubServerUrl(): string | undefined {
  return getEnvValue('GITHUB_SERVER_URL')
}

/**
 * GITHUB_TOKEN environment variable.
 * GitHub authentication token for API access.
 *
 * @returns The GitHub token, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getGithubToken } from '@socketsecurity/lib/env/github'
 *
 * const token = getGithubToken()
 * // e.g. 'ghp_abc123...' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getGithubToken(): string | undefined {
  return getEnvValue('GITHUB_TOKEN')
}
