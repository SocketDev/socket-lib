/**
 * @file Unit tests for glob streaming and ignore-pattern normalization.
 *   Companion to globs.test.mts. Covers:
 *
 *   - globStreamLicenses() streams license file paths matching LICENSE* patterns
 *   - Options: dot files, ignore patterns, recursive depth, absolute paths
 *   - Trailing-slash ignore patterns (gitignore `dist/` convention) are honored
 *     via stripTrailingSlash normalization before reaching fast-glob
 *   - Integration: matcher caching/consistency across calls
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { glob, globSync } from '../../src/globs/match'
import { getGlobMatcher } from '../../src/globs/matcher'
import { globStreamLicenses } from '../../src/globs/stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

describe('globStreamLicenses', () => {
  it('should return a readable stream', () => {
    const stream = globStreamLicenses(process.cwd())
    expect(stream).toBeDefined()
    expect(typeof stream.on).toBe('function')
    expect(typeof stream.pipe).toBe('function')
  })

  it('should stream license files', async () => {
    const files: string[] = []
    const stream = globStreamLicenses(process.cwd(), { recursive: false })

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (file: string) => files.push(file))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    expect(Array.isArray(files)).toBe(true)
  })

  it('should accept dirname parameter', () => {
    expect(() => globStreamLicenses('.')).not.toThrow()
    expect(() => globStreamLicenses('./src')).not.toThrow()
  })

  it('should accept options parameter', () => {
    expect(() => globStreamLicenses('.', {})).not.toThrow()
    expect(() => globStreamLicenses('.', { recursive: true })).not.toThrow()
  })

  it('should handle ignoreOriginals option', async () => {
    const files: string[] = []
    const stream = globStreamLicenses(process.cwd(), {
      ignoreOriginals: true,
      recursive: false,
    })

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (file: string) => files.push(file))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    // Should not include files matching *.original pattern
    expect(files.every(f => !f.includes('.original'))).toBe(true)
  })

  it('should handle recursive option', async () => {
    const files: string[] = []
    const stream = globStreamLicenses(process.cwd(), { recursive: true })

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (file: string) => files.push(file))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    expect(Array.isArray(files)).toBe(true)
  })

  it('should handle custom ignore patterns as array', async () => {
    const files: string[] = []
    const stream = globStreamLicenses(process.cwd(), {
      ignore: ['**/test/**', '**/node_modules/**'],
      recursive: false,
    })

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (file: string) => files.push(file))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    expect(Array.isArray(files)).toBe(true)
  })

  it('should handle absolute option', () => {
    const stream = globStreamLicenses('.', { absolute: false })
    expect(stream).toBeDefined()
  })

  it('should handle dot option', () => {
    const stream = globStreamLicenses('.', { dot: true })
    expect(stream).toBeDefined()
  })

  it('should handle deep option', () => {
    const stream = globStreamLicenses('.', { deep: 3 })
    expect(stream).toBeDefined()
  })

  it('should handle cwd option', () => {
    const stream = globStreamLicenses('.', { cwd: process.cwd() })
    expect(stream).toBeDefined()
  })

  it('should handle multiple options together', async () => {
    const files: string[] = []
    const stream = globStreamLicenses(process.cwd(), {
      recursive: true,
      ignoreOriginals: true,
      dot: true,
      absolute: true,
    })

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (file: string) => files.push(file))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    expect(Array.isArray(files)).toBe(true)
  })

  it('should be a function', () => {
    expect(typeof globStreamLicenses).toBe('function')
  })

  it('should handle empty options', () => {
    const stream = globStreamLicenses('.')
    expect(stream).toBeDefined()
    expect(typeof stream.on).toBe('function')
  })
})

// `tmpRoot` is captured at describe scope. Under vitest's default
// `sequence.concurrent: true` (off-CI), parallel `it` blocks would
// overwrite the shared variable mid-run. Force sequential here so
// each test sees its own beforeEach-created directory.
describe.sequential('trailing-slash ignore patterns', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'socket-lib-globs-'))
    mkdirSync(path.join(tmpRoot, 'dist'), { recursive: true })
    mkdirSync(path.join(tmpRoot, 'src'), { recursive: true })
    writeFileSync(path.join(tmpRoot, 'package.json'), '{}')
    writeFileSync(path.join(tmpRoot, 'src', 'a.json'), '{}')
    writeFileSync(path.join(tmpRoot, 'dist', 'b.json'), '{}')
  })

  afterEach(async () => {
    await safeDelete(tmpRoot)
  })

  // fast-glob silently drops `ignore` entries that end in `/` — the
  // gitignore convention `dist/` therefore did nothing at the walk
  // level. socket-lib normalizes the patterns with stripTrailingSlash
  // so the ignore is honored.
  it('glob: directory ignored via trailing-slash pattern is excluded', async () => {
    const files = await glob(['**/*.json'], {
      cwd: tmpRoot,
      ignore: ['**/dist/'],
    })
    expect(files.toSorted()).toEqual(['package.json', 'src/a.json'])
  })

  it('globSync: directory ignored via trailing-slash pattern is excluded', () => {
    const files = globSync(['**/*.json'], {
      cwd: tmpRoot,
      ignore: ['**/dist/'],
    })
    expect(files.toSorted()).toEqual(['package.json', 'src/a.json'])
  })

  it('glob: still honors patterns without trailing slash', async () => {
    const files = await glob(['**/*.json'], {
      cwd: tmpRoot,
      ignore: ['**/dist/**'],
    })
    expect(files.toSorted()).toEqual(['package.json', 'src/a.json'])
  })

  // Mixed: one entry has the trailing slash, one does not. Both
  // should suppress their target. Catches an early bug where the
  // normalized array dropped non-string entries silently.
  it('glob: handles mixed trailing/non-trailing slashes in same array', async () => {
    mkdirSync(path.join(tmpRoot, 'build'), { recursive: true })
    writeFileSync(path.join(tmpRoot, 'build', 'c.json'), '{}')
    const files = await glob(['**/*.json'], {
      cwd: tmpRoot,
      ignore: ['**/dist/', '**/build'],
    })
    expect(files.toSorted()).toEqual(['package.json', 'src/a.json'])
  })

  // Empty ignore array must still produce a normalized empty array
  // (not undefined, not throw). Catches a regression where an empty
  // option object was being passed through with `ignore: undefined`
  // and fast-glob fell back to its defaults.
  it('glob: accepts empty ignore array', async () => {
    const files = await glob(['**/*.json'], {
      cwd: tmpRoot,
      ignore: [],
    })
    expect(files.toSorted()).toEqual([
      'dist/b.json',
      'package.json',
      'src/a.json',
    ])
  })

  // A bare `/` should NOT be stripped — it's the root pattern and
  // turning it into '' would break the meaning. The guard is
  // `pattern.length > 1`.
  it('globSync: leaves a single-character "/" pattern unchanged', () => {
    // No file matches `/` literally; this just confirms the call
    // completes without throwing on the boundary case. Real value
    // is in the unit-level guard, not the file-level effect.
    const files = globSync(['**/*.json'], {
      cwd: tmpRoot,
      ignore: ['/'],
    })
    // Same result as no ignore at all — `/` was preserved (not
    // stripped to '') and didn't accidentally match the cwd.
    expect(files.toSorted()).toEqual([
      'dist/b.json',
      'package.json',
      'src/a.json',
    ])
  })

  // Calling without an `ignore` option at all must not crash on the
  // `options?.ignore` access path. Regression-guard for a typo where
  // `options.ignore` (missing the optional chain) used to throw.
  it('glob: works with no ignore option', async () => {
    const files = await glob(['**/*.json'], { cwd: tmpRoot })
    expect(files.toSorted()).toEqual([
      'dist/b.json',
      'package.json',
      'src/a.json',
    ])
  })
})

