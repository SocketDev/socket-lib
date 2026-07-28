/**
 * @file Unit tests for src/dlx/package — paths surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { runWithTempDir } from '../../util/temp-file-helper'

describe('path construction (cross-platform)', () => {
  it('should construct normalized paths on current platform', async () => {
    await runWithTempDir(async tempDir => {
      const dlxDir = path.join(tempDir, '_dlx')
      const hash = '0a80f0fb114540fe'
      const packageDir = path.join(dlxDir, hash)

      // Verify path uses platform-specific separators.
      if (process.platform === 'win32') {
        expect(packageDir).toContain('\\')
      } else {
        expect(packageDir).toContain('/')
      }

      // Verify path is absolute.
      expect(path.isAbsolute(packageDir)).toBe(true)
    }, 'dlx-pkg-path-')
  })

  it('should handle scoped package names in paths', async () => {
    await runWithTempDir(async tempDir => {
      const packageDir = path.join(tempDir, 'node_modules')
      const scopedName = '@cyclonedx/cdxgen'

      // Node.js path.join handles forward slashes in package names.
      const installedDir = path.join(packageDir, scopedName)

      // Verify path is constructed correctly.
      expect(installedDir).toContain(packageDir)
      expect(installedDir).toContain('cyclonedx')
      expect(installedDir).toContain('cdxgen')

      // On Windows, forward slash in package name becomes backslash.
      if (process.platform === 'win32') {
        expect(installedDir).toContain('\\@cyclonedx\\cdxgen')
      } else {
        expect(installedDir).toContain('/@cyclonedx/cdxgen')
      }
    }, 'dlx-pkg-scoped-')
  })

  it('should handle binary paths from package.json', async () => {
    await runWithTempDir(async tempDir => {
      const installedDir = path.join(tempDir, 'node_modules', 'pkg')
      const binPath = './bin/cli.js' // From package.json (always forward slashes).

      // path.join normalizes forward slashes to platform separator.
      const fullBinPath = path.join(installedDir, binPath)

      // Verify path is constructed correctly.
      expect(fullBinPath).toContain('bin')
      expect(fullBinPath).toContain('cli.js')

      if (process.platform === 'win32') {
        expect(fullBinPath).toContain('\\bin\\cli.js')
      } else {
        expect(fullBinPath).toContain('/bin/cli.js')
      }
    }, 'dlx-pkg-binpath-')
  })

  it('should normalize mixed separators in paths', async () => {
    await runWithTempDir(async tempDir => {
      const basePath = tempDir
      const relativePath = 'node_modules/@scope/pkg/bin/cli.js'

      // path.join handles mixed separators.
      const fullPath = path.join(basePath, relativePath)

      expect(path.isAbsolute(fullPath)).toBe(true)
      expect(fullPath).toContain('node_modules')
      expect(fullPath).toContain('cli.js')
    }, 'dlx-pkg-mixed-')
  })
})

describe('version range detection', () => {
  const rangeOperatorsRegExp = /[~^><=xX* ]|\|\|/

  it('should detect caret ranges', () => {
    expect(rangeOperatorsRegExp.test('^1.0.0')).toBe(true)
    expect(rangeOperatorsRegExp.test('^11.0.0')).toBe(true)
  })

  it('should detect tilde ranges', () => {
    expect(rangeOperatorsRegExp.test('~1.0.0')).toBe(true)
    expect(rangeOperatorsRegExp.test('~11.7.0')).toBe(true)
  })

  it('should detect greater than ranges', () => {
    expect(rangeOperatorsRegExp.test('>1.0.0')).toBe(true)
    expect(rangeOperatorsRegExp.test('>=1.0.0')).toBe(true)
  })

  it('should detect less than ranges', () => {
    expect(rangeOperatorsRegExp.test('<2.0.0')).toBe(true)
    expect(rangeOperatorsRegExp.test('<=2.0.0')).toBe(true)
  })

  it('should detect wildcard ranges', () => {
    expect(rangeOperatorsRegExp.test('1.0.x')).toBe(true)
    expect(rangeOperatorsRegExp.test('1.0.X')).toBe(true)
    expect(rangeOperatorsRegExp.test('1.0.*')).toBe(true)
  })

  it('should detect complex ranges', () => {
    expect(rangeOperatorsRegExp.test('>1.0.0 <2.0.0')).toBe(true)
    expect(rangeOperatorsRegExp.test('>=1.0.0 <=2.0.0')).toBe(true)
    expect(rangeOperatorsRegExp.test('1.0.0 || 2.0.0')).toBe(true)
  })

  it('should not detect exact versions', () => {
    expect(rangeOperatorsRegExp.test('1.0.0')).toBe(false)
    expect(rangeOperatorsRegExp.test('11.7.0')).toBe(false)
    expect(rangeOperatorsRegExp.test('0.0.1')).toBe(false)
  })

  it('should not detect versions with prerelease tags', () => {
    expect(rangeOperatorsRegExp.test('1.0.0-alpha')).toBe(false)
    expect(rangeOperatorsRegExp.test('1.0.0-beta.1')).toBe(false)
    expect(rangeOperatorsRegExp.test('1.0.0+build.123')).toBe(false)
  })

  it('should handle packages with x in name correctly', () => {
    // Note: Regex matches 'x' character anywhere, but in real usage
    // we only test the version string, not the package name.
    // Package name '@cyclonedx/cdxgen' contains 'x' which would match,
    // but this is fine because we parse name and version separately.
    expect(rangeOperatorsRegExp.test('cyclonedx')).toBe(true) // Contains 'x'.
    expect(rangeOperatorsRegExp.test('express')).toBe(true) // Contains 'x'.

    // In practice, we only test version strings.
    expect(rangeOperatorsRegExp.test('1.2.3')).toBe(false) // Exact version, no 'x'.
  })
})
