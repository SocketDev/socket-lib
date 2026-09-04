/**
 * @file The GitHub error classes as a contract. Callers branch on `name` and
 *   `instanceof` rather than on the message, and one of them carries a status
 *   that is deliberately 200, so both are worth pinning: a rename or a dropped
 *   field is a breaking change no message assertion elsewhere would catch.
 */

import { describe, expect, it } from 'vitest'

import { GitHubEmptyBodyError } from '../../../src/github/errors.mjs'

describe('GitHubEmptyBodyError', () => {
  const url = 'https://api.github.com/advisories/GHSA-0000-0000-0000'

  it('is an Error, so a caller catching Error still sees it', () => {
    expect(new GitHubEmptyBodyError(url)).toBeInstanceOf(Error)
  })

  it('carries a stable name to switch on', () => {
    expect(new GitHubEmptyBodyError(url).name).toBe('GitHubEmptyBodyError')
  })

  it('reports 200, which is what makes the case insidious', () => {
    // A 4xx or 5xx would already have been handled by the status branch, so
    // the status here is always the successful one.
    expect(new GitHubEmptyBodyError(url).status).toBe(200)
  })

  it('names the URL that answered with nothing', () => {
    expect(new GitHubEmptyBodyError(url).message).toContain(url)
  })
})
