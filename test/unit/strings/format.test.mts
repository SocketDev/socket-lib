import { describe, expect, it } from 'vitest'

import {
  applyLinePrefix,
  centerText,
  fromCharCode,
  indentString,
  repeatString,
} from '../../../src/strings/format'

describe('strings/format — applyLinePrefix', () => {
  it('applies prefix to single line', () => {
    const result = applyLinePrefix('hello', { prefix: '> ' })
    expect(result).toBe('> hello')
  })

  it('applies prefix to multiple lines', () => {
    const result = applyLinePrefix('line1\nline2\nline3', { prefix: '> ' })
    expect(result).toBe('> line1\n> line2\n> line3')
  })

  it('handles empty prefix', () => {
    const result = applyLinePrefix('hello', { prefix: '' })
    expect(result).toBe('hello')
  })

  it('handles no options', () => {
    const result = applyLinePrefix('hello')
    expect(result).toBe('hello')
  })

  it('applies prefix even to empty string', () => {
    const result = applyLinePrefix('', { prefix: '> ' })
    expect(result).toBe('> ')
  })

  it('handles multiple consecutive newlines', () => {
    expect(applyLinePrefix('a\n\n\nb', { prefix: '> ' })).toBe(
      '> a\n> \n> \n> b',
    )
  })

  it('handles trailing newline', () => {
    expect(applyLinePrefix('line\n', { prefix: '> ' })).toBe('> line\n> ')
  })

  it('handles only newlines', () => {
    const result = applyLinePrefix('\n\n', { prefix: '> ' })
    expect(result).toBe('> \n> \n> ')
  })

  it('handles Windows-style line endings', () => {
    expect(applyLinePrefix('line1\r\nline2', { prefix: '> ' })).toBe(
      '> line1\r\n> line2',
    )
  })

  it('returns string unchanged when prefix is undefined', () => {
    expect(applyLinePrefix('test', undefined)).toBe('test')
  })
})

describe('strings/format — indentString', () => {
  it('indents single line with default count', () => {
    expect(indentString('hello')).toBe(' hello')
  })

  it('indents with custom count', () => {
    expect(indentString('hello', { count: 4 })).toBe('    hello')
  })

  it('indents multiple lines', () => {
    const result = indentString('line1\nline2\nline3', { count: 2 })
    expect(result).toBe('  line1\n  line2\n  line3')
  })

  it('does not indent empty lines', () => {
    const result = indentString('line1\n\nline3', { count: 2 })
    expect(result).toBe('  line1\n\n  line3')
  })

  it('handles empty string', () => {
    expect(indentString('')).toBe('')
  })

  it('handles count of 0', () => {
    expect(indentString('hello', { count: 0 })).toBe('hello')
  })

  it('throws on negative count', () => {
    expect(() => indentString('hello', { count: -5 })).toThrow(RangeError)
  })

  it('handles large count', () => {
    const result = indentString('hi', { count: 100 })
    expect(result).toMatch(/^\s{100}hi$/)
  })

  it('does not indent whitespace-only lines', () => {
    expect(indentString('a\n   \nb', { count: 2 })).toBe('  a\n   \n  b')
  })

  it('handles large count values', () => {
    const result = indentString('test', { count: 10 })
    expect(result).toBe(`${' '.repeat(10)}test`)
  })

  it('matches non-empty lines', () => {
    expect(indentString('a\nb\nc', { count: 2 })).toBe('  a\n  b\n  c')
  })

  it('does not match empty lines (regex)', () => {
    expect(indentString('\n\n', { count: 2 })).toBe('\n\n')
  })

  it('does not match whitespace-only lines (regex)', () => {
    expect(indentString('  \n  ', { count: 2 })).toBe('  \n  ')
  })
})

