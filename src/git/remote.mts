/**
 * @file Parse a git remote URL into `owner/repo`, and read a checkout's origin.
 */

import { gitSpawn, gitSync } from './exec.mjs'

// Covers `https://host/owner/repo.git`, `git@host:owner/repo.git`, and
// `ssh://git@host/owner/repo`; the owner is bounded by the preceding `:` or `/`.
const OWNER_REPO_RE = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/

const ORIGIN_URL_ARGS = ['remote', 'get-url', 'origin'] as const

export interface OwnerRepo {
  readonly owner: string
  readonly repo: string
}

export interface GitUrlResult {
  // gitSync reports `status`, gitSpawn reports `code`.
  readonly status?: number | null | undefined
  readonly code?: number | undefined
  readonly stdout: string | Buffer | undefined
}

/**
 * Case-preserved `owner/repo` of `dir`'s origin, or undefined.
 */
export async function originOwnerRepo(
  dir: string,
): Promise<string | undefined> {
  const url = await originRemoteUrl(dir)
  return url === undefined ? undefined : ownerRepoFromRemoteUrl(url)
}

export function originOwnerRepoSync(dir: string): string | undefined {
  const url = originRemoteUrlSync(dir)
  return url === undefined ? undefined : ownerRepoFromRemoteUrl(url)
}

/**
 * URL of `dir`'s origin remote, or undefined when there is none.
 */
export async function originRemoteUrl(
  dir: string,
): Promise<string | undefined> {
  return urlFromResult(await gitSpawn([...ORIGIN_URL_ARGS], { cwd: dir }))
}

export function originRemoteUrlSync(dir: string): string | undefined {
  return urlFromResult(gitSync([...ORIGIN_URL_ARGS], { cwd: dir }))
}

/**
 * Lowercased bare repo name of `dir`'s origin, or undefined.
 */
export async function originSlug(dir: string): Promise<string | undefined> {
  const url = await originRemoteUrl(dir)
  return url === undefined ? undefined : slugFromRemoteUrl(url)
}

export function originSlugSync(dir: string): string | undefined {
  const url = originRemoteUrlSync(dir)
  return url === undefined ? undefined : slugFromRemoteUrl(url)
}

/**
 * Case-preserved `owner/repo` of `url`, or undefined when unparseable.
 */
export function ownerRepoFromRemoteUrl(url: string): string | undefined {
  const parts = parseRemoteUrl(url)
  return parts ? `${parts.owner}/${parts.repo}` : undefined
}

/**
 * Owner and repo of `url`, or undefined when it matches no remote shape.
 */
export function parseRemoteUrl(url: string): OwnerRepo | undefined {
  const match = OWNER_REPO_RE.exec(url.trim())
  if (!match) {
    return undefined
  }
  return {
    __proto__: null,
    owner: match[1]!,
    repo: match[2]!,
  } as unknown as OwnerRepo
}

/**
 * Lowercased bare repo name of `url` — GitHub slugs compare case-insensitively.
 */
export function slugFromRemoteUrl(url: string): string | undefined {
  return parseRemoteUrl(url)?.repo.toLowerCase()
}

/**
 * Split an `owner/repo` string, requiring BOTH halves so a bare repo name never
 * reads as a qualified reference.
 */
export function splitOwnerRepo(value: string): OwnerRepo | undefined {
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) {
    return undefined
  }
  const owner = value.slice(0, slash)
  const repo = value.slice(slash + 1)
  return repo.includes('/')
    ? undefined
    : ({ __proto__: null, owner, repo } as unknown as OwnerRepo)
}

/**
 * Trimmed stdout of a successful origin read, or undefined.
 */
export function urlFromResult(result: GitUrlResult): string | undefined {
  const exitCode = result.status ?? result.code
  if (exitCode !== 0) {
    return undefined
  }
  const url = String(result.stdout ?? '').trim()
  return url || undefined
}
