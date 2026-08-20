import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

import { glob, globSync } from '../../../src/globs/match.mjs'

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

// `node:fs.glob`/`node:fs.globSync` have no `onlyFiles` notion and return
// directories alongside files; fast-glob defaults to `onlyFiles: true`. A
// caller passing only `cwd` takes the node:fs fast path, while adding any
// other option (`canUseNodeFsGlob`) falls back to fast-glob — both must
// agree that a matching directory is excluded by default.
describe.sequential('globs/match — onlyFiles default parity', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'socket-lib-glob-match-'))
    mkdirSync(path.join(tmpDir, 'entry-dir'), { recursive: true })
    writeFileSync(path.join(tmpDir, 'entry-file.txt'), 'x')
  })

  afterEach(async () => {
    await safeDelete(tmpDir)
  })

  it('glob: fast path (cwd only) returns the file, not the directory', async () => {
    const files = await glob('entry*', { cwd: tmpDir })
    expect(files).toContain('entry-file.txt')
    expect(files).not.toContain('entry-dir')
  })

  it('glob: fast-glob fallback (extra option) returns the file, not the directory', async () => {
    const files = await glob('entry*', { cwd: tmpDir, unique: true })
    expect(files).toContain('entry-file.txt')
    expect(files).not.toContain('entry-dir')
  })

  it('globSync: fast path (cwd only) returns the file, not the directory', () => {
    const files = globSync('entry*', { cwd: tmpDir })
    expect(files).toContain('entry-file.txt')
    expect(files).not.toContain('entry-dir')
  })

  it('globSync: fast-glob fallback (extra option) returns the file, not the directory', () => {
    const files = globSync('entry*', { cwd: tmpDir, unique: true })
    expect(files).toContain('entry-file.txt')
    expect(files).not.toContain('entry-dir')
  })
})