describe('globSync', () => {
  it('should be a function', () => {
    expect(typeof globSync).toBe('function')
  })

  it('should return an array', () => {
    const result = globSync('*.json', { cwd: process.cwd() })
    expect(Array.isArray(result)).toBe(true)
  })

  it('should find files matching pattern', () => {
    const files = globSync('*.json', { cwd: process.cwd() })
    expect(Array.isArray(files)).toBe(true)
    expect(files.length).toBeGreaterThan(0)
    expect(files.some(f => f.includes('package.json'))).toBe(true)
  })

  it('should accept array of patterns', () => {
    const files = globSync(['*.json', '*.md'], { cwd: process.cwd() })
    expect(Array.isArray(files)).toBe(true)
  })

  it('should respect cwd option', () => {
    const files = globSync('*.ts', { cwd: 'src' })
    expect(Array.isArray(files)).toBe(true)
  })

  it('should handle ignore patterns', () => {
    const files = globSync('**/*.ts', {
      cwd: 'src',
      ignore: ['**/paths/**'],
    })
    expect(Array.isArray(files)).toBe(true)
    expect(files.every(f => !f.includes('paths/'))).toBe(true)
  })

  it('should handle absolute option', () => {
    const files = globSync('*.json', {
      cwd: process.cwd(),
      absolute: true,
    })
    expect(Array.isArray(files)).toBe(true)
    if (files.length > 0) {
      expect(path.isAbsolute(files[0]!)).toBe(true)
    }
  })

  it('should handle onlyFiles option', () => {
    const files = globSync('*', { cwd: process.cwd(), onlyFiles: true })
    expect(Array.isArray(files)).toBe(true)
  })

  it('should handle dot option', () => {
    const files = globSync('.*', { cwd: process.cwd(), dot: true })
    expect(Array.isArray(files)).toBe(true)
  })

  it('should return same results as async glob', async () => {
    const syncFiles = globSync('*.json', { cwd: process.cwd() })
    const asyncFiles = await glob('*.json', { cwd: process.cwd() })
    expect(syncFiles.toSorted()).toEqual(asyncFiles.toSorted())
  })

  it('should handle empty pattern array', () => {
    const files = globSync([], { cwd: process.cwd() })
    expect(Array.isArray(files)).toBe(true)
    expect(files.length).toBe(0)
  })

  it('should handle single pattern string', () => {
    const files = globSync('package.json', { cwd: process.cwd() })
    expect(Array.isArray(files)).toBe(true)
    expect(files.some(f => f.includes('package.json'))).toBe(true)
  })

  it('should handle negation patterns', () => {
    const files = globSync(['*.json', '!package-lock.json'], {
      cwd: process.cwd(),
    })
    expect(Array.isArray(files)).toBe(true)
    expect(files.every(f => !f.includes('package-lock.json'))).toBe(true)
  })

  it('should work without options parameter', () => {
    const files = globSync('*.json')
    expect(Array.isArray(files)).toBe(true)
  })
})

describe('glob integration', () => {
  it('should have consistent behavior across calls', () => {
    const matcher1 = getGlobMatcher('*.js')
    const matcher2 = getGlobMatcher('*.js')
    const testPath = 'test.js'

    expect(matcher1(testPath)).toBe(matcher2(testPath))
  })

  it('should handle real-world patterns', () => {
    const matcher = getGlobMatcher([
      '**/*.js',
      '!**/node_modules/**',
      '!**/dist/**',
    ])
    expect(matcher('src/app.js')).toBe(true)
    expect(matcher('node_modules/pkg/index.js')).toBe(false)
    expect(matcher('dist/bundle.js')).toBe(false)
  })
})
