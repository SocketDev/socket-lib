import { describe, expect, it } from 'vitest'

import { capitalize } from '../../../src/words/capitalize'

describe('words/capitalize', () => {
  it('capitalizes first letter of lowercase word', () => {
    expect(capitalize('hello')).toBe('Hello')
    expect(capitalize('world')).toBe('World')
  })

  it('capitalizes and lowercases rest of word', () => {
    expect(capitalize('HELLO')).toBe('Hello')
    expect(capitalize('wORLD')).toBe('World')
    expect(capitalize('MiXeD')).toBe('Mixed')
  })

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A')
    expect(capitalize('Z')).toBe('Z')
  })

  it('handles empty string', () => {
    expect(capitalize('')).toBe('')
  })

  it('handles words with numbers', () => {
    expect(capitalize('test123')).toBe('Test123')
    expect(capitalize('123test')).toBe('123test')
  })

  it('handles words with special characters', () => {
    expect(capitalize('hello-world')).toBe('Hello-world')
    expect(capitalize('test_case')).toBe('Test_case')
    expect(capitalize('@special')).toBe('@special')
  })

  it('handles unicode characters', () => {
    expect(capitalize('école')).toBe('École')
    expect(capitalize('ÉCOLE')).toBe('École')
    expect(capitalize('über')).toBe('Über')
  })

  it('handles words with spaces', () => {
    expect(capitalize('hello world')).toBe('Hello world')
    expect(capitalize(' hello')).toBe(' hello')
  })

  it('handles words with leading numbers', () => {
    expect(capitalize('2nd')).toBe('2nd')
    expect(capitalize('3rd')).toBe('3rd')
  })

  it('handles emoji', () => {
    expect(capitalize('😀hello')).toBe('😀hello')
    expect(capitalize('hello😀')).toBe('Hello😀')
  })

  it('handles already capitalized words', () => {
    expect(capitalize('Hello')).toBe('Hello')
    expect(capitalize('World')).toBe('World')
  })

  it('handles two character words', () => {
    expect(capitalize('ab')).toBe('Ab')
    expect(capitalize('AB')).toBe('Ab')
    expect(capitalize('Ab')).toBe('Ab')
  })
})
