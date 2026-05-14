/**
 * @fileoverview `resolveBazelVersion({ cwd })` — picks the Bazel
 * version to run for a project, matching the bazelisk precedence:
 *
 *   1. `USE_BAZEL_VERSION` env var
 *   2. `.bazelversion` walking up from `cwd`
 *   3. Fallback to the latest stable release queried from GitHub
 *      Releases (via socket-lib's `getLatestRelease`, which already
 *      handles GH_TOKEN auth, retry, and the REST/GraphQL fallback).
 *
 * Returns `undefined` only if both steps 2 and 3 fail with no env
 * override — in that case the caller surfaces an actionable error.
 */

import process from 'node:process'

import { getLatestRelease } from '../../releases/github-listing'
import { readBazelVersionFile } from './read-bazel-version-file'

export interface ResolveBazelVersionOptions {
  /** Working directory to walk up from for `.bazelversion`. */
  readonly cwd?: string | undefined
}

export async function resolveBazelVersion(
  options?: ResolveBazelVersionOptions | undefined,
): Promise<string | undefined> {
  const cwd = options?.cwd ?? process.cwd()

  const envOverride = process.env['USE_BAZEL_VERSION']
  if (envOverride && envOverride.length > 0) {
    return envOverride
  }

  const fromFile = await readBazelVersionFile(cwd)
  if (fromFile) {
    return fromFile
  }

  // `getLatestRelease` returns the tag (which for Bazel is the plain
  // version number, e.g. `7.4.0`). It already retries on rate-limit
  // and falls back from REST to GraphQL during GitHub incidents.
  /* c8 ignore start - network fallback; covered by integration tests. */
  const latest = await getLatestRelease(
    '',
    { owner: 'bazelbuild', repo: 'bazel' },
    { nothrow: true },
  )
  return latest ?? undefined
  /* c8 ignore stop */
}
