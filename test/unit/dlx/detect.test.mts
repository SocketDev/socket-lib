/**
 * @file Unit tests for DLX executable type detection. Tests executable type
 *   detection for DLX cache and local filesystem paths:
 *
 *   - detectExecutableType() generic entry point routing
 *   - detectDlxExecutableType() detects packages vs binaries in DLX cache
 *   - detectLocalExecutableType() detects via package.json and file extensions
 *   - isJsFilePath() validates .js, .mjs, .cjs file paths
 *   - isNodePackage() simplified helper for package detection
 *   - isNativeBinary() simplified helper for binary detection Detection
 *     strategies:
 *   - DLX cache: Check for node_modules/ directory presence
 *   - Local paths: Check for package.json with bin field, then file extension
 *     Critical for proper execution of downloaded packages and binaries.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  detectDlxExecutableType,
  detectExecutableType,
  detectLocalExecutableType,
  isJsFilePath,
  isNativeBinary,
  isNodePackage,
} from '../../../src/dlx/detect'
import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'
import { resetPaths, setPath } from '../../../src/paths/rewire'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

describe('DLX Executable Type Detection', () => {
  let tempDir: string
  let mockDlxDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'dlx-detect-test-'))
    mockDlxDir = path.join(tempDir, '.socket', '_dlx')
    mkdirSync(mockDlxDir, { recursive: true })
    // Use path rewire to override DLX directory for all modules
    setPath('socket-dlx-dir', mockDlxDir)
  })

  afterEach(async () => {
    resetPaths()
    try {
      await safeDelete(tempDir)
    } catch {
      // Ignore cleanup errors.
    }
  })

  describe('detectExecutableType', () => {
    it('should route to detectDlxExecutableType for DLX cache paths', () => {
      const dlxPath = path.join(mockDlxDir, 'abc123', 'bin', 'tool')
      const nodeModulesDir = path.join(mockDlxDir, 'abc123', 'node_modules')
      mkdirSync(nodeModulesDir, { recursive: true })

      const result = detectExecutableType(dlxPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('dlx-cache')
      expect(result.inDlxCache).toBe(true)
    })

    it('should route to detectLocalExecutableType for non-DLX paths', () => {
      const localPath = path.join(tempDir, 'local-tools', 'tool.js')
      const localDir = path.join(tempDir, 'local-tools')
      mkdirSync(localDir, { recursive: true })
      writeFileSync(localPath, '#!/usr/bin/env node\nconsole.log("test")')

      const result = detectExecutableType(localPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('file-extension')
      expect(result.inDlxCache).toBe(false)
    })
  })

  describe('detectDlxExecutableType', () => {
    it('should detect package when node_modules exists', () => {
      const cacheKey = 'pkg-hash-123'
      const filePath = path.join(mockDlxDir, cacheKey, 'bin', 'tool')
      const nodeModulesDir = path.join(mockDlxDir, cacheKey, 'node_modules')
      mkdirSync(nodeModulesDir, { recursive: true })

      const result = detectDlxExecutableType(filePath)

      expect(result).toEqual({
        inDlxCache: true,
        method: 'dlx-cache',
        type: 'package',
      })
    })

    it('should detect binary when node_modules does not exist', () => {
      const cacheKey = 'bin-hash-456'
      const filePath = path.join(mockDlxDir, cacheKey, 'bin', 'tool')
      const cacheDir = path.join(mockDlxDir, cacheKey)
      mkdirSync(cacheDir, { recursive: true })

      const result = detectDlxExecutableType(filePath)

      expect(result).toEqual({
        inDlxCache: true,
        method: 'dlx-cache',
        type: 'binary',
      })
    })

    it('should handle nested paths within cache directory', () => {
      const cacheKey = 'nested-pkg'
      const filePath = path.join(
        mockDlxDir,
        cacheKey,
        'deep',
        'nested',
        'path',
        'tool',
      )
      const nodeModulesDir = path.join(mockDlxDir, cacheKey, 'node_modules')
      mkdirSync(nodeModulesDir, { recursive: true })

      const result = detectDlxExecutableType(filePath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('dlx-cache')
    })
  })

  describe('detectLocalExecutableType', () => {
    it('should detect package from package.json with bin field', () => {
      const projectDir = path.join(tempDir, 'with-bin')
      const binDir = path.join(projectDir, 'bin')
      const binPath = path.join(binDir, 'cli.js')
      mkdirSync(binDir, { recursive: true })

      const packageJson = {
        bin: { cli: './bin/cli.js' },
        name: 'test-package',
      }
      writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify(packageJson),
      )
      writeFileSync(binPath, '#!/usr/bin/env node\nconsole.log("test")')

      const result = detectLocalExecutableType(binPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('package-json')
      // findPackageJson returns a normalized (forward-slash) path —
      // findUpSync runs all output through normalizePath. On POSIX this
      // equals path.join(); on Windows it's the forward-slash form.
      expect(result.packageJsonPath).toBe(
        normalizePath(path.join(projectDir, 'package.json')),
      )
      expect(result.inDlxCache).toBe(false)
    })

    it('should detect package from .js extension', () => {
      const scriptPath = path.join(tempDir, 'script.js')
      writeFileSync(scriptPath, 'console.log("test")')

      const result = detectLocalExecutableType(scriptPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('file-extension')
      expect(result.inDlxCache).toBe(false)
    })

    it('should detect package from .mjs extension', () => {
      const scriptPath = path.join(tempDir, 'script.mjs')
      writeFileSync(scriptPath, 'console.log("test")')

      const result = detectLocalExecutableType(scriptPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('file-extension')
    })

    it('should detect package from .cjs extension', () => {
      const scriptPath = path.join(tempDir, 'script.cjs')
      writeFileSync(scriptPath, 'console.log("test")')

      const result = detectLocalExecutableType(scriptPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('file-extension')
    })

    it('should detect binary for non-js executables', () => {
      const binaryPath = path.join(tempDir, 'native-tool')
      writeFileSync(binaryPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46]))

      const result = detectLocalExecutableType(binaryPath)

      expect(result.type).toBe('binary')
      expect(result.method).toBe('file-extension')
      expect(result.inDlxCache).toBe(false)
    })

    it('should handle package.json without bin field', () => {
      const projectDir = path.join(tempDir, 'no-bin')
      const scriptPath = path.join(projectDir, 'index.js')
      mkdirSync(projectDir, { recursive: true })

      const packageJson = { name: 'test-package' }
      writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify(packageJson),
      )
      writeFileSync(scriptPath, 'console.log("test")')

      const result = detectLocalExecutableType(scriptPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('file-extension')
    })

    it('should handle invalid package.json gracefully', () => {
      const projectDir = path.join(tempDir, 'invalid-json')
      const scriptPath = path.join(projectDir, 'tool.js')
      mkdirSync(projectDir, { recursive: true })

      writeFileSync(path.join(projectDir, 'package.json'), 'invalid json {')
      writeFileSync(scriptPath, 'console.log("test")')

      const result = detectLocalExecutableType(scriptPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('file-extension')
    })

    it('should search up directory tree for package.json', () => {
      const projectDir = path.join(tempDir, 'nested-project')
      const deepDir = path.join(projectDir, 'src', 'commands', 'bin')
      const scriptPath = path.join(deepDir, 'cli.js')
      mkdirSync(deepDir, { recursive: true })

      const packageJson = {
        bin: { cli: './src/commands/bin/cli.js' },
        name: 'nested-package',
      }
      writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify(packageJson),
      )
      writeFileSync(scriptPath, '#!/usr/bin/env node\nconsole.log("test")')

      const result = detectLocalExecutableType(scriptPath)

      expect(result.type).toBe('package')
      expect(result.method).toBe('package-json')
      // findPackageJson returns a normalized (forward-slash) path —
      // findUpSync runs all output through normalizePath. On POSIX this
      // equals path.join(); on Windows it's the forward-slash form.
      expect(result.packageJsonPath).toBe(
        normalizePath(path.join(projectDir, 'package.json')),
      )
    })

    it('should handle paths without package.json in tree', () => {
      const binaryPath = path.join(tempDir, 'standalone', 'binary')
      mkdirSync(path.join(tempDir, 'standalone'), { recursive: true })
      writeFileSync(binaryPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46]))

      const result = detectLocalExecutableType(binaryPath)

      expect(result.type).toBe('binary')
      expect(result.method).toBe('file-extension')
      expect(result.packageJsonPath).toBeUndefined()
    })
  })

  describe('isJsFilePath', () => {
    it('should return true for .js files', () => {
      expect(isJsFilePath('/path/to/file.js')).toBe(true)
      expect(isJsFilePath('file.js')).toBe(true)
    })

    it('should return true for .mjs files', () => {
      expect(isJsFilePath('/path/to/module.mjs')).toBe(true)
      expect(isJsFilePath('module.mjs')).toBe(true)
    })

    it('should return true for .cjs files', () => {
      expect(isJsFilePath('/path/to/common.cjs')).toBe(true)
      expect(isJsFilePath('common.cjs')).toBe(true)
    })

    it('should be case-insensitive', () => {
      expect(isJsFilePath('FILE.JS')).toBe(true)
      expect(isJsFilePath('MODULE.MJS')).toBe(true)
      expect(isJsFilePath('COMMON.CJS')).toBe(true)
    })

    it('should return false for non-Node.js extensions', () => {
      expect(isJsFilePath('/path/to/binary')).toBe(false)
      expect(isJsFilePath('/path/to/file.py')).toBe(false)
      expect(isJsFilePath('/path/to/file.sh')).toBe(false)
      expect(isJsFilePath('/path/to/file.exe')).toBe(false)
    })
  })

  describe('isNodePackage', () => {
    it('should return true for Node.js packages in DLX cache', () => {
      const cacheKey = 'pkg-test'
      const filePath = path.join(mockDlxDir, cacheKey, 'bin', 'cli')
      const nodeModulesDir = path.join(mockDlxDir, cacheKey, 'node_modules')
      mkdirSync(nodeModulesDir, { recursive: true })

      expect(isNodePackage(filePath)).toBe(true)
    })

    it('should return true for .js files', () => {
      const jsPath = path.join(tempDir, 'script.js')
      writeFileSync(jsPath, 'console.log("test")')

      expect(isNodePackage(jsPath)).toBe(true)
    })

    it('should return false for binaries', () => {
      const binaryPath = path.join(tempDir, 'native-binary')
      writeFileSync(binaryPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46]))

      expect(isNodePackage(binaryPath)).toBe(false)
    })
  })

  describe('isNativeBinary', () => {
    it('should return true for native binaries in DLX cache', () => {
      const cacheKey = 'bin-test'
      const filePath = path.join(mockDlxDir, cacheKey, 'bin', 'tool')
      const cacheDir = path.join(mockDlxDir, cacheKey)
      mkdirSync(cacheDir, { recursive: true })

      expect(isNativeBinary(filePath)).toBe(true)
    })

    it('should return true for executables without Node.js extensions', () => {
      const binaryPath = path.join(tempDir, 'tool')
      writeFileSync(binaryPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46]))

      expect(isNativeBinary(binaryPath)).toBe(true)
    })

    it('should return false for Node.js packages', () => {
      const jsPath = path.join(tempDir, 'script.mjs')
      writeFileSync(jsPath, 'console.log("test")')

      expect(isNativeBinary(jsPath)).toBe(false)
    })
  })
})
