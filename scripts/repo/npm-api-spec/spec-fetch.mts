/**
 * @file Fetch npm's OpenAPI source at a pinned commit, and cache it.
 *   Everything goes through `api.github.com`, which is the one GitHub host
 *   `.config/fleet/fetch-allowlist.json` grants `fetch` scope to. The contents
 *   API with `Accept: application/vnd.github.raw` hands back the file bytes at
 *   an exact `ref`, so the pinned sha is what is read - never `main`, which
 *   would serve different bytes tomorrow under the same reference.
 *   Every read here FAILS OPEN. A check that hard-fails with no network blocks
 *   every offline build, so a fetch that cannot complete returns undefined and
 *   the caller falls back to the cache, then to the committed inventory, and
 *   says which one it used.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { httpJson, httpText } from '@socketsecurity/lib-stable/http-request'

import {
  digestOf,
  SPEC_BRANCH,
  SPEC_CACHE_DIR,
  SPEC_MERGE_CONFIG_PATH,
  SPEC_REPO,
} from './pin.mts'
import { mergeConfigInputs } from './spec-model.mts'

/**
 * How long a resolved branch head stays fresh. A day: the pin only needs to
 * know whether npm has moved since it was taken, and asking GitHub for that on
 * every check run would burn the unauthenticated rate limit for no new answer.
 */
export const HEAD_TTL_MS = 24 * 60 * 60 * 1000

/**
 * The per-request budget. A slow or hanging GitHub is the same as no network
 * for our purposes, and a check must not sit on it.
 */
export const FETCH_TIMEOUT_MS = 15_000

/**
 * Which cache root a spec-cache read or write is rooted at. Tests point this
 * at a scratch directory.
 */
export interface CacheDirOptions {
  cacheDir?: string | undefined
}

/**
 * A fetched spec, keyed by repo-relative path.
 */
export interface FetchedSpec {
  readonly files: ReadonlyMap<string, string>
  readonly sha: string
}

/**
 * How a spec read is allowed to reach the world. `offline` skips the network
 * entirely, which is what a caller passes when it wants a cache-only answer.
 */
export interface SpecReadOptions {
  cacheDir?: string | undefined
  offline?: boolean | undefined
}

/**
 * How a branch-head read is allowed to reach the world. `refresh` ignores the
 * TTL cache and asks GitHub, which is what the pin refresher passes.
 */
export interface HeadReadOptions {
  cacheDir?: string | undefined
  refresh?: boolean | undefined
}

/**
 * The cache directory holding one commit's files.
 */
export function cacheDirForSha(
  sha: string,
  options?: CacheDirOptions | undefined,
): string {
  const opts = { __proto__: null, ...options } as CacheDirOptions
  return path.join(opts.cacheDir ?? SPEC_CACHE_DIR, sha)
}

/**
 * The cache file for one spec path. The repo-relative path is flattened with
 * `__` rather than mirrored as directories, so the cache is one flat level and
 * a path segment can never escape the cache root.
 */
export function cacheFileFor(
  sha: string,
  specPath: string,
  options?: CacheDirOptions | undefined,
): string {
  const opts = { __proto__: null, ...options } as CacheDirOptions
  return path.join(
    cacheDirForSha(sha, { cacheDir: opts.cacheDir }),
    specPath.replaceAll('/', '__'),
  )
}

/**
 * GET a file from the spec repo at an exact ref, or undefined when the read
 * fails for any reason.
 */
export async function fetchSpecFile(
  specPath: string,
  ref: string,
): Promise<string | undefined> {
  const url = `https://api.github.com/repos/${SPEC_REPO}/contents/${specPath}?ref=${encodeURIComponent(ref)}`
  try {
    return await httpText(url, {
      headers: { Accept: 'application/vnd.github.raw' },
      timeout: FETCH_TIMEOUT_MS,
    })
  } catch {
    return undefined
  }
}

/**
 * The whole spec at `sha`, read from the cache when present and from GitHub
 * otherwise. Returns undefined when the merge manifest cannot be obtained at
 * all, which is the offline case.
 */
export async function loadSpecAt(
  sha: string,
  options?: SpecReadOptions | undefined,
): Promise<FetchedSpec | undefined> {
  const opts = { __proto__: null, ...options } as SpecReadOptions
  const cacheDir = opts.cacheDir ?? SPEC_CACHE_DIR
  const offline = opts.offline === true
  const mergeConfig = await readSpecPath(SPEC_MERGE_CONFIG_PATH, sha, {
    cacheDir,
    offline,
  })
  if (mergeConfig === undefined) {
    return undefined
  }
  const files = new Map<string, string>()
  files.set(SPEC_MERGE_CONFIG_PATH, mergeConfig)
  const inputs = mergeConfigInputs(mergeConfig)
  for (let i = 0, { length } = inputs; i < length; i += 1) {
    const input = inputs[i]!
    // Serial on purpose: unauthenticated api.github.com rate-limits by IP, and
    // a burst of parallel reads is the shape that trips it.
    // eslint-disable-next-line no-await-in-loop -- rate-limit friendly
    const text = await readSpecPath(input, sha, { cacheDir, offline })
    if (text !== undefined) {
      files.set(input, text)
    }
  }
  // A cross-file `$ref` names shared-components, which merge-config does not
  // list because redocly pulls it in transitively.
  const shared = 'api/shared-components.yaml'
  if (!files.has(shared)) {
    const text = await readSpecPath(shared, sha, { cacheDir, offline })
    if (text !== undefined) {
      files.set(shared, text)
    }
  }
  return { files, sha }
}

