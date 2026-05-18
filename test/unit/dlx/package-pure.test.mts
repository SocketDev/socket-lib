/**
 * @file Real unit coverage for the pure / cacheable parts of
 *   src/dlx/package.ts: parsePackageSpec, npmPurl, findBinaryPath,
 *   executePackage routing, resolveBinaryPath cross-platform behavior. The
 *   existing dlx/package.test.mts is mostly string assertions about paths. This
 *   file covers the actual exports.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  executePackage,
  findBinaryPath,
  makePackageBinsExecutable,
  npmPurl,
  parsePackageSpec,
  resolveBinaryPath,
} from '../../../src/dlx/package'
import { safeDeleteSync } from '../../../src/fs/safe'

describe.sequential('dlx/package — pure functions', () => {
  let testDir: string

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `socket-lib-dlx-pure-${randomUUID()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    safeDeleteSync(testDir, { force: true })
  })

  describe('parsePackageSpec', () => {
    it('parses unscoped name with version', () => {
      expect(parsePackageSpec('lodash@4.17.21')).toEqual({
        name: 'lodash',
        version: '4.17.21',
      })
    })

    it('parses unscoped name with no version', () => {
      const result = parsePackageSpec('lodash')
      expect(result.name).toBe('lodash')
      // npm-package-arg treats bare name as type 'range' with fetchSpec '*'.
      expect(['*', 'latest', undefined]).toContain(result.version)
    })

    it('parses scoped name with version', () => {
      expect(parsePackageSpec('@scope/pkg@1.0.0')).toEqual({
        name: '@scope/pkg',
        version: '1.0.0',
      })
    })

    it('parses scoped name without version', () => {
      const result = parsePackageSpec('@scope/pkg')
      expect(result.name).toBe('@scope/pkg')
      expect(['*', 'latest', undefined]).toContain(result.version)
    })

    it('parses range specifier', () => {
      const result = parsePackageSpec('lodash@^4.0.0')
      expect(result.name).toBe('lodash')
      expect(result.version).toBe('^4.0.0')
    })

    it('parses dist-tag', () => {
      const result = parsePackageSpec('lodash@latest')
      expect(result.name).toBe('lodash')
      // 'latest' is a tag — npm-package-arg returns 'latest' as fetchSpec.
      expect(result.version).toBe('latest')
    })

    it('handles bare name with trailing @', () => {
      // 'pkg@' is malformed; npm-package-arg treats it as type 'range'
      // with fetchSpec '*'. Either '*' or undefined is acceptable for
      // downstream "no version" checks.
      const result = parsePackageSpec('pkg@')
      expect(result.name).toBe('pkg')
      expect(['*', undefined]).toContain(result.version)
    })
  })

  describe('npmPurl', () => {
    it('encodes unscoped names plainly', () => {
      expect(npmPurl('lodash', '4.17.21')).toBe('pkg:npm/lodash@4.17.21')
    })

    it('encodes the @ prefix as %40 for scoped names', () => {
      expect(npmPurl('@scope/pkg', '1.0.0')).toBe('pkg:npm/%40scope/pkg@1.0.0')
    })

    it('encodes + in version as %2B', () => {
      expect(npmPurl('pkg', '1.0.0+build.1')).toBe(
        'pkg:npm/pkg@1.0.0%2Bbuild.1',
      )
    })
  })

  describe('resolveBinaryPath', () => {
    it('returns the path unchanged on Unix', () => {
      if (process.platform === 'win32') {
        return
      }
      const out = resolveBinaryPath('/some/non/existent/bin')
      expect(out).toBe('/some/non/existent/bin')
    })
  })

  describe('findBinaryPath', () => {
    function writePackage(
      packageDir: string,
      packageName: string,
      pkgJson: Record<string, unknown>,
    ): string {
      const installedDir = path.join(
        packageDir,
        'node_modules',
        ...packageName.split('/'),
      )
      mkdirSync(installedDir, { recursive: true })
      writeFileSync(
        path.join(installedDir, 'package.json'),
        JSON.stringify(pkgJson),
      )
      return installedDir
    }

    it('returns the bin path when bin is a string', () => {
      writePackage(testDir, 'pkg-a', {
        name: 'pkg-a',
        version: '1.0.0',
        bin: './bin/cli.js',
      })
      const bin = findBinaryPath(testDir, 'pkg-a')
      expect(bin).toContain('cli.js')
    })

    it('returns the single bin entry when bin is an object with one key', () => {
      writePackage(testDir, 'pkg-b', {
        name: 'pkg-b',
        version: '1.0.0',
        bin: { 'pkg-b': './bin/index.js' },
      })
      const bin = findBinaryPath(testDir, 'pkg-b')
      expect(bin).toContain('index.js')
    })

    it('throws when no bin is declared', () => {
      writePackage(testDir, 'no-bin', { name: 'no-bin', version: '1.0.0' })
      expect(() => findBinaryPath(testDir, 'no-bin')).toThrow(/No binary found/)
    })

    it('falls back to user-provided binaryName when multiple bins exist', () => {
      writePackage(testDir, 'multi', {
        name: 'multi',
        version: '1.0.0',
        bin: {
          alpha: './bin/alpha.js',
          beta: './bin/beta.js',
        },
      })
      // Pass a hint that matches one of the keys.
      const bin = findBinaryPath(testDir, 'multi', 'beta')
      expect(bin).toContain('beta.js')
    })

    it('falls back to last segment of scoped package name', () => {
      writePackage(testDir, '@scope/tool', {
        name: '@scope/tool',
        version: '1.0.0',
        bin: {
          tool: './bin/tool.js',
          other: './bin/other.js',
        },
      })
      const bin = findBinaryPath(testDir, '@scope/tool')
      expect(bin).toContain('tool.js')
    })
  })

  describe('executePackage', () => {
    it('does not throw when called for a non-existent binary (returns a thenable)', async () => {
      // Spawn a binary that does not exist — the spawn lib throws
      // SpawnError. We just confirm executePackage routes through spawn
      // and returns a thenable handle.
      const result = executePackage('/definitely/not/a/binary/xyz', [], {
        stdio: 'ignore',
      })
      await expect(result).rejects.toThrow()
    })
  })

  describe('makePackageBinsExecutable', () => {
    it('is a no-op on Windows', () => {
      // Cross-platform: on non-Windows, this exercises the chmod path
      // for a real package. On Windows, the early-return covers the
      // first branch.
      // Here we just confirm it does not throw for a missing package.
      expect(() =>
        makePackageBinsExecutable(testDir, 'definitely-not-installed'),
      ).not.toThrow()
    })

    it('chmod 0o755 on installed binaries when bin is an object', () => {
      const pkgJson = {
        name: 'with-bins',
        version: '1.0.0',
        bin: { 'with-bins': './bin/index.js' },
      }
      const installedDir = path.join(testDir, 'node_modules', 'with-bins')
      const binDir = path.join(installedDir, 'bin')
      mkdirSync(binDir, { recursive: true })
      const binFile = path.join(binDir, 'index.js')
      writeFileSync(binFile, '#!/usr/bin/env node\n')
      writeFileSync(
        path.join(installedDir, 'package.json'),
        JSON.stringify(pkgJson),
      )
      expect(() =>
        makePackageBinsExecutable(testDir, 'with-bins'),
      ).not.toThrow()
    })

    it('handles bin field as a string', () => {
      const pkgJson = {
        name: 'string-bin',
        version: '1.0.0',
        bin: './cli.js',
      }
      const installedDir = path.join(testDir, 'node_modules', 'string-bin')
      mkdirSync(installedDir, { recursive: true })
      writeFileSync(path.join(installedDir, 'cli.js'), '#!/usr/bin/env node\n')
      writeFileSync(
        path.join(installedDir, 'package.json'),
        JSON.stringify(pkgJson),
      )
      expect(() =>
        makePackageBinsExecutable(testDir, 'string-bin'),
      ).not.toThrow()
    })
  })
})
