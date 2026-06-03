/**
 * @file Package spec parsing, name resolution, and GitHub URL utilities.
 */

import { REGISTRY_SCOPE_DELIMITER } from '../constants/socket'
// @ts-expect-error - external vendored module
import { PackageURL } from '../external/@socketregistry/packageurl-js'
import npmPackageArg from '../external/npm-package-arg'

import { isPlainObject } from '../objects/predicates'
import { getSmolPurl } from '../smol/purl'
import { isNonEmptyString } from '../strings/predicates'

import {
  StringPrototypeCharCodeAt,
  StringPrototypeEndsWith,
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../primordials/string'
/**
 * Get the release tag for a version.
 *
 * @example
 *   ;```typescript
 *   getReleaseTag('lodash@latest') // 'latest'
 *   getReleaseTag('@scope/pkg@beta') // 'beta'
 *   getReleaseTag('lodash') // ''
 *   ```
 */
export function getReleaseTag(spec: string): string {
  if (!spec) {
    return ''
  }
  // Handle scoped packages like @scope/package vs @scope/package@tag.
  let atIndex = -1
  if (StringPrototypeStartsWith(spec, '@')) {
    // Find the second @ for scoped packages.
    atIndex = StringPrototypeIndexOf(spec, '@', 1)
  } else {
    // Find the first @ for unscoped packages.
    atIndex = StringPrototypeIndexOf(spec, '@')
  }
  if (atIndex !== -1) {
    return StringPrototypeSlice(spec, atIndex + 1)
  }
  return ''
}

/**
 * Extract user and project from GitHub repository URL.
 *
 * @example
 *   ;```typescript
 *   getRepoUrlDetails('https://github.com/lodash/lodash.git')
 *   // { user: 'lodash', project: 'lodash' }
 *   ```
 */
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
    /^(?:[a-z][a-z+]*:\/\/)(?:[^/@]+@)?github\.com\/([^?#]+)(?:$|[?#])/i.exec(
      repoUrl,
    )
  if (!match || !match[1]) {
    return { user: '', project: '' }
  }
  const userAndRepo = match[1].split('/')
  const user = userAndRepo[0] || ''
  const rawProject = userAndRepo[1] ?? ''
  const project = StringPrototypeEndsWith(rawProject, '.git')
    ? rawProject.slice(0, -4)
    : rawProject
  return { user, project }
}

/**
 * Generate GitHub API URL for a tag reference.
 *
 * @example
 *   ;```typescript
 *   gitHubTagRefUrl('lodash', 'lodash', 'v4.17.21')
 *   // 'https://api.github.com/repos/lodash/lodash/git/ref/tags/v4.17.21'
 *   ```
 */
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
 *   ;```typescript
 *   gitHubTgzUrl('lodash', 'lodash', 'abc123')
 *   // 'https://github.com/lodash/lodash/archive/abc123.tar.gz'
 *   ```
 */
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
 *   ;```typescript
 *   isGitHubTgzSpec('https://github.com/user/repo/archive/abc123.tar.gz') // true
 *   isGitHubTgzSpec('lodash@4.17.21') // false
 *   ```
 */
export function isGitHubTgzSpec(spec: unknown, where?: string): boolean {
  let parsedSpec: unknown
  if (isPlainObject(spec)) {
    parsedSpec = spec
  } else {
    // module is imported at the top
    parsedSpec = npmPackageArg(spec as string, where)
  }
  const typedSpec = parsedSpec as {
    type?: string | undefined
    saveSpec?: string | undefined
  }
  return (
    typedSpec.type === 'remote' && !!typedSpec.saveSpec?.endsWith('.tar.gz')
  )
}

/**
 * Check if a package specifier is a GitHub URL with committish.
 *
 * @example
 *   ;```typescript
 *   isGitHubUrlSpec('github:user/repo#v1.0.0') // true
 *   isGitHubUrlSpec('lodash@4.17.21') // false
 *   ```
 */
export function isGitHubUrlSpec(spec: unknown, where?: string): boolean {
  let parsedSpec: unknown
  if (isPlainObject(spec)) {
    parsedSpec = spec
  } else {
    // module is imported at the top
    parsedSpec = npmPackageArg(spec as string, where)
  }
  const typedSpec = parsedSpec as {
    gitCommittish?: string | undefined
    hosted?: { domain?: string | undefined } | undefined
    type?: string | undefined
  }
  return (
    typedSpec.type === 'git' &&
    typedSpec.hosted?.domain === 'github.com' &&
    isNonEmptyString(typedSpec.gitCommittish)
  )
}

/**
 * Slugify an npm package name into a hyphenated identifier suitable for
 * User-Agent tokens, log namespaces, file paths, and other contexts where `@`
 * and `/` are not welcome.
 *
 * @example
 *   ;```typescript
 *   pkgNameToSlug('@socketsecurity/lib') // 'socketsecurity-lib'
 *   pkgNameToSlug('@cyclonedx/cdxgen') // 'cyclonedx-cdxgen'
 *   pkgNameToSlug('lodash') // 'lodash'
 *   ```
 */
export function pkgNameToSlug(pkgName: string): string {
  return StringPrototypeCharCodeAt(pkgName, 0) === 64 /* '@' */
    ? `${pkgName.slice(1).replace('/', '-')}`
    : pkgName
}

/**
 * Resolve full package name from a PURL object with custom delimiter.
 *
 * @example
 *   ;```typescript
 *   resolvePackageName({ name: 'core', namespace: '@babel' }) // '@babel/core'
 *   resolvePackageName({ name: 'lodash' }) // 'lodash'
 *   ```
 */
export function resolvePackageName(
  purlObj: { name: string; namespace?: string | undefined },
  delimiter: string = '/',
): string {
  const { name, namespace } = purlObj
  return `${namespace ? `${namespace}${delimiter}` : ''}${name}`
}

/**
 * Convert npm package name to Socket registry format with delimiter.
 *
 * @example
 *   ;```typescript
 *   resolveRegistryPackageName('@babel/core') // 'babel__core'
 *   resolveRegistryPackageName('lodash') // 'lodash'
 *   ```
 */
export function resolveRegistryPackageName(pkgName: string): string {
  const input = `pkg:npm/${pkgName}`
  // Prefer node:smol-purl on the smol binary (C++-accelerated, with
  // a 10 000-entry result cache); fall back to packageurl-js JS impl.
  const smolPurl = getSmolPurl()
  const purlObj = smolPurl
    ? smolPurl.parse(input)
    : PackageURL.fromString(input)
  return purlObj.namespace
    ? `${purlObj.namespace.slice(1)}${REGISTRY_SCOPE_DELIMITER}${purlObj.name}`
    : pkgName
}
