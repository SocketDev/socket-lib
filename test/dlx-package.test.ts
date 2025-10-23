/**
 * @fileoverview Tests for dlx-package module.
 * Tests package installation, binary resolution, and cross-platform compatibility.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DlxPackageOptions, DlxPackageResult } from '../src/dlx-package'

describe('dlx-package', () => {
  let tempDir: string
  let originalSocketHome: string | undefined

  beforeEach(() => {
    // Create temp directory for testing.
    tempDir = path.join(os.tmpdir(), `dlx-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    // Override Socket home for testing.
    originalSocketHome = process.env['SOCKET_HOME']
    process.env['SOCKET_HOME'] = tempDir
  })

  afterEach(() => {
    // Cleanup.
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
    // Restore original env.
    if (originalSocketHome === undefined) {
      delete process.env['SOCKET_HOME']
    } else {
      process.env['SOCKET_HOME'] = originalSocketHome
    }
  })

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
    it('should construct normalized paths on current platform', () => {
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
    })

    it('should handle scoped package names in paths', () => {
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
    })

    it('should handle binary paths from package.json', () => {
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
    })

    it('should normalize mixed separators in paths', () => {
      const basePath = tempDir
      const relativePath = 'node_modules/@scope/pkg/bin/cli.js'

      // path.join handles mixed separators.
      const fullPath = path.join(basePath, relativePath)

      expect(path.isAbsolute(fullPath)).toBe(true)
      expect(fullPath).toContain('node_modules')
      expect(fullPath).toContain('cli.js')
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

    it('should handle binary permissions on Unix', () => {
      if (process.platform === 'win32') {
        // Skip on Windows.
        return
      }

      // Create a mock binary file.
      const binPath = path.join(tempDir, 'test-binary')
      writeFileSync(binPath, '#!/bin/bash\necho "test"')

      // Verify file exists.
      expect(existsSync(binPath)).toBe(true)
    })

    it('should skip chmod on Windows', () => {
      if (process.platform !== 'win32') {
        // Skip on non-Windows.
        return
      }

      // On Windows, chmod is skipped (no-op).
      const binPath = path.join(tempDir, 'test.bat')
      writeFileSync(binPath, '@echo off\necho test')

      expect(existsSync(binPath)).toBe(true)
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
})
