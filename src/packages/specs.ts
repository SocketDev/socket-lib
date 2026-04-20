/**
 * @fileoverview Package spec parsing and GitHub URL utilities.
 */

import npmPackageArg from '../external/npm-package-arg'

import { isObjectObject } from '../objects'
import { isNonEmptyString } from '../strings'

/**
 * Extract user and project from GitHub repository URL.
 *
 * @example
 * ```typescript
 * getRepoUrlDetails('https://github.com/lodash/lodash.git')
 * // { user: 'lodash', project: 'lodash' }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getRepoUrlDetails(repoUrl: string = ''): {
  user: string
  project: string
} {
  // Anchor the host to exactly `github.com` (optionally preceded by
  // userinfo like `user@`). Escaping the `.` blocks lookalikes like
  // `githubXcom`; pinning the host to the full final label blocks
  // `fake-github.com` or `github.com.attacker.tld` shenanigans. The
  // scheme class allows `+` so npm's canonical `git+https://…` and
  // `git+ssh://…` forms from package.json `repository.url` match.
  // Callers passing scp-style git@github.com:… need to normalize
  // upstream; we require `://` here so the host is unambiguous.
  const match =
    /^(?:[a-z][a-z+]*:\/\/)(?:[^/@]+@)?github\.com\/([^?#]+)(?:[?#]|$)/i.exec(
      repoUrl,
    )
  if (!match || !match[1]) {
    return { user: '', project: '' }
  }
  const userAndRepo = match[1].split('/')
  const user = userAndRepo[0] || ''
  const rawProject = userAndRepo[1] ?? ''
  const project = rawProject.endsWith('.git')
    ? rawProject.slice(0, -4)
    : rawProject
  return { user, project }
}

/**
 * Generate GitHub API URL for a tag reference.
 *
 * @example
 * ```typescript
 * gitHubTagRefUrl('lodash', 'lodash', 'v4.17.21')
 * // 'https://api.github.com/repos/lodash/lodash/git/ref/tags/v4.17.21'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function gitHubTagRefUrl(
  user: string,
  project: string,
  tag: string,
): string {
  return `https://api.github.com/repos/${user}/${project}/git/ref/tags/${tag}`
}

/**
 * Generate GitHub tarball download URL for a commit SHA.
 *
 * @example
 * ```typescript
 * gitHubTgzUrl('lodash', 'lodash', 'abc123')
 * // 'https://github.com/lodash/lodash/archive/abc123.tar.gz'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function gitHubTgzUrl(
  user: string,
  project: string,
  sha: string,
): string {
  return `https://github.com/${user}/${project}/archive/${sha}.tar.gz`
}

/**
 * Check if a package specifier is a GitHub tarball URL.
 *
 * @example
 * ```typescript
 * isGitHubTgzSpec('https://github.com/user/repo/archive/abc123.tar.gz') // true
 * isGitHubTgzSpec('lodash@4.17.21')                                     // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isGitHubTgzSpec(spec: unknown, where?: string): boolean {
  let parsedSpec: unknown
  if (isObjectObject(spec)) {
    parsedSpec = spec
  } else {
    // module is imported at the top
    parsedSpec = npmPackageArg(spec as string, where)
  }
  const typedSpec = parsedSpec as { type?: string; saveSpec?: string }
  return (
    typedSpec.type === 'remote' && !!typedSpec.saveSpec?.endsWith('.tar.gz')
  )
}

/**
 * Check if a package specifier is a GitHub URL with committish.
 *
 * @example
 * ```typescript
 * isGitHubUrlSpec('github:user/repo#v1.0.0') // true
 * isGitHubUrlSpec('lodash@4.17.21')           // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isGitHubUrlSpec(spec: unknown, where?: string): boolean {
  let parsedSpec: unknown
  if (isObjectObject(spec)) {
    parsedSpec = spec
  } else {
    // module is imported at the top
    parsedSpec = npmPackageArg(spec as string, where)
  }
  const typedSpec = parsedSpec as {
    gitCommittish?: string
    hosted?: { domain?: string }
    type?: string
  }
  return (
    typedSpec.type === 'git' &&
    typedSpec.hosted?.domain === 'github.com' &&
    isNonEmptyString(typedSpec.gitCommittish)
  )
}
