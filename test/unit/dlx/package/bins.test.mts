/**
 * @file Unit tests for src/dlx/package — bins surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import type * as NodeFs from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  findBinaryPath,
  makePackageBinsExecutable,
  resolveBinaryPath,
} from '../../../../src/dlx/package'
import { runWithTempDir } from '../../util/temp-file-helper'

// Helper that owns the `prefer-exists-sync` exemption once instead of
// repeating it at every fs.statSync() call — these tests read the mode
// bits to verify chmod ran, not existence.
function readModeBits(fsMod: typeof NodeFs, p: string): number {
  // oxlint-disable-next-line socket/prefer-exists-sync -- reading mode bits, not existence.
  return fsMod.statSync(p).mode & 0o777
}

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
      expect(() => findBinaryPath(pkgDir, 'no-bins')).toThrow(/No binary found/)
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

      const aMode = readModeBits(fs, path.join(installedDir, 'a.js'))
      const bMode = readModeBits(fs, path.join(installedDir, 'b.js'))
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
      writeFileSync(path.join(installedDir, 'cli.js'), '#!/usr/bin/env node\n')
      const fs = require('node:fs')
      fs.chmodSync(path.join(installedDir, 'cli.js'), 0o644)
      makePackageBinsExecutable(pkgDir, 'single')
      const mode = readModeBits(fs, path.join(installedDir, 'cli.js'))
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
      expect(() => makePackageBinsExecutable(pkgDir, 'ghost-bin')).not.toThrow()
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
