/**
 * @file Unit tests for shell/parse.
 */

import { describe, expect, it } from 'vitest'

import { parseShell } from '../../../src/shell/parse'

describe('shell/parse', () => {
  it('tokenizes a bare command', () => {
    expect(parseShell('git status')).toEqual(['git', 'status'])
  })

  it('strips quotes around a multi-word arg', () => {
    expect(parseShell('git commit -m "hello world"')).toEqual([
      'git',
      'commit',
      '-m',
      'hello world',
    ])
  })

  it('surfaces operators as op tokens', () => {
    expect(parseShell('ls && echo done')).toEqual([
      'ls',
      { op: '&&' },
      'echo',
      'done',
    ])
  })

  it('surfaces a pipe as an op token', () => {
    expect(parseShell('cat f | wc -l')).toEqual([
      'cat',
      'f',
      { op: '|' },
      'wc',
      '-l',
    ])
  })

  it('resolves an env var against the provided record', () => {
    expect(parseShell('echo $HOME', { HOME: '/root' })).toEqual([
      'echo',
      '/root',
    ])
  })

  it('collapses an unresolved env var to an empty string', () => {
    expect(parseShell('echo $MISSING')).toEqual(['echo', ''])
  })

  it('surfaces a comment as a comment token', () => {
    expect(parseShell('ls # list')).toEqual(['ls', { comment: ' list' }])
  })
})
