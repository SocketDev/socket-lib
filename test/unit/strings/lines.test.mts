/**
 * @file Unit tests for src/strings/lines.ts
 */

import { describe, expect, it } from 'vitest'

import { splitLines } from '../../../src/strings/lines'

describe('splitLines', () => {
  it('splits on LF', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c'])
  })

  it('splits on CRLF without leaving trailing \\r', () => {
    expect(splitLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c'])
  })

  it('splits on bare CR (legacy Mac)', () => {
    expect(splitLines('a\rb\rc')).toEqual(['a', 'b', 'c'])
  })

  it('handles mixed newline conventions in one input', () => {
    expect(splitLines('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('treats CRLF as one break, not two', () => {
    expect(splitLines('a\r\nb')).toEqual(['a', 'b'])
  })

  it('produces an empty trailing entry for a trailing newline', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b', ''])
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b', ''])
    expect(splitLines('a\rb\r')).toEqual(['a', 'b', ''])
  })

  it('returns a single-entry array for input with no newlines', () => {
    expect(splitLines('abc')).toEqual(['abc'])
  })

  it('returns one empty entry for the empty string', () => {
    expect(splitLines('')).toEqual([''])
  })

  it('preserves empty interior lines by default', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b'])
  })

  it('trims each line with trim: true', () => {
    expect(splitLines('  a  \n\tb\t', { trim: true })).toEqual(['a', 'b'])
  })

  it('drops empty lines with skipEmpty: true', () => {
    expect(splitLines('a\n\nb\n', { skipEmpty: true })).toEqual(['a', 'b'])
  })

  it('drops whitespace-only lines when trim and skipEmpty combine', () => {
    expect(
      splitLines('  a  \n   \nb\n', { skipEmpty: true, trim: true }),
    ).toEqual(['a', 'b'])
  })

  it('keeps whitespace-only lines with skipEmpty alone', () => {
    expect(splitLines('a\n \nb', { skipEmpty: true })).toEqual(['a', ' ', 'b'])
  })
})
