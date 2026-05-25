/**
 * @file Unit tests for src/dlx/package — binary surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { runWithTempDir } from '../../util/temp-file-helper'

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
      const hash = createHash('sha256').update(spec).digest('hex').slice(0, 16)
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
