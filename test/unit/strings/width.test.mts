import { describe, expect, it } from 'vitest'

import { stringWidth } from '../../../src/strings/width'

describe('strings/width — stringWidth', () => {
  it('calculates width of ASCII characters', () => {
    expect(stringWidth('hello')).toBe(5)
    expect(stringWidth('test')).toBe(4)
  })

  it('handles empty string', () => {
    expect(stringWidth('')).toBe(0)
  })

  it('strips ANSI codes before measuring', () => {
    expect(stringWidth('\x1b[31mred\x1b[0m')).toBe(3)
    expect(stringWidth('\x1b[1;31mbold red\x1b[0m')).toBe(8)
  })

  it('handles strings with spaces', () => {
    expect(stringWidth('hello world')).toBe(11)
  })

  it('handles wide characters correctly', () => {
    expect(stringWidth('你好')).toBeGreaterThanOrEqual(4)
    expect(stringWidth('漢字')).toBeGreaterThanOrEqual(4)
  })

  it('handles control characters', () => {
    expect(stringWidth('hello\nworld')).toBe(10)
    expect(stringWidth('tab\there')).toBe(7)
  })

  it('handles emoji correctly', () => {
    expect(stringWidth('👍')).toBe(2)
    expect(stringWidth('😀')).toBe(2)
    expect(stringWidth('⚡')).toBe(2)
  })

  it('handles emoji with skin tone modifiers', () => {
    expect(stringWidth('👍🏽')).toBe(2)
  })

  it('handles complex emoji sequences', () => {
    expect(stringWidth('👨‍👩‍👧‍👦')).toBe(2)
  })

  it('handles combining marks', () => {
    expect(stringWidth('é')).toBe(1)
    expect(stringWidth('é')).toBe(1)
  })

  it('handles zero-width characters', () => {
    expect(stringWidth('hello​world')).toBe(10)
    expect(stringWidth('test﻿ing')).toBe(7)
  })

  it('handles fullwidth forms', () => {
    expect(stringWidth('ＡＢＣ')).toBeGreaterThan(3)
  })

  it('handles halfwidth Katakana', () => {
    expect(stringWidth('ｱｲｳ')).toBe(3)
  })

  it('returns 0 for non-string input', () => {
    expect(stringWidth(undefined as unknown as string)).toBe(0)
    // @ts-expect-error - Testing runtime behavior with invalid argument type.
    expect(stringWidth(123)).toBe(0)
  })

  it('handles mixed content', () => {
    const mixed = 'hello 你好 ⚡ world'
    expect(stringWidth(mixed)).toBeGreaterThan(15)
  })

  it('handles strings with only ANSI codes', () => {
    expect(stringWidth('\x1b[31m\x1b[0m')).toBe(0)
  })

  it('handles long strings', () => {
    const long = 'a'.repeat(1000)
    expect(stringWidth(long)).toBe(1000)
  })

  it('handles Greek letters (ambiguous width)', () => {
    expect(stringWidth('αβγ')).toBe(3)
  })

  it('handles Cyrillic letters', () => {
    expect(stringWidth('АБВ')).toBe(3)
  })

  it('handles box drawing characters', () => {
    expect(stringWidth('─│┌')).toBe(3)
  })

  it('returns 0 for non-string input (branch)', () => {
    expect(stringWidth(undefined as unknown as string)).toBe(0)
    // @ts-expect-error - Testing runtime behavior with invalid argument type.
    expect(stringWidth(123)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(stringWidth('')).toBe(0)
  })

  it('returns 0 for string with only ANSI codes', () => {
    expect(stringWidth('\x1b[31m\x1b[0m')).toBe(0)
  })

  it('skips zero-width clusters', () => {
    expect(stringWidth('hello​world')).toBe(10)
    expect(stringWidth('test\t')).toBe(4)
  })

  it('handles RGI emoji as double-width', () => {
    expect(stringWidth('👍')).toBeGreaterThanOrEqual(2)
    expect(stringWidth('😀')).toBeGreaterThanOrEqual(2)
  })

  it('uses East Asian Width for non-emoji', () => {
    expect(stringWidth('漢')).toBeGreaterThanOrEqual(2)
    expect(stringWidth('ｱ')).toBe(1)
  })

  it('handles trailing halfwidth/fullwidth forms', () => {
    const textWithHalfwidth = 'aﾞ'
    expect(stringWidth(textWithHalfwidth)).toBeGreaterThanOrEqual(1)
  })

  it('handles non-string input (extra branch)', () => {
    expect(stringWidth(undefined as unknown as string)).toBe(0)
    // @ts-expect-error - Testing runtime behavior with invalid argument type.
    expect(stringWidth(123)).toBe(0)
  })

  it('handles strings with only ANSI codes (extra)', () => {
    expect(stringWidth('\x1b[31m\x1b[0m')).toBe(0)
  })

  it('handles trailing halfwidth forms in multi-char segments', () => {
    const textWithTrailingHalfwidth = 'testﾞ'
    expect(stringWidth(textWithTrailingHalfwidth)).toBeGreaterThanOrEqual(4)
  })

  it('handles fullwidth forms (uppercase range)', () => {
    expect(stringWidth('Ａ')).toBe(2)
    expect(stringWidth('ａ')).toBe(2)
  })

  it('handles segments with only non-printing after strip', () => {
    const textWithControlOnly = '\x00\x01\x02'
    expect(stringWidth(textWithControlOnly)).toBe(0)
  })

  it('handles complex segments with trailing undefined', () => {
    const textWithHalfwidth = 'aﾞﾟ'
    expect(stringWidth(textWithHalfwidth)).toBeGreaterThanOrEqual(1)
  })

  it('handles combining marks as zero-width', () => {
    expect(stringWidth('é')).toBe(1)
    expect(stringWidth('́')).toBe(0)
  })
})
