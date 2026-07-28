/**
 * @file Unit tests for shell/command-args.
 */

import { describe, expect, it } from 'vitest'

import {
  GH_VALUE_FLAGS,
  GIT_VALUE_FLAGS,
  NPM_VALUE_FLAGS,
  positionalArgs,
} from '../../../src/shell/command-args'

describe('shell/command-args positionalArgs', () => {
  it('skips a value-taking flag and the token it consumes', () => {
    expect(
      positionalArgs(['--repo', 'o/r', 'pr', 'create'], GH_VALUE_FLAGS),
    ).toEqual(['pr', 'create'])
  })

  it('does not consume a token for `--flag=value` form', () => {
    // The `--flag=value` token itself starts with `-` and is dropped like any
    // other flag; the key behavior under test is that (unlike the bare-flag
    // form) it does NOT also consume the next token as a value.
    expect(
      positionalArgs(['--title=pr create', 'pr', 'create'], GH_VALUE_FLAGS),
    ).toEqual(['pr', 'create'])
  })

  it('treats everything after `--` as positional', () => {
    expect(positionalArgs(['commit', '--', '-m'], GIT_VALUE_FLAGS)).toEqual([
      'commit',
      '-m',
    ])
  })

  it('stops early once `limit` positional words are collected', () => {
    expect(
      positionalArgs(
        ['--repo', 'o/r', 'pr', 'create', 'extra'],
        GH_VALUE_FLAGS,
        1,
      ),
    ).toEqual(['pr'])
  })

  it('resolves the gh table: `gh pr create --title X create`', () => {
    expect(
      positionalArgs(
        ['pr', 'create', '--title', 'X', 'create'],
        GH_VALUE_FLAGS,
      ),
    ).toEqual(['pr', 'create', 'create'])
  })

  it('resolves the npm table: skips `--tag` and its value', () => {
    expect(
      positionalArgs(['publish', '--tag', 'next', '.'], NPM_VALUE_FLAGS),
    ).toEqual(['publish', '.'])
  })

  it('resolves the git table: skips `-m` and its value', () => {
    expect(
      positionalArgs(['commit', '-m', 'pr create'], GIT_VALUE_FLAGS),
    ).toEqual(['commit'])
  })
})
