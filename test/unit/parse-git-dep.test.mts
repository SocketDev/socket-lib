/**
 * @file Unit tests for the universal git-dependency parser. Each case is a
 *   spelling one of the package managers actually writes.
 */

import { describe, expect, test } from 'vitest'

import { parseGitDep } from '../../src/eco/npm/parse-git-dep.mts'

describe('npm spellings', () => {
  test.each([
    [
      'git+ssh://git@github.com/o/r.git#abc123',
      'git+ssh://git@github.com/o/r.git',
      'abc123',
    ],
    [
      'git+https://github.com/o/r.git#abc123',
      'git+https://github.com/o/r.git',
      'abc123',
    ],
    ['git://github.com/o/r.git#abc123', 'git://github.com/o/r.git', 'abc123'],
    ['github:o/r#abc123', 'github:o/r', 'abc123'],
  ])('%s', (spec, url, commit) => {
    expect(parseGitDep(spec)).toEqual({ url, commit })
  })

  test('no fragment leaves the commit undefined', () => {
    expect(parseGitDep('git+https://github.com/o/r.git')).toEqual({
      url: 'git+https://github.com/o/r.git',
      commit: undefined,
    })
  })
})

describe('yarn spellings', () => {
  // Classic omits the git+ prefix entirely; only the .git suffix marks it.
  test('classic: bare https with a .git suffix', () => {
    expect(parseGitDep('https://github.com/o/r.git#abc123')).toEqual({
      url: 'https://github.com/o/r.git',
      commit: 'abc123',
    })
  })

  // Berry writes the ref as a named param, not a bare fragment.
  test('berry: #commit=<sha>', () => {
    expect(parseGitDep('https://github.com/o/r.git#commit=abc123')).toEqual({
      url: 'https://github.com/o/r.git',
      commit: 'abc123',
    })
  })

  test('berry: commit= alongside sibling params', () => {
    expect(
      parseGitDep('https://github.com/o/r.git#workspace=%2F&commit=abc123'),
    ).toEqual({ url: 'https://github.com/o/r.git', commit: 'abc123' })
  })

  test('berry: a param-only fragment yields no commit, not a bogus one', () => {
    expect(parseGitDep('https://github.com/o/r.git#workspace=%2F')).toEqual({
      url: 'https://github.com/o/r.git',
      commit: undefined,
    })
  })
})

describe('pnpm resolution objects', () => {
  test('type git yields the repo and commit', () => {
    expect(
      parseGitDep({
        type: 'git',
        repo: 'https://github.com/o/r.git',
        commit: 'abc123',
      }),
    ).toEqual({ url: 'https://github.com/o/r.git', commit: 'abc123' })
  })

  test('a tarball resolution is not a git dep', () => {
    expect(
      parseGitDep({ tarball: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz' }),
    ).toBeUndefined()
  })
})

describe('scp-like remotes', () => {
  test('git@host:owner/repo has no protocol but is still git', () => {
    expect(parseGitDep('git@github.com:o/r.git#abc123')).toEqual({
      url: 'git@github.com:o/r.git',
      commit: 'abc123',
    })
  })
})

describe('non-git inputs stay undefined', () => {
  test.each([
    // The false positive that matters: a registry tarball must never match.
    'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
    'https://example.com/pkg.tgz',
    '^1.0.0',
    'npm:other@1.0.0',
    'workspace:packages/core',
    'file:../local',
    '',
    '   ',
  ])('%j', spec => {
    expect(parseGitDep(spec)).toBeUndefined()
  })

  test.each([undefined, 42, {}])('%j', spec => {
    expect(parseGitDep(spec as never)).toBeUndefined()
  })
})
