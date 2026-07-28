/**
 * @file Unit tests for src/dlx/package — bins, execute, interfaces, and purl
 *   surfaces merged into one file per mirror-naming convention.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import type * as NodeFs from 'node:fs'

import { describe, expect, it } from 'vitest'

import type {
  DlxPackageOptions,
  DlxPackageResult,
} from '../../../../src/dlx/package'
import {
  executePackage,
  findBinaryPath,
  makePackageBinsExecutable,
  npmPurl,
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

describe('executePackage', () => {
  it('returns a spawn promise from a binary path', async () => {
    // Use a real binary that should exist on every system.
    const promise = executePackage(process.execPath, ['-e', 'process.exit(0)'])
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

describe('DlxPackageOptions interface', () => {
  it('should accept valid package specs', () => {
    const options: DlxPackageOptions = {
      spec: 'cowsay@1.6.0',
    }

    expect(options.spec).toBe('cowsay@1.6.0')
    expect(options.force).toBeUndefined()
    expect(options.spawnOptions).toBeUndefined()
  })

  it('should accept force option', () => {
    const options: DlxPackageOptions = {
      force: true,
      spec: 'cowsay@1.6.0',
    }

    expect(options.force).toBe(true)
  })

  it('should accept yes option (CLI-style)', () => {
    const options: DlxPackageOptions = {
      spec: 'cowsay@1.6.0',
      yes: true,
    }

    expect(options.yes).toBe(true)
  })

  it('should accept quiet option (CLI-style, reserved)', () => {
    const options: DlxPackageOptions = {
      quiet: true,
      spec: 'cowsay@1.6.0',
    }

    expect(options.quiet).toBe(true)
  })

  it('should accept spawn options', () => {
    const options: DlxPackageOptions = {
      spawnOptions: {
        cwd: '/tmp',
        env: { FOO: 'bar' },
      },
      spec: 'cowsay@1.6.0',
    }

    expect(options.spawnOptions?.cwd).toBe('/tmp')
    expect(options.spawnOptions?.env?.['FOO']).toBe('bar')
  })

  it('should handle yes and force together', () => {
    const options: DlxPackageOptions = {
      force: false,
      spec: 'cowsay@1.6.0',
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

describe('npmPurl', () => {
  // Canonical PURL outputs verified against @socketregistry/packageurl-js

  it('should build PURL for unscoped package', () => {
    expect(npmPurl('lodash', '4.17.21')).toBe('pkg:npm/lodash@4.17.21')
  })

  it('should build PURL for scoped package', () => {
    expect(npmPurl('@babel/core', '7.0.0')).toBe('pkg:npm/%40babel/core@7.0.0')
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
      ['@socketsecurity/lib', '5.17.0', 'pkg:npm/%40socketsecurity/lib@5.17.0'],
      ['x', '1.0.0', 'pkg:npm/x@1.0.0'],
      ['@a/b', '0.0.0', 'pkg:npm/%40a/b@0.0.0'],
      ['foo', '1.0.0-rc.0+build.123', 'pkg:npm/foo@1.0.0-rc.0%2Bbuild.123'],
    ]
    for (const [name, version, expected] of cases) {
      expect(npmPurl(name, version)).toBe(expected)
    }
  })
})
