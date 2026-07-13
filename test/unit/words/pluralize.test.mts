import { describe, expect, it } from 'vitest'

import { pluralize } from '../../../src/words/pluralize'

describe('words/pluralize — default mode', () => {
  it('returns singular for count of 1', () => {
    expect(pluralize('item', { count: 1 })).toBe('item')
    expect(pluralize('word', { count: 1 })).toBe('word')
  })

  it('returns plural for count of 0', () => {
    expect(pluralize('item', { count: 0 })).toBe('items')
    expect(pluralize('word', { count: 0 })).toBe('words')
  })

  it('returns plural for count > 1', () => {
    expect(pluralize('item', { count: 2 })).toBe('items')
    expect(pluralize('item', { count: 5 })).toBe('items')
    expect(pluralize('item', { count: 100 })).toBe('items')
  })

  it('returns plural for negative counts', () => {
    expect(pluralize('item', { count: -1 })).toBe('items')
    expect(pluralize('item', { count: -5 })).toBe('items')
  })

  it('returns plural for decimal counts', () => {
    expect(pluralize('item', { count: 1.5 })).toBe('items')
    expect(pluralize('item', { count: 0.5 })).toBe('items')
    expect(pluralize('item', { count: 2.7 })).toBe('items')
  })

  it('defaults to singular when no options provided', () => {
    expect(pluralize('item')).toBe('item')
    expect(pluralize('word')).toBe('word')
  })

  it('defaults to singular when options provided but count not specified', () => {
    expect(pluralize('item', {})).toBe('item')
  })

  it('handles empty string', () => {
    expect(pluralize('', { count: 1 })).toBe('')
    expect(pluralize('', { count: 2 })).toBe('s')
  })

  it('adds "s" to any word for pluralization', () => {
    expect(pluralize('cat', { count: 2 })).toBe('cats')
    expect(pluralize('dog', { count: 3 })).toBe('dogs')
    expect(pluralize('box', { count: 2 })).toBe('boxs')
    expect(pluralize('child', { count: 2 })).toBe('childs')
  })

  it('handles words already ending in s', () => {
    expect(pluralize('glass', { count: 2 })).toBe('glasss')
    expect(pluralize('class', { count: 2 })).toBe('classs')
  })

  it('handles single character words', () => {
    expect(pluralize('a', { count: 1 })).toBe('a')
    expect(pluralize('a', { count: 2 })).toBe('as')
  })

  it('handles words with numbers', () => {
    expect(pluralize('test123', { count: 2 })).toBe('test123s')
    expect(pluralize('item1', { count: 3 })).toBe('item1s')
  })

  it('handles words with special characters', () => {
    expect(pluralize('test-case', { count: 2 })).toBe('test-cases')
    expect(pluralize('file_name', { count: 2 })).toBe('file_names')
  })

  it('handles unicode words', () => {
    expect(pluralize('café', { count: 2 })).toBe('cafés')
    expect(pluralize('naïve', { count: 2 })).toBe('naïves')
  })

  it('handles count of exactly 1.0', () => {
    expect(pluralize('item', { count: 1.0 })).toBe('item')
  })

  it('handles very large counts', () => {
    expect(pluralize('item', { count: 999_999 })).toBe('items')
    expect(pluralize('item', { count: Number.MAX_SAFE_INTEGER })).toBe('items')
  })

  it('handles zero as explicit option', () => {
    expect(pluralize('error', { count: 0 })).toBe('errors')
    expect(pluralize('warning', { count: 0 })).toBe('warnings')
  })

  it('handles undefined options', () => {
    expect(pluralize('item', undefined)).toBe('item')
  })

  it('handles NaN count', () => {
    expect(pluralize('item', { count: Number.NaN })).toBe('items')
  })

  it('handles Infinity', () => {
    expect(pluralize('item', { count: Number.POSITIVE_INFINITY })).toBe('items')
    expect(pluralize('item', { count: Number.NEGATIVE_INFINITY })).toBe('items')
  })
})