describe('strings/format — centerText', () => {
  it('centers text with even padding', () => {
    expect(centerText('hi', 6)).toBe('  hi  ')
  })

  it('centers text with odd padding', () => {
    expect(centerText('hi', 7)).toBe('  hi   ')
  })

  it('does not pad if text is longer than width', () => {
    expect(centerText('hello', 3)).toBe('hello')
  })

  it('handles text equal to width', () => {
    expect(centerText('hello', 5)).toBe('hello')
  })

  it('strips ANSI codes for width calculation', () => {
    const text = '\x1b[31mred\x1b[0m'
    const result = centerText(text, 7)
    expect(result.length).toBeGreaterThan(text.length)
  })

  it('handles empty string', () => {
    expect(centerText('', 5)).toBe('     ')
  })

  it('handles width of 0', () => {
    expect(centerText('test', 0)).toBe('test')
  })

  it('handles negative width', () => {
    expect(centerText('test', -5)).toBe('test')
  })

  it('returns original when width <= text length', () => {
    expect(centerText('hello', 5)).toBe('hello')
    expect(centerText('hello', 3)).toBe('hello')
    expect(centerText('longer text', 5)).toBe('longer text')
  })

  it('centers text with odd padding (asymmetric)', () => {
    expect(centerText('hi', 5)).toBe(' hi  ')
    expect(centerText('a', 7)).toBe('   a   ')
  })

  it('centers text with even padding (symmetric)', () => {
    expect(centerText('test', 8)).toBe('  test  ')
  })

  it('handles text with ANSI codes', () => {
    const colored = '\x1b[31mred\x1b[0m'
    const result = centerText(colored, 10)
    expect(result.includes('red')).toBe(true)
  })

  it('handles empty text (fills to width)', () => {
    expect(centerText('', 10).length).toBe(10)
  })

  it('calculates padding correctly for odd difference', () => {
    expect(centerText('a', 4)).toBe(' a  ')
  })

  it('calculates padding correctly for even difference', () => {
    expect(centerText('ab', 6)).toBe('  ab  ')
  })
})

describe('strings/format — repeatString', () => {
  it('repeats string n times', () => {
    expect(repeatString('x', 3)).toBe('xxx')
    expect(repeatString('ab', 2)).toBe('abab')
  })

  it('returns empty string for count <= 0', () => {
    expect(repeatString('x', 0)).toBe('')
    expect(repeatString('x', -1)).toBe('')
  })

  it('handles empty string', () => {
    expect(repeatString('', 5)).toBe('')
  })

  it('handles single repetition', () => {
    expect(repeatString('hello', 1)).toBe('hello')
  })

  it('handles count of 0', () => {
    expect(repeatString('test', 0)).toBe('')
  })

  it('handles count of 1', () => {
    expect(repeatString('test', 1)).toBe('test')
  })

  it('handles large counts', () => {
    const result = repeatString('a', 100)
    expect(result.length).toBe(100)
    expect(result).toBe('a'.repeat(100))
  })

  it('handles negative count', () => {
    expect(repeatString('test', -1)).toBe('')
  })

  it('handles non-integer count', () => {
    expect(repeatString('ab', 2.9)).toBe('abab')
  })

  it('handles very long strings', () => {
    const result = repeatString('x', 1000)
    expect(result.length).toBe(1000)
  })

  it('repeats string multiple times', () => {
    expect(repeatString('ab', 3)).toBe('ababab')
    expect(repeatString('x', 5)).toBe('xxxxx')
  })
})

describe('strings/format — fromCharCode', () => {
  it('is exported', () => {
    expect(typeof fromCharCode).toBe('function')
  })

  it('converts char codes to strings', () => {
    expect(fromCharCode(65)).toBe('A')
    expect(fromCharCode(97)).toBe('a')
    expect(fromCharCode(48)).toBe('0')
  })

  it('handles multiple char codes', () => {
    expect(fromCharCode(72, 105)).toBe('Hi')
    expect(fromCharCode(65, 66, 67)).toBe('ABC')
    expect(fromCharCode(72, 101, 108, 108, 111)).toBe('Hello')
  })

  it('handles unicode char codes', () => {
    expect(fromCharCode(0x4e_2d)).toBe('中')
    expect(fromCharCode(0x00_e9)).toBe('é')
  })

  it('handles special characters', () => {
    expect(fromCharCode(10)).toBe('\n')
    expect(fromCharCode(13)).toBe('\r')
    expect(fromCharCode(9)).toBe('\t')
  })

  it('handles Unicode characters in BMP', () => {
    expect(fromCharCode(0x27_64)).toBe('❤')
    expect(fromCharCode(0x26_3a)).toBe('☺')
  })
})
