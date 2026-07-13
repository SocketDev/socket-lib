import { describe, expect, it } from 'vitest'

import {
  stripBom,
  toKebabCase,
  trimNewlines,
} from '../../../src/strings/transform'

describe('strings/transform — stripBom', () => {
  it('strips BOM from beginning', () => {
    expect(stripBom('﻿hello')).toBe('hello')
  })

  it('does not strip BOM from middle', () => {
    expect(stripBom('hello﻿world')).toBe('hello﻿world')
  })

  it('handles strings without BOM', () => {
    expect(stripBom('hello')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(stripBom('')).toBe('')
  })

  it('strips BOM from start of string (lowercase bom)', () => {
    expect(stripBom('﻿hello')).toBe('hello')
  })

  it('does not strip BOM from middle of string (lowercase bom)', () => {
    expect(stripBom('hello﻿world')).toBe('hello﻿world')
  })

  it('handles string with only BOM', () => {
    expect(stripBom('﻿')).toBe('')
  })
})

describe('strings/transform — toKebabCase', () => {
  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('camelCase')).toBe('camel-case')
    expect(toKebabCase('myVariableName')).toBe('my-variable-name')
  })

  it('converts snake_case to kebab-case', () => {
    expect(toKebabCase('snake_case')).toBe('snake-case')
    expect(toKebabCase('my_variable_name')).toBe('my-variable-name')
  })

  it('handles already kebab-case', () => {
    expect(toKebabCase('kebab-case')).toBe('kebab-case')
  })

  it('handles mixed formats', () => {
    expect(toKebabCase('mixedCase_with_Snake')).toBe('mixed-case-with-snake')
  })

  it('handles empty string', () => {
    expect(toKebabCase('')).toBe('')
  })

  it('handles numbers', () => {
    expect(toKebabCase('version2')).toBe('version2')
  })

  it('handles multiple underscores', () => {
    expect(toKebabCase('foo___bar')).toBe('foo---bar')
  })

  it('handles trailing underscore', () => {
    expect(toKebabCase('foo_')).toBe('foo-')
  })

  it('handles leading underscore', () => {
    expect(toKebabCase('_foo')).toBe('-foo')
  })

  it('handles numbers at end', () => {
    expect(toKebabCase('test123')).toBe('test123')
  })

  it('handles mixed everything', () => {
    expect(toKebabCase('get_HTML5_Document')).toBe('get-html5-document')
  })

  it('converts snake_case to kebab-case (extended)', () => {
    expect(toKebabCase('snake_case_string')).toBe('snake-case-string')
    expect(toKebabCase('multiple_underscore_words')).toBe(
      'multiple-underscore-words',
    )
  })

  it('handles mixed camelCase and snake_case', () => {
    expect(toKebabCase('camelCase_with_underscores')).toBe(
      'camel-case-with-underscores',
    )
  })
})

describe('strings/transform — trimNewlines', () => {
  it('trims newlines from both ends', () => {
    expect(trimNewlines('\nhello\n')).toBe('hello')
    expect(trimNewlines('\n\nhello\n\n')).toBe('hello')
  })

  it('handles carriage returns', () => {
    expect(trimNewlines('\rhello\r')).toBe('hello')
    expect(trimNewlines('\r\nhello\r\n')).toBe('hello')
  })

  it('does not trim newlines from middle', () => {
    expect(trimNewlines('hello\nworld')).toBe('hello\nworld')
  })

  it('handles strings without newlines', () => {
    expect(trimNewlines('hello')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(trimNewlines('')).toBe('')
  })

  it('handles string with only newlines', () => {
    expect(trimNewlines('\n\n')).toBe('')
    expect(trimNewlines('\r\n\r\n')).toBe('')
  })

  it('handles single character', () => {
    expect(trimNewlines('a')).toBe('a')
    expect(trimNewlines('\n')).toBe('')
    expect(trimNewlines('\r')).toBe('')
  })

  it('handles mixed line endings', () => {
    expect(trimNewlines('\r\n\nhello\n\r\n')).toBe('hello')
  })

  it('handles only carriage returns', () => {
    expect(trimNewlines('\r\r\r')).toBe('')
  })

  it('handles very long strings with newlines', () => {
    const content = 'a'.repeat(1000)
    const input = `\n\n${content}\n\n`
    expect(trimNewlines(input)).toBe(content)
  })

  it('handles single newline character', () => {
    expect(trimNewlines('\n')).toBe('')
    expect(trimNewlines('\r')).toBe('')
  })

  it('handles single non-newline character', () => {
    expect(trimNewlines('a')).toBe('a')
  })

  it('returns original if no edge newlines', () => {
    expect(trimNewlines('hello')).toBe('hello')
    expect(trimNewlines('a\nb')).toBe('a\nb')
  })

  it('handles newlines at start', () => {
    expect(trimNewlines('\n\r\nhello')).toBe('hello')
  })

  it('handles newlines at end', () => {
    expect(trimNewlines('hello\r\n\n')).toBe('hello')
  })

  it('handles newlines at both ends', () => {
    expect(trimNewlines('\r\n\rhello\n\r')).toBe('hello')
  })

  it('handles single character strings', () => {
    expect(trimNewlines('a')).toBe('a')
    expect(trimNewlines('\n')).toBe('')
    expect(trimNewlines('\r')).toBe('')
  })

  it('handles strings with no newlines', () => {
    expect(trimNewlines('hello world')).toBe('hello world')
  })

  it('handles mixed newline types', () => {
    expect(trimNewlines('\r\n\nhello\n\r')).toBe('hello')
  })

  it('preserves middle newlines', () => {
    expect(trimNewlines('\nhello\nworld\n')).toBe('hello\nworld')
  })

  it('handles length === 0 early return', () => {
    expect(trimNewlines('')).toBe('')
  })

  it('handles length === 1 with newline', () => {
    expect(trimNewlines('\n')).toBe('')
    expect(trimNewlines('\r')).toBe('')
  })

  it('handles length === 1 without newline', () => {
    expect(trimNewlines('a')).toBe('a')
    expect(trimNewlines(' ')).toBe(' ')
  })

  it('triggers noFirstNewline && noLastNewline early return', () => {
    expect(trimNewlines('ab')).toBe('ab')
    expect(trimNewlines('test')).toBe('test')
  })

  it('handles only leading newlines', () => {
    expect(trimNewlines('\n\ntest')).toBe('test')
    expect(trimNewlines('\r\rtest')).toBe('test')
  })

  it('handles only trailing newlines', () => {
    expect(trimNewlines('test\n\n')).toBe('test')
    expect(trimNewlines('test\r\r')).toBe('test')
  })
})
