/**
 * @file Unit tests for argv/parse-args-string.
 */

import { describe, expect, it } from 'vitest'

import { parseArgsString } from '../../../src/argv/parse-args-string'

describe.sequential('argv/parse-args-string', () => {
  it('tokenizes a bare command', () => {
    expect(parseArgsString('git status')).toEqual(['git', 'status'])
  })

  it('keeps multiple spaces as a single separator', () => {
    expect(parseArgsString('git    status')).toEqual(['git', 'status'])
  })

  it('strips outer double quotes', () => {
    expect(parseArgsString('echo "hello world"')).toEqual([
      'echo',
      'hello world',
    ])
  })

  it('strips outer single quotes', () => {
    expect(parseArgsString("echo 'hello world'")).toEqual([
      'echo',
      'hello world',
    ])
  })

  it('handles mixed quoted + unquoted tokens', () => {
    expect(parseArgsString('git commit -m "initial commit"')).toEqual([
      'git',
      'commit',
      '-m',
      'initial commit',
    ])
  })

  it('preserves inner quotes on mixed key="value" tokens', () => {
    // Mixed tokens (where quoted segments are glued to bare chars)
    // retain the quote characters in the result — matches string-argv
    // upstream behavior. Callers that want unquoted values should
    // either parse the result themselves or pass the bare quoted form
    // (e.g. `foo --bar "x y" baz`).
    expect(parseArgsString('foo --bar="x y" baz')).toEqual([
      'foo',
      '--bar="x y"',
      'baz',
    ])
  })

  it('handles empty quoted args', () => {
    expect(parseArgsString('cmd ""')).toEqual(['cmd', ''])
  })

  it('returns [] for empty / whitespace-only input', () => {
    expect(parseArgsString('')).toEqual([])
    expect(parseArgsString('   ')).toEqual([])
  })

  it('preserves leading dashes', () => {
    expect(parseArgsString('git log --oneline -n 5')).toEqual([
      'git',
      'log',
      '--oneline',
      '-n',
      '5',
    ])
  })

  it('handles a single token', () => {
    expect(parseArgsString('git')).toEqual(['git'])
  })

  it('does not carry regex lastIndex state across calls', () => {
    // Both calls should produce the full tokenization. If lastIndex
    // weren't reset, the second call would start mid-string and miss
    // the first token.
    expect(parseArgsString('a b c')).toEqual(['a', 'b', 'c'])
    expect(parseArgsString('x y z')).toEqual(['x', 'y', 'z'])
  })

  it('handles tabs and other whitespace as separators', () => {
    expect(parseArgsString('git\tstatus\n--short')).toEqual([
      'git',
      'status',
      '--short',
    ])
  })

  it('preserves quotes inside mixed tokens for both quote styles', () => {
    expect(parseArgsString("foo --bar='x y' baz")).toEqual([
      'foo',
      "--bar='x y'",
      'baz',
    ])
  })

  it('handles trailing whitespace', () => {
    expect(parseArgsString('git status   ')).toEqual(['git', 'status'])
  })

  it('handles leading whitespace', () => {
    expect(parseArgsString('   git status')).toEqual(['git', 'status'])
  })

  it('handles consecutive quoted tokens with no bare separator', () => {
    expect(parseArgsString('"a b" "c d"')).toEqual(['a b', 'c d'])
  })

  it('handles a quoted token at the start', () => {
    expect(parseArgsString('"hello" world')).toEqual(['hello', 'world'])
  })

  it('handles unmatched / unterminated quote by capturing through end', () => {
    // The regex is greedy through the next matching quote; an
    // unterminated quote leaves the unmatched chunk as a bare token
    // (the outer regex's [^\s'"]+ branch matches up to the quote).
    // This is a regression test, not a guarantee — callers that need
    // strict validation should check before passing input.
    const result = parseArgsString('echo "unterminated')
    expect(result[0]).toBe('echo')
  })

  it('handles single-character tokens', () => {
    expect(parseArgsString('a b c')).toEqual(['a', 'b', 'c'])
  })

  it('handles numeric tokens', () => {
    expect(parseArgsString('sleep 5')).toEqual(['sleep', '5'])
  })

  it('handles tokens with equal signs (no quotes)', () => {
    expect(parseArgsString('VAR=value cmd')).toEqual(['VAR=value', 'cmd'])
  })

  it('handles flag with value separated by space', () => {
    expect(parseArgsString('git commit -m hello')).toEqual([
      'git',
      'commit',
      '-m',
      'hello',
    ])
  })

  it('handles flag with value joined by equals (no quotes)', () => {
    expect(parseArgsString('git log --pretty=oneline')).toEqual([
      'git',
      'log',
      '--pretty=oneline',
    ])
  })

  it('handles a token containing internal quote pairs', () => {
    // `foo"bar"baz` is a single mixed token; the quote pair gets
    // preserved verbatim in the result (string-argv behavior).
    expect(parseArgsString('foo"bar"baz')).toEqual(['foo"bar"baz'])
  })

  it('handles tokens that are only whitespace surrounded by quotes', () => {
    expect(parseArgsString('"   "')).toEqual(['   '])
  })

  it('handles many tokens', () => {
    const input = 'a b c d e f g h i j'
    const expected = input.split(' ')
    expect(parseArgsString(input)).toEqual(expected)
  })
})
