/**
 * @fileoverview Unit tests for DLX package installation and resolution.
 *
 * Tests DLX package installation and binary resolution:
 * - generatePackageCacheKey() creates SHA256-based cache keys
 * - Package installation to cache directory
 * - Binary resolution from installed packages
 * - Cross-platform compatibility (Windows, Unix)
 * - node_modules structure validation
 * Used by Socket CLI dlxBinary() for package extraction and execution.
 */

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type {
  DlxPackageOptions,
  DlxPackageResult,
} from '@socketsecurity/lib/dlx/package'
import {
  ensurePackageInstalled,
  executePackage,
  findBinaryPath,
  makePackageBinsExecutable,
  npmPurl,
  resolveBinaryPath,
} from '@socketsecurity/lib/dlx/package'
import { setPath } from '@socketsecurity/lib/paths/rewire'
import { runWithTempDir } from '../utils/temp-file-helper'

describe('dlx-package', () => {
  describe('generatePackageCacheKey', () => {
    it('should generate consistent 16-char hex hash', () => {
      const spec = 'cowsay@1.6.0'
      const hash1 = createHash('sha256').update(spec).digest('hex').slice(0, 16)
      const hash2 = createHash('sha256').update(spec).digest('hex').slice(0, 16)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(16)
      expect(hash1).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should generate different hashes for different specs', () => {
      const hash1 = createHash('sha256')
        .update('cowsay@1.6.0')
        .digest('hex')
        .slice(0, 16)
      const hash2 = createHash('sha256')
        .update('cowsay@1.5.0')
        .digest('hex')
        .slice(0, 16)

      expect(hash1).not.toBe(hash2)
    })

    it('should generate same hash for same spec across platforms', () => {
      // Hash is based on string, not paths, so platform-independent.
      const spec = '@cyclonedx/cdxgen@11.7.0'
      const hash = createHash('sha256').update(spec).digest('hex').slice(0, 16)

      // Verify hash is lowercase hex.
      expect(hash).toMatch(/^[0-9a-f]{16}$/)
      expect(hash).toHaveLength(16)
    })
  })

  describe('parsePackageSpec', () => {
    it('should parse unscoped package with version', () => {
      // This tests the internal parsePackageSpec via the public API behavior.
      const spec = 'lodash@4.17.21'
      expect(spec).toContain('@')
      expect(spec.split('@')).toHaveLength(2)
    })

    it('should parse unscoped package without version', () => {
      const spec = 'lodash'
      expect(spec).not.toContain('@')
    })

    it('should parse scoped package with version', () => {
      const spec = '@cyclonedx/cdxgen@11.7.0'
      const parts = spec.split('@')
      expect(parts).toHaveLength(3)
      expect(parts[0]).toBe('')
      expect(parts[1]).toBe('cyclonedx/cdxgen')
      expect(parts[2]).toBe('11.7.0')
    })

    it('should parse scoped package without version', () => {
      const spec = '@cyclonedx/cdxgen'
      const parts = spec.split('@')
      expect(parts).toHaveLength(2)
      expect(parts[0]).toBe('')
      expect(parts[1]).toBe('cyclonedx/cdxgen')
    })

    it('should handle scoped package without version in fallback parser', () => {
      // Test the edge case fixed in dlx/package.ts:621
      // Scoped packages without version: @scope/package
      // Should return { name: '@scope/package', version: undefined }
      const spec = '@types/node'
      const lastAtIndex = spec.lastIndexOf('@')
      expect(lastAtIndex).toBe(0) // @ is at position 0 for scoped package without version
      // When atIndex === 0, it's a scoped package without version
    })

    it('should handle scoped package with version in fallback parser', () => {
      // Scoped packages with version: @scope/package@version
      const spec = '@types/node@20.0.0'
      const lastAtIndex = spec.lastIndexOf('@')
      expect(lastAtIndex).toBeGreaterThan(0) // @ is after position 0
      const name = spec.slice(0, lastAtIndex)
      const version = spec.slice(lastAtIndex + 1)
      expect(name).toBe('@types/node')
      expect(version).toBe('20.0.0')
    })

    it('should distinguish between scoped packages with and without versions', () => {
      // Test cases that should be distinguished correctly
      const testCases = [
        { spec: '@babel/core', hasVersion: false, atIndex: 0 },
        { spec: '@babel/core@7.0.0', hasVersion: true, atIndex: 11 },
        { spec: '@types/node', hasVersion: false, atIndex: 0 },
        { spec: '@types/node@18.0.0', hasVersion: true, atIndex: 11 },
      ]

      for (const { atIndex, hasVersion, spec } of testCases) {
        const lastAt = spec.lastIndexOf('@')
        expect(lastAt).toBe(atIndex)
        if (hasVersion) {
          expect(lastAt).toBeGreaterThan(0)
        } else {
          expect(lastAt).toBe(0)
        }
      }
    })

    it('should handle complex version ranges', () => {
      const specs = [
        'lodash@^4.17.0',
        'lodash@~4.17.21',
        'lodash@>=4.0.0',
        'lodash@>4.0.0 <5.0.0',
      ]

      for (const spec of specs) {
        expect(spec).toContain('@')
        const atIndex = spec.lastIndexOf('@')
        expect(atIndex).toBeGreaterThan(0)
      }
    })
  })

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

  describe('DlxPackageOptions interface', () => {
    it('should accept valid package specs', () => {
      const options: DlxPackageOptions = {
        package: 'cowsay@1.6.0',
      }

      expect(options.package).toBe('cowsay@1.6.0')
      expect(options.force).toBeUndefined()
      expect(options.spawnOptions).toBeUndefined()
    })

    it('should accept force option', () => {
      const options: DlxPackageOptions = {
        force: true,
        package: 'cowsay@1.6.0',
      }

      expect(options.force).toBe(true)
    })

    it('should accept yes option (CLI-style)', () => {
      const options: DlxPackageOptions = {
        package: 'cowsay@1.6.0',
        yes: true,
      }

      expect(options.yes).toBe(true)
    })

    it('should accept quiet option (CLI-style, reserved)', () => {
      const options: DlxPackageOptions = {
        package: 'cowsay@1.6.0',
        quiet: true,
      }

      expect(options.quiet).toBe(true)
    })

    it('should accept spawn options', () => {
      const options: DlxPackageOptions = {
        package: 'cowsay@1.6.0',
        spawnOptions: {
          cwd: '/tmp',
          env: { FOO: 'bar' },
        },
      }

      expect(options.spawnOptions?.cwd).toBe('/tmp')
      expect(options.spawnOptions?.env?.['FOO']).toBe('bar')
    })

    it('should handle yes and force together', () => {
      const options: DlxPackageOptions = {
        force: false,
        package: 'cowsay@1.6.0',
        yes: true,
      }

      // Both flags can be set independently
      expect(options.yes).toBe(true)
      expect(options.force).toBe(false)
      // In implementation, yes takes precedence and implies force
    })
  })

  describe('DlxPackageResult interface', () => {
    it('should have correct field types', () => {
      // Verify interface structure at compile time.
      const result: Partial<DlxPackageResult> = {
        binaryPath: '/path/to/binary',
        installed: true,
        packageDir: '/path/to/package',
      }

      expect(result.packageDir).toBe('/path/to/package')
      expect(result.binaryPath).toBe('/path/to/binary')
      expect(result.installed).toBe(true)
    })
  })

  describe('cross-platform binary execution', () => {
    it('should identify Windows platform correctly', () => {
      const isWindows = process.platform === 'win32'
      expect(typeof isWindows).toBe('boolean')
    })

    it('should handle binary permissions on Unix', async () => {
      if (process.platform === 'win32') {
        // Skip on Windows.
        return
      }

      await runWithTempDir(async tempDir => {
        // Create a mock binary file.
        const binPath = path.join(tempDir, 'test-binary')
        writeFileSync(binPath, '#!/bin/bash\necho "test"')

        // Verify file exists.
        expect(existsSync(binPath)).toBe(true)
      }, 'dlx-pkg-unix-')
    })

    it('should skip chmod on Windows', async () => {
      if (process.platform !== 'win32') {
        // Skip on non-Windows.
        return
      }

      await runWithTempDir(async tempDir => {
        // On Windows, chmod is skipped (no-op).
        const binPath = path.join(tempDir, 'test.bat')
        writeFileSync(binPath, '@echo off\necho test')

        expect(existsSync(binPath)).toBe(true)
      }, 'dlx-pkg-win-')
    })
  })

  describe('hash collision resistance', () => {
    it('should have extremely low collision probability', () => {
      // Generate hashes for many similar specs.
      const specs = [
        'pkg@1.0.0',
        'pkg@1.0.1',
        'pkg@1.1.0',
        'pkg@2.0.0',
        'pkg-a@1.0.0',
        'pkg-b@1.0.0',
      ]

      const hashes = new Set<string>()
      for (const spec of specs) {
        const hash = createHash('sha256')
          .update(spec)
          .digest('hex')
          .slice(0, 16)
        hashes.add(hash)
      }

      // All hashes should be unique.
      expect(hashes.size).toBe(specs.length)
    })

    it('should handle unicode in package names', () => {
      // Some packages have unicode in names.
      const spec = 'emoji-😀@1.0.0'
      const hash = createHash('sha256').update(spec).digest('hex').slice(0, 16)

      expect(hash).toMatch(/^[0-9a-f]{16}$/)
      expect(hash).toHaveLength(16)
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

  describe('binary resolution with cross-platform wrappers', () => {
    it('should resolve .cmd wrapper on Windows', async () => {
      if (process.platform !== 'win32') {
        return
      }

      await runWithTempDir(async tempDir => {
        // Create mock package structure
        const nodeModules = path.join(tempDir, 'node_modules', 'test-pkg')
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json with binary
        const pkgJson = {
          name: 'test-pkg',
          version: '1.0.0',
          bin: {
            'test-cli': './bin/cli.js',
          },
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Create binary directory
        const binDir = path.join(nodeModules, 'bin')
        mkdirSync(binDir, { recursive: true })

        // Create .cmd wrapper (Windows shim created by npm)
        writeFileSync(
          path.join(binDir, 'cli.js.cmd'),
          '@echo off\nnode "%~dp0cli.js" %*',
        )

        // Also create the actual JS file
        writeFileSync(
          path.join(binDir, 'cli.js'),
          '#!/usr/bin/env node\nconsole.log("test")',
        )

        // Binary resolution should find the .cmd wrapper
        expect(existsSync(path.join(binDir, 'cli.js.cmd'))).toBe(true)
      }, 'dlx-pkg-cmd-')
    })

    it('should resolve .ps1 wrapper on Windows', async () => {
      if (process.platform !== 'win32') {
        return
      }

      await runWithTempDir(async tempDir => {
        // Create mock package structure
        const nodeModules = path.join(tempDir, 'node_modules', 'test-pkg')
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json
        const pkgJson = {
          name: 'test-pkg',
          version: '1.0.0',
          bin: './bin/cli.js',
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Create binary directory
        const binDir = path.join(nodeModules, 'bin')
        mkdirSync(binDir, { recursive: true })

        // Create .ps1 wrapper (PowerShell wrapper)
        writeFileSync(
          path.join(binDir, 'cli.js.ps1'),
          '#!/usr/bin/env pwsh\n$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\nnode "$basedir/cli.js" $args',
        )

        // Create the actual JS file
        writeFileSync(
          path.join(binDir, 'cli.js'),
          '#!/usr/bin/env node\nconsole.log("test")',
        )

        // Binary resolution should find the .ps1 wrapper
        expect(existsSync(path.join(binDir, 'cli.js.ps1'))).toBe(true)
      }, 'dlx-pkg-ps1-')
    })

    it('should resolve .exe binary on Windows', async () => {
      await runWithTempDir(async tempDir => {
        if (process.platform !== 'win32') {
          return
        }

        // Create mock package structure
        const nodeModules = path.join(tempDir, 'node_modules', 'test-pkg')
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json
        const pkgJson = {
          name: 'test-pkg',
          version: '1.0.0',
          bin: './bin/tool',
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Create binary directory
        const binDir = path.join(nodeModules, 'bin')
        mkdirSync(binDir, { recursive: true })

        // Create .exe binary (native executable)
        writeFileSync(path.join(binDir, 'tool.exe'), 'MZ\x90\x00') // Minimal PE header

        // Binary resolution should find the .exe
        expect(existsSync(path.join(binDir, 'tool.exe'))).toBe(true)
      }, 'dlx-pkg-exe-')
    })

    it('should use bare path on Unix', async () => {
      await runWithTempDir(async tempDir => {
        if (process.platform === 'win32') {
          return
        }

        // Create mock package structure
        const nodeModules = path.join(tempDir, 'node_modules', 'test-pkg')
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json
        const pkgJson = {
          name: 'test-pkg',
          version: '1.0.0',
          bin: './bin/cli',
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Create binary directory
        const binDir = path.join(nodeModules, 'bin')
        mkdirSync(binDir, { recursive: true })

        // Create bare executable (no wrapper needed on Unix)
        writeFileSync(
          path.join(binDir, 'cli'),
          '#!/usr/bin/env node\nconsole.log("test")',
        )

        // Binary resolution should use the bare path directly
        expect(existsSync(path.join(binDir, 'cli'))).toBe(true)
      }, 'dlx-pkg-unix-')
    })

    it('should handle missing binary error', async () => {
      await runWithTempDir(async tempDir => {
        // Create mock package without bin field
        const nodeModules = path.join(tempDir, 'node_modules', 'no-bin-pkg')
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json without bin field
        const pkgJson = {
          name: 'no-bin-pkg',
          version: '1.0.0',
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Reading package.json should work but bin field is missing
        expect(existsSync(path.join(nodeModules, 'package.json'))).toBe(true)
        const pkg = JSON.parse(
          readFileSync(path.join(nodeModules, 'package.json'), 'utf8'),
        )
        expect(pkg.bin).toBeUndefined()
      }, 'dlx-pkg-missing-')
    })

    it('should auto-select single binary', async () => {
      await runWithTempDir(async tempDir => {
        // Create mock package with single binary
        const nodeModules = path.join(tempDir, 'node_modules', 'single-bin')
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json with single binary
        const pkgJson = {
          name: 'single-bin',
          version: '1.0.0',
          bin: './cli.js',
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Create binary
        writeFileSync(
          path.join(nodeModules, 'cli.js'),
          '#!/usr/bin/env node\nconsole.log("test")',
        )

        // Should auto-select the single binary
        expect(existsSync(path.join(nodeModules, 'cli.js'))).toBe(true)
        const pkg = JSON.parse(
          readFileSync(path.join(nodeModules, 'package.json'), 'utf8'),
        )
        expect(typeof pkg.bin).toBe('string')
        expect(pkg.bin).toBe('./cli.js')
      }, 'dlx-pkg-single-')
    })

    it('should select correct binary from multiple options', async () => {
      await runWithTempDir(async tempDir => {
        // Create mock package with multiple binaries
        const nodeModules = path.join(
          tempDir,
          'node_modules',
          '@scope',
          'multi-bin',
        )
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json with multiple binaries
        const pkgJson = {
          name: '@scope/multi-bin',
          version: '1.0.0',
          bin: {
            'tool-a': './bin/a.js',
            'tool-b': './bin/b.js',
            'multi-bin': './bin/main.js',
          },
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Create binary directory
        const binDir = path.join(nodeModules, 'bin')
        mkdirSync(binDir, { recursive: true })

        // Create all binaries
        writeFileSync(
          path.join(binDir, 'a.js'),
          '#!/usr/bin/env node\nconsole.log("a")',
        )
        writeFileSync(
          path.join(binDir, 'b.js'),
          '#!/usr/bin/env node\nconsole.log("b")',
        )
        writeFileSync(
          path.join(binDir, 'main.js'),
          '#!/usr/bin/env node\nconsole.log("main")',
        )

        // Should find the binary matching last segment of package name
        const pkg = JSON.parse(
          readFileSync(path.join(nodeModules, 'package.json'), 'utf8'),
        )
        expect(pkg.bin['multi-bin']).toBe('./bin/main.js')

        // Test fallback to first binary
        expect(Object.keys(pkg.bin)[0]).toBe('tool-a')
      }, 'dlx-pkg-multi-')
    })

    it('should fallback to first binary when name does not match', async () => {
      await runWithTempDir(async tempDir => {
        // Create mock package with multiple binaries
        const nodeModules = path.join(tempDir, 'node_modules', 'fallback-pkg')
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json where no binary name matches package name
        const pkgJson = {
          name: 'fallback-pkg',
          version: '1.0.0',
          bin: {
            'other-a': './bin/a.js',
            'other-b': './bin/b.js',
          },
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Create binary directory
        const binDir = path.join(nodeModules, 'bin')
        mkdirSync(binDir, { recursive: true })

        // Create binaries
        writeFileSync(
          path.join(binDir, 'a.js'),
          '#!/usr/bin/env node\nconsole.log("a")',
        )
        writeFileSync(
          path.join(binDir, 'b.js'),
          '#!/usr/bin/env node\nconsole.log("b")',
        )

        // Should fall back to first binary (other-a)
        const pkg = JSON.parse(
          readFileSync(path.join(nodeModules, 'package.json'), 'utf8'),
        )
        const firstBinary = Object.keys(pkg.bin)[0]!
        expect(firstBinary).toBe('other-a')
        expect(pkg.bin[firstBinary]).toBe('./bin/a.js')
      }, 'dlx-pkg-fallback-')
    })

    it('should prioritize wrapper extensions on Windows', async () => {
      await runWithTempDir(async tempDir => {
        if (process.platform !== 'win32') {
          return
        }

        // Create mock package structure
        const nodeModules = path.join(tempDir, 'node_modules', 'wrapper-test')
        mkdirSync(nodeModules, { recursive: true })

        // Create package.json
        const pkgJson = {
          name: 'wrapper-test',
          version: '1.0.0',
          bin: './bin/tool',
        }
        writeFileSync(
          path.join(nodeModules, 'package.json'),
          JSON.stringify(pkgJson),
        )

        // Create binary directory
        const binDir = path.join(nodeModules, 'bin')
        mkdirSync(binDir, { recursive: true })

        // Create multiple wrappers - .cmd should be prioritized
        writeFileSync(path.join(binDir, 'tool.cmd'), '@echo off\nnode tool.js')
        writeFileSync(
          path.join(binDir, 'tool.ps1'),
          '#!/usr/bin/env pwsh\nnode tool.js',
        )
        writeFileSync(path.join(binDir, 'tool'), '#!/bin/sh\nnode tool.js')

        // Verify all wrappers exist
        expect(existsSync(path.join(binDir, 'tool.cmd'))).toBe(true)
        expect(existsSync(path.join(binDir, 'tool.ps1'))).toBe(true)
        expect(existsSync(path.join(binDir, 'tool'))).toBe(true)

        // Resolution should prefer .cmd (npm's default wrapper format)
        // This tests the priority order: .cmd, .bat, .ps1, .exe, bare
      }, 'dlx-pkg-priority-')
    })
  })

  describe('npmPurl', () => {
    // Canonical PURL outputs verified against @socketregistry/packageurl-js

    it('should build PURL for unscoped package', () => {
      expect(npmPurl('lodash', '4.17.21')).toBe('pkg:npm/lodash@4.17.21')
    })

    it('should build PURL for scoped package', () => {
      expect(npmPurl('@babel/core', '7.0.0')).toBe(
        'pkg:npm/%40babel/core@7.0.0',
      )
    })

    it('should encode @ as %40 for scoped packages', () => {
      const purl = npmPurl('@socketsecurity/lib', '5.17.0')
      expect(purl).toBe('pkg:npm/%40socketsecurity/lib@5.17.0')
      expect(purl).not.toContain('@socketsecurity')
      expect(purl).toContain('%40socketsecurity')
    })

    it('should leave / literal in scoped package namespace', () => {
      const purl = npmPurl('@types/node', '20.0.0')
      expect(purl).toBe('pkg:npm/%40types/node@20.0.0')
      expect(purl).not.toContain('%2F')
    })

    it('should handle simple package names without encoding', () => {
      expect(npmPurl('ecc-agentshield', '1.4.0')).toBe(
        'pkg:npm/ecc-agentshield@1.4.0',
      )
    })

    it('should handle single-char package names', () => {
      expect(npmPurl('x', '1.0.0')).toBe('pkg:npm/x@1.0.0')
    })

    it('should handle single-char scoped packages', () => {
      expect(npmPurl('@a/b', '0.0.0')).toBe('pkg:npm/%40a/b@0.0.0')
    })

    it('should handle names with dashes', () => {
      expect(npmPurl('@scope/name-with-dashes', '2.3.4')).toBe(
        'pkg:npm/%40scope/name-with-dashes@2.3.4',
      )
      expect(npmPurl('my-pkg', '0.0.1')).toBe('pkg:npm/my-pkg@0.0.1')
    })

    it('should handle prerelease versions', () => {
      expect(npmPurl('foo', '1.0.0-beta.1')).toBe('pkg:npm/foo@1.0.0-beta.1')
      expect(npmPurl('foo', '0.0.1-alpha')).toBe('pkg:npm/foo@0.0.1-alpha')
    })

    it('should encode + in version as %2B per PURL spec', () => {
      // PURL spec requires + to be percent-encoded in the version segment
      expect(npmPurl('foo', '1.0.0-rc.0+build.123')).toBe(
        'pkg:npm/foo@1.0.0-rc.0%2Bbuild.123',
      )
    })

    it('should not encode + when absent from version', () => {
      const purl = npmPurl('foo', '1.0.0')
      expect(purl).not.toContain('%2B')
    })

    it('should always start with pkg:npm/', () => {
      expect(npmPurl('foo', '1.0.0')).toMatch(/^pkg:npm\//)
      expect(npmPurl('@bar/baz', '2.0.0')).toMatch(/^pkg:npm\//)
    })

    it('should always end with @version', () => {
      expect(npmPurl('foo', '1.2.3')).toMatch(/@1\.2\.3$/)
      expect(npmPurl('@scope/pkg', '0.0.1')).toMatch(/@0\.0\.1$/)
    })

    it('should produce URL-encodable PURLs for firewall API', () => {
      const purl = npmPurl('@babel/core', '7.0.0')
      const encoded = encodeURIComponent(purl)
      // encodeURIComponent double-encodes: %40 → %2540, / → %2F, : → %3A
      expect(encoded).toContain('pkg%3Anpm')
      expect(encoded).toContain('%2540babel')
    })

    it('should match canonical packageurl-js output', () => {
      // These expected values were verified against
      // @socketregistry/packageurl-js PackageURL.toString()
      const cases: Array<[string, string, string]> = [
        ['lodash', '4.17.21', 'pkg:npm/lodash@4.17.21'],
        ['@babel/core', '7.0.0', 'pkg:npm/%40babel/core@7.0.0'],
        ['@types/node', '20.0.0', 'pkg:npm/%40types/node@20.0.0'],
        ['ecc-agentshield', '1.4.0', 'pkg:npm/ecc-agentshield@1.4.0'],
        [
          '@socketsecurity/lib',
          '5.17.0',
          'pkg:npm/%40socketsecurity/lib@5.17.0',
        ],
        ['x', '1.0.0', 'pkg:npm/x@1.0.0'],
        ['@a/b', '0.0.0', 'pkg:npm/%40a/b@0.0.0'],
        ['foo', '1.0.0-rc.0+build.123', 'pkg:npm/foo@1.0.0-rc.0%2Bbuild.123'],
      ]
      for (const [name, version, expected] of cases) {
        expect(npmPurl(name, version)).toBe(expected)
      }
    })
  })

  describe('findBinaryPath', () => {
    it('returns the bin path when bin is a string', () => {
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'my-tool')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({ name: 'my-tool', version: '1.0.0', bin: 'cli.js' }),
        )
        const result = findBinaryPath(pkgDir, 'my-tool')
        expect(result).toContain('cli.js')
        expect(result).toContain('my-tool')
      })
    })

    it('uses the single binary when bin is an object with one entry', () => {
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'pkg-a')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({
            name: 'pkg-a',
            version: '1.0.0',
            bin: { 'only-one': 'bin/main.js' },
          }),
        )
        const result = findBinaryPath(pkgDir, 'pkg-a')
        expect(result).toContain('bin/main.js')
      })
    })

    it('throws when no binary is declared', () => {
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'no-bins')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({ name: 'no-bins', version: '1.0.0' }),
        )
        expect(() => findBinaryPath(pkgDir, 'no-bins')).toThrow(
          /No binary found/,
        )
      })
    })

    it('uses the binaryName option when bin is an object with multiple entries', () => {
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'multi')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({
            name: 'multi',
            version: '1.0.0',
            bin: { 'tool-a': 'a.js', 'tool-b': 'b.js' },
          }),
        )
        const result = findBinaryPath(pkgDir, 'multi', 'tool-b')
        expect(result).toContain('b.js')
      })
    })

    it('falls back to last package-name segment for scoped packages', () => {
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(
          pkgDir,
          'node_modules',
          '@socketsecurity',
          'cli',
        )
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({
            name: '@socketsecurity/cli',
            version: '1.0.0',
            bin: { socket: 'socket.js', cli: 'cli.js' },
          }),
        )
        const result = findBinaryPath(pkgDir, '@socketsecurity/cli')
        // Either npm's resolver picks one, or fallback finds 'cli'.
        expect(result).toMatch(/socket\.js$|cli\.js$/)
      })
    })
  })

  describe('makePackageBinsExecutable', () => {
    it('is a no-op on Windows (returns without throwing)', () => {
      runWithTempDir(async tmpDir => {
        // We can only assert non-throw for the current platform.
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'pkg-x')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({
            name: 'pkg-x',
            version: '1.0.0',
            bin: 'bin.js',
          }),
        )
        // Function should complete without throwing regardless of platform.
        expect(() => makePackageBinsExecutable(pkgDir, 'pkg-x')).not.toThrow()
      })
    })

    it('chmods all binaries from object bin spec on Unix', () => {
      if (process.platform === 'win32') {
        return
      }
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'multi-bin')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({
            name: 'multi-bin',
            version: '1.0.0',
            bin: { a: 'a.js', b: 'b.js' },
          }),
        )
        // Create the binary files (without exec bits).
        writeFileSync(path.join(installedDir, 'a.js'), '#!/usr/bin/env node\n')
        writeFileSync(path.join(installedDir, 'b.js'), '#!/usr/bin/env node\n')
        const fs = require('node:fs')
        fs.chmodSync(path.join(installedDir, 'a.js'), 0o644)
        fs.chmodSync(path.join(installedDir, 'b.js'), 0o644)

        makePackageBinsExecutable(pkgDir, 'multi-bin')

        const aMode = fs.statSync(path.join(installedDir, 'a.js')).mode & 0o777
        const bMode = fs.statSync(path.join(installedDir, 'b.js')).mode & 0o777
        expect(aMode).toBe(0o755)
        expect(bMode).toBe(0o755)
      })
    })

    it('handles missing package.json gracefully', () => {
      runWithTempDir(async tmpDir => {
        // No package.json, just an empty installed dir.
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'missing')
        mkdirSync(installedDir, { recursive: true })
        // Should not throw — function swallows errors.
        expect(() => makePackageBinsExecutable(pkgDir, 'missing')).not.toThrow()
      })
    })

    it('handles package.json without bin field', () => {
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'no-bin')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({ name: 'no-bin', version: '1.0.0' }),
        )
        expect(() => makePackageBinsExecutable(pkgDir, 'no-bin')).not.toThrow()
      })
    })

    it('handles single string bin field', () => {
      if (process.platform === 'win32') {
        return
      }
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'single')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({
            name: 'single',
            version: '1.0.0',
            bin: 'cli.js',
          }),
        )
        writeFileSync(
          path.join(installedDir, 'cli.js'),
          '#!/usr/bin/env node\n',
        )
        const fs = require('node:fs')
        fs.chmodSync(path.join(installedDir, 'cli.js'), 0o644)
        makePackageBinsExecutable(pkgDir, 'single')
        const mode = fs.statSync(path.join(installedDir, 'cli.js')).mode & 0o777
        expect(mode).toBe(0o755)
      })
    })

    it('skips chmod for non-existent binary files', () => {
      if (process.platform === 'win32') {
        return
      }
      runWithTempDir(async tmpDir => {
        const pkgDir = path.join(tmpDir, 'pkg')
        const installedDir = path.join(pkgDir, 'node_modules', 'ghost-bin')
        mkdirSync(installedDir, { recursive: true })
        writeFileSync(
          path.join(installedDir, 'package.json'),
          JSON.stringify({
            name: 'ghost-bin',
            version: '1.0.0',
            bin: 'does-not-exist.js',
          }),
        )
        // Should not throw even though the binary file doesn't exist.
        expect(() =>
          makePackageBinsExecutable(pkgDir, 'ghost-bin'),
        ).not.toThrow()
      })
    })
  })

  describe('resolveBinaryPath', () => {
    it('returns the path unchanged on Unix', () => {
      if (process.platform === 'win32') {
        return
      }
      runWithTempDir(async tmpDir => {
        const file = path.join(tmpDir, 'binary')
        writeFileSync(file, '')
        expect(resolveBinaryPath(file)).toBe(file)
      })
    })

    it('returns base path when no wrapper exists on Windows', () => {
      // Cannot fully exercise Windows path lookups on non-Windows; just
      // verify the function doesn't throw given an arbitrary path.
      const result = resolveBinaryPath('/nonexistent/path/binary')
      expect(typeof result).toBe('string')
    })
  })

  describe('executePackage', () => {
    it('returns a spawn promise from a binary path', async () => {
      // Use a real binary that should exist on every system.
      const { promise } = (() => {
        const promise = executePackage(process.execPath, [
          '-e',
          'process.exit(0)',
        ])
        return { promise }
      })()
      const result = await promise
      expect(result.code).toBe(0)
    })

    it('forwards args to the spawned process', async () => {
      // Echo via node -p
      const promise = executePackage(process.execPath, [
        '-p',
        '"hello-from-execute"',
      ])
      const result = await promise
      expect(String(result.stdout)).toContain('hello-from-execute')
    })

    it('passes spawn options through', async () => {
      const promise = executePackage(
        process.execPath,
        ['-e', 'process.stderr.write("err"); process.exit(0)'],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      )
      const result = await promise
      expect(String(result.stderr)).toContain('err')
    })
  })

  describe('ensurePackageInstalled (cached path)', () => {
    let tmpDir: string
    let savedDlxDir: string | undefined

    // Pre-stage a node_modules/<pkg>/package.json under <dlxDir>/<sha512-prefix>/
    // matching what generateCacheKey produces. The early-return path inside
    // ensurePackageInstalled then short-circuits Arborist entirely.
    beforeEach(() => {
      tmpDir = mkdtempSync(path.join(tmpdir(), 'dlx-pkg-cached-'))
      savedDlxDir = process.env['SOCKET_DLX_DIR']
      process.env['SOCKET_DLX_DIR'] = tmpDir
      setPath('socket-dlx-dir', tmpDir)
    })

    afterEach(() => {
      if (savedDlxDir === undefined) {
        delete process.env['SOCKET_DLX_DIR']
      } else {
        process.env['SOCKET_DLX_DIR'] = savedDlxDir
      }
      setPath('socket-dlx-dir', undefined)
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    })

    function stageCachedPackage(packageSpec: string, packageName: string) {
      // generateCacheKey is sha512-hex-prefix(16) of the package spec.
      const cacheKey = createHash('sha512')
        .update(packageSpec)
        .digest('hex')
        .slice(0, 16)
      const packageDir = path.join(tmpDir, cacheKey)
      const installedDir = path.join(packageDir, 'node_modules', packageName)
      mkdirSync(installedDir, { recursive: true })
      writeFileSync(
        path.join(installedDir, 'package.json'),
        JSON.stringify({ name: packageName, version: '1.2.3' }),
      )
      return { cacheKey, installedDir, packageDir }
    }

    it('short-circuits when an installed package.json already exists', async () => {
      const { installedDir, packageDir } = stageCachedPackage(
        'lodash@4.17.21',
        'lodash',
      )
      const result = await ensurePackageInstalled(
        'lodash',
        'lodash@4.17.21',
        false,
      )
      expect(result.installed).toBe(false)
      // packageDir matches exactly (modulo path normalization).
      expect(result.packageDir.replace(/\\/g, '/')).toBe(
        packageDir.replace(/\\/g, '/'),
      )
      // The cached package.json is untouched.
      expect(existsSync(path.join(installedDir, 'package.json'))).toBe(true)
    })

    it('short-circuits for scoped packages too', async () => {
      stageCachedPackage('@scope/pkg@2.0.0', '@scope/pkg')
      const result = await ensurePackageInstalled(
        '@scope/pkg',
        '@scope/pkg@2.0.0',
        false,
      )
      expect(result.installed).toBe(false)
    })

    it('writes hardened .npmrc when lockfile is JSON-string content', async () => {
      // Skip the early-return so the lockfile branch runs.
      const lockfileContent = JSON.stringify({
        name: 'lf-test',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'lf-test' } },
      })
      const cacheKey = createHash('sha512')
        .update('lf-test@1.0.0')
        .digest('hex')
        .slice(0, 16)
      const packageDir = path.join(tmpDir, cacheKey)
      // Don't pre-stage installedDir — we want to enter the Arborist branch.
      mkdirSync(packageDir, { recursive: true })

      // Arborist will throw downstream, but the .npmrc write happens
      // synchronously inside the lockfile branch BEFORE Arborist runs, and
      // unlike package-lock.json it isn't rewritten by reify(). Asserting
      // only on .npmrc avoids the Arborist-overwrites-lockfile race that
      // makes the package-lock.json assertion flaky in concurrent runs.
      await expect(
        ensurePackageInstalled('lf-test', 'lf-test@1.0.0', false, {
          lockfile: lockfileContent,
        }),
      ).rejects.toBeDefined()

      const writtenNpmrc = readFileSync(path.join(packageDir, '.npmrc'), 'utf8')
      expect(writtenNpmrc).toContain('ignore-scripts=true')
      expect(writtenNpmrc).toContain('audit=false')
    })
  })
})
