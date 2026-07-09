import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { glob } from '../../../src/globs/match'

describe('globs/match — glob', () => {
  it('should be a function', () => {
    expect(typeof glob).toBe('function')
  })

  it('should return a promise', () => {
    const result = glob('*.js')
    expect(result).toBeInstanceOf(Promise)
  })

  it('should find files matching pattern', async () => {
    const files = await glob('*.json', { cwd: process.cwd() })
    expect(Array.isArray(files)).toBe(true)
    expect(files.length).toBeGreaterThan(0)
    expect(files.some(f => f.includes('package.json'))).toBe(true)
  })

  it('should accept array of patterns', async () => {
    const files = await glob(['*.json', '*.md'], { cwd: process.cwd() })
    expect(Array.isArray(files)).toBe(true)
  })

  it('should respect cwd option', async () => {
    const files = await glob('*.ts', { cwd: 'src' })
    expect(Array.isArray(files)).toBe(true)
  })

  it('should handle ignore patterns', async () => {
    const files = await glob('**/*.ts', {
      cwd: 'src',
      ignore: ['**/paths/**'],
    })
    expect(Array.isArray(files)).toBe(true)
    expect(files.every(f => !f.includes('paths/'))).toBe(true)
  })

  it('should handle absolute option', async () => {
    const files = await glob('*.json', {
      cwd: process.cwd(),
      absolute: true,
    })
    expect(Array.isArray(files)).toBe(true)
    if (files.length > 0) {
      expect(path.isAbsolute(files[0]!)).toBe(true)
    }
  })

  it('should handle onlyFiles option', async () => {
    const files = await glob('*', { cwd: process.cwd(), onlyFiles: true })
    expect(Array.isArray(files)).toBe(true)
  })

  it('should handle dot option', async () => {
    const files = await glob('.*', { cwd: process.cwd(), dot: true })
    expect(Array.isArray(files)).toBe(true)
  })

  it('should handle empty pattern array', async () => {
    const files = await glob([], { cwd: process.cwd() })
    expect(Array.isArray(files)).toBe(true)
    expect(files.length).toBe(0)
  })

  it('should handle single pattern string', async () => {
    const files = await glob('package.json', { cwd: process.cwd() })
    expect(Array.isArray(files)).toBe(true)
    expect(files.some(f => f.includes('package.json'))).toBe(true)
  })

  it('should handle negation patterns', async () => {
    const files = await glob(['*.json', '!package-lock.json'], {
      cwd: process.cwd(),
    })
    expect(Array.isArray(files)).toBe(true)
    expect(files.every(f => !f.includes('package-lock.json'))).toBe(true)
  })

  it('should work without options parameter', async () => {
    const files = await glob('*.json')
    expect(Array.isArray(files)).toBe(true)
  })
})
