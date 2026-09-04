/**
 * @file Unit tests for the pure remote-URL parsers in src/git/remote.mts.
 *   Covers the three remote spellings git emits, the `.git` and trailing-slash
 *   suffixes, and the owner/repo split. No git process runs here — the
 *   origin* readers that shell out are exercised in the integration suite.
 */

import { describe, expect, test } from 'vitest'

import {
  ownerRepoFromRemoteUrl,
  parseRemoteUrl,
  slugFromRemoteUrl,
  splitOwnerRepo,
} from '../../src/git/remote.mts'

describe('parseRemoteUrl', () => {
  test.each([
    ['https://github.com/acme/widgets.git', 'acme', 'widgets'],
    ['https://github.com/acme/widgets', 'acme', 'widgets'],
    ['https://github.com/acme/widgets/', 'acme', 'widgets'],
    ['git@github.com:acme/widgets.git', 'acme', 'widgets'],
    ['git@github.com:acme/widgets', 'acme', 'widgets'],
    ['ssh://git@github.com/acme/widgets.git', 'acme', 'widgets'],
    ['https://github.com/Acme/Widgets.git', 'Acme', 'Widgets'],
    ['https://ghe.internal:8443/acme/widgets.git', 'acme', 'widgets'],
  ])('parses %s', (url, owner, repo) => {
    expect(parseRemoteUrl(url)).toEqual({ owner, repo })
  })

  test('tolerates surrounding whitespace', () => {
    expect(parseRemoteUrl('  git@github.com:acme/widgets.git\n')).toEqual({
      owner: 'acme',
      repo: 'widgets',
    })
  })

  test.each(['', '   ', 'not-a-url', 'widgets'])(
    'returns undefined for %j',
    url => {
      expect(parseRemoteUrl(url)).toBeUndefined()
    },
  )
})

describe('ownerRepoFromRemoteUrl', () => {
  test('preserves case, since it is used for display and comparison', () => {
    expect(ownerRepoFromRemoteUrl('git@github.com:Acme/Widgets.git')).toBe(
      'Acme/Widgets',
    )
  })

  test('returns undefined when unparseable', () => {
    expect(ownerRepoFromRemoteUrl('nope')).toBeUndefined()
  })
})

describe('slugFromRemoteUrl', () => {
  test('lowercases, because GitHub slugs compare case-insensitively', () => {
    expect(slugFromRemoteUrl('git@github.com:Acme/Widgets.git')).toBe('widgets')
  })
})

describe('splitOwnerRepo', () => {
  test('splits a qualified reference', () => {
    expect(splitOwnerRepo('acme/widgets')).toEqual({
      owner: 'acme',
      repo: 'widgets',
    })
  })

  test.each(['widgets', '/widgets', 'acme/', 'acme/a/b', ''])(
    'rejects %j so a bare name never reads as qualified',
    value => {
      expect(splitOwnerRepo(value)).toBeUndefined()
    },
  )
})
