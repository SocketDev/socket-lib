import { describe, expect, it } from 'vitest'

import { determineArticle } from '../../../src/words/article'

describe('words/article — determineArticle', () => {
  it('returns "an" for words starting with vowels', () => {
    expect(determineArticle('apple')).toBe('an')
    expect(determineArticle('elephant')).toBe('an')
    expect(determineArticle('igloo')).toBe('an')
    expect(determineArticle('orange')).toBe('an')
    expect(determineArticle('umbrella')).toBe('an')
  })

  it('returns "a" for words starting with consonants', () => {
    expect(determineArticle('banana')).toBe('a')
    expect(determineArticle('cat')).toBe('a')
    expect(determineArticle('dog')).toBe('a')
    expect(determineArticle('table')).toBe('a')
    expect(determineArticle('zebra')).toBe('a')
  })

  it('matches vowels case-insensitively', () => {
    expect(determineArticle('Apple')).toBe('an')
    expect(determineArticle('Elephant')).toBe('an')
    expect(determineArticle('Orange')).toBe('an')
  })

  it('handles uppercase and lowercase vowels uniformly', () => {
    expect(determineArticle('apple')).toBe('an')
    expect(determineArticle('APPLE')).toBe('an')
  })

  it('handles empty string', () => {
    expect(determineArticle('')).toBe('a')
  })

  it('handles single vowel characters', () => {
    expect(determineArticle('a')).toBe('an')
    expect(determineArticle('e')).toBe('an')
    expect(determineArticle('i')).toBe('an')
    expect(determineArticle('o')).toBe('an')
    expect(determineArticle('u')).toBe('an')
  })

  it('handles single consonant characters', () => {
    expect(determineArticle('b')).toBe('a')
    expect(determineArticle('x')).toBe('a')
    expect(determineArticle('z')).toBe('a')
  })

  it('handles words with numbers', () => {
    expect(determineArticle('8ball')).toBe('a')
    expect(determineArticle('eleven')).toBe('an')
  })

  it('handles special characters', () => {
    expect(determineArticle('@mention')).toBe('a')
    expect(determineArticle('#hashtag')).toBe('a')
    expect(determineArticle('_underscore')).toBe('a')
  })

  it('does not treat unicode vowels as vowels', () => {
    expect(determineArticle('école')).toBe('a')
    expect(determineArticle('über')).toBe('a')
  })

  it('handles words with leading whitespace', () => {
    expect(determineArticle(' apple')).toBe('a')
    expect(determineArticle('\tapple')).toBe('a')
  })

  it('handles y as consonant', () => {
    expect(determineArticle('yellow')).toBe('a')
    expect(determineArticle('yak')).toBe('a')
  })
})