describe('words/pluralize — dictionary mode', () => {
  it('selects singular for count===1', () => {
    expect(
      pluralize('child', {
        count: 1,
        forms: { singular: 'child', plural: 'children' },
      }),
    ).toBe('child')
  })

  it('selects plural for count===0 (English `other` category)', () => {
    expect(
      pluralize('child', {
        count: 0,
        forms: { singular: 'child', plural: 'children' },
      }),
    ).toBe('children')
  })

  it('selects plural for count > 1', () => {
    expect(
      pluralize('mouse', {
        count: 5,
        forms: { singular: 'mouse', plural: 'mice' },
      }),
    ).toBe('mice')
  })

  it('falls back to plural when singular is omitted', () => {
    expect(pluralize('foo', { count: 1, forms: { plural: 'bars' } })).toBe(
      'bars',
    )
  })

  it('falls back to plural when locale-specific category is omitted', () => {
    expect(
      pluralize('item', {
        count: 0,
        locale: 'ar',
        forms: { singular: 'item', plural: 'items' },
      }),
    ).toBe('items')
  })

  it('honors locale-specific zero/two/few/many when provided', () => {
    const arabicForms = {
      zero: 'صفر كتاب',
      singular: 'كتاب واحد',
      two: 'كتابان',
      few: 'كتب قليلة',
      many: 'كتب كثيرة',
      plural: 'كتب',
    }
    expect(
      pluralize('book', { count: 0, locale: 'ar', forms: arabicForms }),
    ).toBe('صفر كتاب')
    expect(
      pluralize('book', { count: 1, locale: 'ar', forms: arabicForms }),
    ).toBe('كتاب واحد')
    expect(
      pluralize('book', { count: 2, locale: 'ar', forms: arabicForms }),
    ).toBe('كتابان')
    expect(
      pluralize('book', { count: 5, locale: 'ar', forms: arabicForms }),
    ).toBe('كتب قليلة')
    expect(
      pluralize('book', { count: 25, locale: 'ar', forms: arabicForms }),
    ).toBe('كتب كثيرة')
  })

  it('honors Russian few/many distinction', () => {
    const russianForms = {
      singular: 'файл',
      few: 'файла',
      many: 'файлов',
      plural: 'файлов',
    }
    expect(
      pluralize('file', { count: 1, locale: 'ru', forms: russianForms }),
    ).toBe('файл')
    expect(
      pluralize('file', { count: 3, locale: 'ru', forms: russianForms }),
    ).toBe('файла')
    expect(
      pluralize('file', { count: 7, locale: 'ru', forms: russianForms }),
    ).toBe('файлов')
  })

  it('honors ordinal type for English suffixes', () => {
    const enOrdinal = {
      singular: 'st',
      two: 'nd',
      few: 'rd',
      plural: 'th',
    }
    expect(pluralize('', { count: 1, type: 'ordinal', forms: enOrdinal })).toBe(
      'st',
    )
    expect(pluralize('', { count: 2, type: 'ordinal', forms: enOrdinal })).toBe(
      'nd',
    )
    expect(pluralize('', { count: 3, type: 'ordinal', forms: enOrdinal })).toBe(
      'rd',
    )
    expect(pluralize('', { count: 4, type: 'ordinal', forms: enOrdinal })).toBe(
      'th',
    )
    expect(
      pluralize('', { count: 11, type: 'ordinal', forms: enOrdinal }),
    ).toBe('th')
    expect(
      pluralize('', { count: 21, type: 'ordinal', forms: enOrdinal }),
    ).toBe('st')
  })

  it('reuses cached Intl.PluralRules across calls', () => {
    const forms = { singular: 'item', plural: 'items' }
    for (let i = 0; i < 100; i += 1) {
      expect(pluralize('item', { count: i, forms })).toBe(
        i === 1 ? 'item' : 'items',
      )
    }
  })

  it('ignores `word` when forms is given', () => {
    expect(
      pluralize('ignored', {
        count: 2,
        forms: { singular: 'mouse', plural: 'mice' },
      }),
    ).toBe('mice')
  })

  it('default path still works when forms is undefined', () => {
    expect(pluralize('file', { count: 3, forms: undefined as never })).toBe(
      'files',
    )
  })
})
