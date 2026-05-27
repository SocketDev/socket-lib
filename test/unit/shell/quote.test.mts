/**
 * @file Unit tests for shell/quote.
 */

import { describe, expect, it } from 'vitest'

import { quote } from '../../../src/shell/quote'

describe('shell/quote', () => {
  it('joins bare tokens with spaces', () => {
    expect(quote(['git', 'status'])).toBe('git status')
  })

  it('quotes a token containing whitespace', () => {
    expect(quote(['git', 'commit', '-m', 'hello world'])).toBe(
      "git commit -m 'hello world'",
    )
  })

  it('escapes shell metacharacters', () => {
    expect(quote(['echo', '$HOME'])).toBe('echo \\$HOME')
  })

  it('quotes an empty string token', () => {
    expect(quote(['cmd', ''])).toBe("cmd ''")
  })

  it('round-trips a path with spaces', () => {
    expect(quote(['cat', '/a b/c.txt'])).toBe("cat '/a b/c.txt'")
  })

  it('returns an empty string for no args', () => {
    expect(quote([])).toBe('')
  })
})