/**
 * One spec file, from the cache when it is there and from the network when it
 * is not. A successful network read is written to the cache before it is
 * returned.
 */
export async function readSpecPath(
  specPath: string,
  sha: string,
  options?: SpecReadOptions | undefined,
): Promise<string | undefined> {
  const opts = { __proto__: null, ...options } as SpecReadOptions
  const cacheDir = opts.cacheDir ?? SPEC_CACHE_DIR
  const cached = readCachedSpecFile(specPath, sha, { cacheDir })
  if (cached !== undefined) {
    return cached
  }
  if (opts.offline === true) {
    return undefined
  }
  const fetched = await fetchSpecFile(specPath, sha)
  if (fetched === undefined) {
    return undefined
  }
  writeCachedSpecFile(specPath, sha, fetched, { cacheDir })
  return fetched
}

/**
 * A cached spec file, or undefined when it is not cached.
 */
export function readCachedSpecFile(
  specPath: string,
  sha: string,
  options?: CacheDirOptions | undefined,
): string | undefined {
  const opts = { __proto__: null, ...options } as CacheDirOptions
  const file = cacheFileFor(sha, specPath, { cacheDir: opts.cacheDir })
  if (!existsSync(file)) {
    return undefined
  }
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * The commit `main` currently points at, or undefined when GitHub cannot be
 * reached. Cached for {@link HEAD_TTL_MS}; pass `refresh` to ignore the cache.
 */
export async function resolveSpecHead(
  options?: HeadReadOptions | undefined,
): Promise<string | undefined> {
  const opts = { __proto__: null, ...options } as HeadReadOptions
  const cacheDir = opts.cacheDir ?? SPEC_CACHE_DIR
  const headFile = path.join(cacheDir, 'head.json')
  if (opts.refresh !== true) {
    const cached = readHeadCache(headFile)
    if (cached !== undefined) {
      return cached
    }
  }
  const url = `https://api.github.com/repos/${SPEC_REPO}/commits/${SPEC_BRANCH}`
  let sha: string | undefined
  try {
    const body = await httpJson<{ sha?: unknown | undefined }>(url, {
      headers: { Accept: 'application/vnd.github+json' },
      timeout: FETCH_TIMEOUT_MS,
    })
    sha = typeof body.sha === 'string' ? body.sha : undefined
  } catch {
    return undefined
  }
  if (sha) {
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(
      headFile,
      `${JSON.stringify({ readAt: Date.now(), sha }, undefined, 2)}\n`,
    )
  }
  return sha
}

/**
 * The cached branch head when it is still inside the TTL.
 */
export function readHeadCache(headFile: string): string | undefined {
  if (!existsSync(headFile)) {
    return undefined
  }
  try {
    const parsed = JSON.parse(readFileSync(headFile, 'utf8')) as {
      readAt?: unknown | undefined
      sha?: unknown | undefined
    }
    if (
      typeof parsed.sha === 'string' &&
      typeof parsed.readAt === 'number' &&
      Date.now() - parsed.readAt < HEAD_TTL_MS
    ) {
      return parsed.sha
    }
  } catch {
    // A corrupt cache entry is a cache miss, never a failure.
  }
  return undefined
}

/**
 * The `sha256:` digest of every file in a fetched spec, keyed by path. This is
 * what the pin records and what a later fetch is checked against.
 */
export function specFileDigests(
  spec: FetchedSpec,
): Array<{ integrity: string; path: string }> {
  const out: Array<{ integrity: string; path: string }> = []
  const names = [...spec.files.keys()].toSorted()
  for (let i = 0, { length } = names; i < length; i += 1) {
    const name = names[i]!
    out.push({ integrity: digestOf(spec.files.get(name)!), path: name })
  }
  return out
}

/**
 * Digest of the whole spec: every file's path and digest, folded in sorted
 * order. One string that changes whenever any input file's bytes change.
 */
export function specIntegrityOf(spec: FetchedSpec): string {
  const digests = specFileDigests(spec)
  const lines: string[] = []
  for (let i = 0, { length } = digests; i < length; i += 1) {
    lines.push(`${digests[i]!.path} ${digests[i]!.integrity}`)
  }
  return digestOf(lines.join('\n'))
}

/**
 * Paths whose fetched bytes do not hash to what the pin recorded. A non-empty
 * result means the same sha served different bytes, which is a supply-chain
 * signal, not a stale cache.
 */
export function verifyAgainstPin(
  spec: FetchedSpec,
  pinned: ReadonlyArray<{ integrity: string; path: string }>,
): string[] {
  const mismatched: string[] = []
  for (let i = 0, { length } = pinned; i < length; i += 1) {
    const entry = pinned[i]!
    const text = spec.files.get(entry.path)
    if (text === undefined || digestOf(text) !== entry.integrity) {
      mismatched.push(entry.path)
    }
  }
  return mismatched
}

/**
 * Persist one fetched spec file.
 */
export function writeCachedSpecFile(
  specPath: string,
  sha: string,
  text: string,
  options?: CacheDirOptions | undefined,
): void {
  const opts = { __proto__: null, ...options } as CacheDirOptions
  const file = cacheFileFor(sha, specPath, { cacheDir: opts.cacheDir })
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}
