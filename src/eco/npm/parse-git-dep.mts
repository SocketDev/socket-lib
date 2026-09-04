/**
 * @file `parseGitDep(spec)` — recognize a git dependency in any npm-ecosystem
 *   spelling: npm, yarn classic, yarn berry, bun, vlt (strings) and pnpm
 *   (a `{ type: 'git', repo, commit }` resolution object).
 */

import {
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../../primordials/string.mjs'

export interface GitDep {
  readonly url: string
  readonly commit: string | undefined
}

export interface GitResolutionLike {
  readonly type?: string | undefined
  readonly repo?: string | undefined
  readonly commit?: string | undefined
  readonly tarball?: string | undefined
}

const COMMIT_PARAM = 'commit='

const GIT_PROTOCOLS = ['git+', 'git://']

// Shorthands that are git by definition, so no `.git` suffix is required.
const HOST_SHORTHANDS = [
  'bitbucket+',
  'bitbucket:',
  'gist:',
  'github:',
  'gitlab:',
]

const URL_PROTOCOLS = ['http://', 'https://', 'ssh://']

// The `.git` suffix is what keeps a registry tarball URL from matching here.
export function isDotGitUrl(base: string): boolean {
  return (
    startsWithAny(base, URL_PROTOCOLS) &&
    (base.endsWith('.git') || base.endsWith('.git/'))
  )
}

/**
 * Scp-like `git@host:owner/repo`, which carries no protocol at all.
 */
export function isScpLike(base: string): boolean {
  const at = StringPrototypeIndexOf(base, '@')
  if (at <= 0) {
    return false
  }
  const colon = StringPrototypeIndexOf(base, ':')
  return colon > at && StringPrototypeIndexOf(base, '//') === -1
}

/**
 * Returns undefined when the input is not a git source, so a registry tarball
 * never reads as one.
 */
export function parseGitDep(
  spec: string | GitResolutionLike | undefined | null,
): GitDep | undefined {
  if (typeof spec === 'string') {
    return parseGitString(spec)
  }
  if (!spec || typeof spec !== 'object') {
    return undefined
  }
  if (spec.type !== 'git' || !spec.repo) {
    return undefined
  }
  return {
    __proto__: null,
    url: spec.repo,
    commit: spec.commit || undefined,
  } as unknown as GitDep
}

export function parseGitString(spec: string): GitDep | undefined {
  const trimmed = spec.trim()
  if (!trimmed) {
    return undefined
  }
  const hash = StringPrototypeIndexOf(trimmed, '#')
  const base = hash === -1 ? trimmed : StringPrototypeSlice(trimmed, 0, hash)
  const fragment = hash === -1 ? '' : StringPrototypeSlice(trimmed, hash + 1)

  if (
    !startsWithAny(base, GIT_PROTOCOLS) &&
    !startsWithAny(base, HOST_SHORTHANDS) &&
    !isDotGitUrl(base) &&
    !isScpLike(base)
  ) {
    return undefined
  }
  return {
    __proto__: null,
    url: base,
    commit: refFromFragment(fragment),
  } as unknown as GitDep
}

/**
 * Berry writes `#commit=<sha>`; everyone else writes a bare `#<ref>`.
 */
export function refFromFragment(fragment: string): string | undefined {
  if (!fragment) {
    return undefined
  }
  const parts = fragment.split('&')
  for (let i = 0, { length } = parts; i < length; i += 1) {
    const part = parts[i]!
    if (StringPrototypeStartsWith(part, COMMIT_PARAM)) {
      return StringPrototypeSlice(part, COMMIT_PARAM.length) || undefined
    }
  }
  return StringPrototypeIndexOf(fragment, '=') === -1 ? fragment : undefined
}

export function startsWithAny(
  value: string,
  prefixes: readonly string[],
): boolean {
  for (let i = 0, { length } = prefixes; i < length; i += 1) {
    if (StringPrototypeStartsWith(value, prefixes[i]!)) {
      return true
    }
  }
  return false
}
