/**
 * @fileoverview Unit tests for src/eco/npm/npm/parse-git-url.ts.
 */

import { describe, expect, it } from 'vitest'

import { parseGitUrl } from '@socketsecurity/lib-stable/eco/npm/npm/parse-git-url'

describe('eco/npm/npm/parse-git-url', () => {
  it('extracts url + commit from git+https with hash', () => {
    expect(
      parseGitUrl('git+https://github.com/lodash/lodash.git#abc123'),
    ).toEqual({
      url: 'git+https://github.com/lodash/lodash.git',
      commit: 'abc123',
    })
  })

  it('extracts url with undefined commit when hash missing', () => {
    expect(parseGitUrl('git+ssh://git@github.com/x/y.git')).toEqual({
      url: 'git+ssh://git@github.com/x/y.git',
      commit: undefined,
    })
  })

  it('handles bare git:// scheme', () => {
    expect(parseGitUrl('git://example.com/x.git#deadbeef')).toEqual({
      url: 'git://example.com/x.git',
      commit: 'deadbeef',
    })
  })

  it('returns undefined for non-git URLs', () => {
    expect(parseGitUrl('https://registry.npmjs.org/x/-/x-1.0.0.tgz')).toBe(
      undefined,
    )
    expect(parseGitUrl('file:./local.tgz')).toBe(undefined)
    expect(parseGitUrl('')).toBe(undefined)
  })
})
