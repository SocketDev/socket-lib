/**
 * @file Offline tests for packages/fetch. The sibling `fetch.test.mts` is
 *   network-only and skips on a normal run, which leaves the paths that never
 *   touch GitHub unchecked - and those are the ones that decide whether a
 *   request happens at all. Each case here stops before the API call: a
 *   manifest that cannot be read, a spec that is already a tarball URL, and a
 *   manifest with no repository to resolve against.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import {
  getFetcher,
  resolveGitHubTgzUrl,
} from '../../../src/packages/fetch.mjs'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

function tmpDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'packages-fetch-'))
  tmpDirs.push(dir)
  return dir
}

// A manifest with no `repository`, so resolution stops before any request.
const NO_REPO_MANIFEST = { name: '@example/package', version: '1.0.0' }

describe('getFetcher', () => {
  it('answers a callable fetcher', () => {
    expect(typeof getFetcher()).toBe('function')
  })

  it('memoizes, so the shared cache is not rebuilt per call', () => {
    // A fresh fetcher per call would drop the make-fetch-happen cache and
    // turn every repeat lookup back into a network round trip.
    const first = getFetcher()
    const second = getFetcher()
    expect(first).toBe(second)
  })
})

describe('resolveGitHubTgzUrl with a manifest object', () => {
  it('answers empty when the manifest names no repository', async () => {
    // With no user/project there is nothing to ask GitHub about.
    expect(
      await resolveGitHubTgzUrl('@example/package', NO_REPO_MANIFEST),
    ).toBe('')
  })

  it('returns the spec itself when it is already a GitHub tarball URL', async () => {
    // The answer is already in hand; asking the API would be a wasted round
    // trip against a URL the caller supplied.
    const tgz =
      'https://github.com/example-user/example-repo/archive/abc123.tar.gz'
    expect(await resolveGitHubTgzUrl(tgz, NO_REPO_MANIFEST)).toBe(tgz)
  })
})

describe('resolveGitHubTgzUrl with a directory', () => {
  it('reads the manifest from the directory', async () => {
    const dir = tmpDir()
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(NO_REPO_MANIFEST),
      'utf8',
    )
    expect(await resolveGitHubTgzUrl('@example/package', dir)).toBe('')
  })

  it('surfaces the read failure when the directory holds no manifest', async () => {
    // The manifest is the input; a missing one is a caller mistake worth
    // naming, not an empty answer that reads as "no GitHub tarball".
    const dir = tmpDir()
    mkdirSync(path.join(dir, 'empty'), { recursive: true })
    await expect(
      resolveGitHubTgzUrl('@example/package', path.join(dir, 'empty')),
    ).rejects.toThrow('JSON file not found')
  })
})
