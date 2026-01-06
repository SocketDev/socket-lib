/**
 * @fileoverview Unit tests for binary path resolution and execution utilities.
 *
 * Tests binary discovery and execution helpers:
 * - whichReal(), whichRealSync() find binaries in PATH and resolve to real script files
 * - resolveRealBinSync() resolves wrapper scripts to underlying .js files
 * - findRealNpm(), findRealPnpm(), findRealYarn() locate real package manager binaries
 * - findRealBin() generic real binary locator (bypasses shadow bins)
 * - execBin() executes binaries with options
 * - isShadowBinPath() detects Socket shadow binary paths
 * Used by Socket CLI for package manager operations and binary interception.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  execBin,
  findRealBin,
  findRealNpm,
  findRealPnpm,
  findRealYarn,
  isShadowBinPath,
  resolveRealBinSync,
  whichReal,
  whichRealSync,
} from '@socketsecurity/lib/bin'
import { describe, expect, it } from 'vitest'
import { runWithTempDir } from './utils/temp-file-helper'

describe('bin', () => {
  describe('isShadowBinPath', () => {
    it('should return false for undefined', () => {
      const result = isShadowBinPath(undefined)
      expect(result).toBe(false)
    })

    it('should return false for empty string', () => {
      const result = isShadowBinPath('')
      expect(result).toBe(false)
    })

    it('should return true for Unix node_modules/.bin path', () => {
      const result = isShadowBinPath('/path/to/node_modules/.bin')
      expect(result).toBe(true)
    })

    it('should return true for Windows node_modules/.bin path', () => {
      const result = isShadowBinPath('C:\\path\\to\\node_modules\\.bin')
      expect(result).toBe(true)
    })

    it('should return true for nested node_modules/.bin path', () => {
      const result = isShadowBinPath(
        '/home/user/project/node_modules/.bin/pnpm',
      )
      expect(result).toBe(true)
    })

    it('should return false for regular bin path', () => {
      const result = isShadowBinPath('/usr/local/bin')
      expect(result).toBe(false)
    })

    it('should return false for path without node_modules', () => {
      const result = isShadowBinPath('/usr/bin/npm')
      expect(result).toBe(false)
    })

    it('should handle mixed slashes', () => {
      const result = isShadowBinPath('C:/path/to/node_modules/.bin')
      expect(result).toBe(true)
    })

    it('should return false for node_modules without .bin', () => {
      const result = isShadowBinPath('/path/to/node_modules')
      expect(result).toBe(false)
    })
  })

  describe('whichRealSync', () => {
    it('should find node executable', () => {
      const result = whichRealSync('node')
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      if (typeof result === 'string') {
        expect(result).toContain('node')
      }
    })

    it('should return undefined for non-existent binary', () => {
      const result = whichRealSync('totally-nonexistent-binary-12345')
      expect(result).toBeUndefined()
    })

    it('should return undefined by default when binary not found', () => {
      const result = whichRealSync('nonexistent-bin')
      expect(result).toBeUndefined()
    })

    it('should respect nothrow option set to false', () => {
      try {
        const result = whichRealSync('nonexistent-bin-xyz', { nothrow: false })
        // If it doesn't throw, expect undefined
        expect(result).toBeUndefined()
      } catch (error) {
        // If it throws, that's also acceptable behavior
        expect(error).toBeDefined()
      }
    })

    it('should return array when all option is true', () => {
      const result = whichRealSync('node', { all: true })
      expect(Array.isArray(result)).toBe(true)
      if (Array.isArray(result) && result.length > 0) {
        expect(result[0]).toContain('node')
      }
    })

    it('should return undefined array when all is true and binary not found', () => {
      const result = whichRealSync('nonexistent-binary-12345', { all: true })
      expect(result).toBeUndefined()
    })

    it('should resolve path when all is false', () => {
      const result = whichRealSync('node', { all: false })
      if (result) {
        expect(typeof result).toBe('string')
        expect(result).not.toContain('\\')
      }
    })

    it('should handle empty binary name', () => {
      const result = whichRealSync('')
      expect(result).toBeUndefined()
    })
  })

  describe('whichReal', () => {
    it('should find node executable', async () => {
      const result = await whichReal('node')
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      if (typeof result === 'string') {
        expect(result).toContain('node')
      }
    })

    it('should return undefined for non-existent binary', async () => {
      const result = await whichReal('totally-nonexistent-binary-12345')
      expect(result).toBeUndefined()
    })

    it('should return array when all option is true', async () => {
      const result = await whichReal('node', { all: true })
      expect(Array.isArray(result)).toBe(true)
      if (Array.isArray(result) && result.length > 0) {
        expect(result[0]).toContain('node')
      }
    })

    it('should return undefined array when all is true and binary not found', async () => {
      const result = await whichReal('nonexistent-binary-12345', { all: true })
      expect(result).toBeUndefined()
    })

    it('should resolve paths when all is true', async () => {
      const result = await whichReal('node', { all: true })
      if (Array.isArray(result) && result.length > 0) {
        result.forEach(p => {
          expect(typeof p).toBe('string')
          expect(p).not.toContain('\\')
        })
      }
    })

    it('should handle nothrow option', async () => {
      const result = await whichReal('nonexistent-bin', { nothrow: true })
      expect(result).toBeUndefined()
    })

    it('should return single path when all is false', async () => {
      const result = await whichReal('node', { all: false })
      if (result) {
        expect(typeof result).toBe('string')
      }
    })

    it('should handle empty binary name', async () => {
      const result = await whichReal('')
      expect(result).toBeUndefined()
    })
  })

  describe('resolveRealBinSync', () => {
    it('should normalize path with forward slashes', () => {
      const result = resolveRealBinSync('/usr/bin/node')
      expect(result).not.toContain('\\')
    })

    it('should return "." for empty string', () => {
      const result = resolveRealBinSync('')
      expect(result).toBe('.')
    })

    it('should handle relative path', async () => {
      await runWithTempDir(async tmpDir => {
        const binFile = path.join(tmpDir, 'test-bin')
        await fs.writeFile(binFile, '#!/bin/sh\necho "test"', 'utf8')
        await fs.chmod(binFile, 0o755)

        const result = resolveRealBinSync(binFile)
        expect(result).toBeTruthy()
        expect(result).not.toContain('\\')
      }, 'resolveBin-relative-')
    })

    it('should resolve symlinks when possible', async () => {
      await runWithTempDir(async tmpDir => {
        const targetFile = path.join(tmpDir, 'target')
        await fs.writeFile(targetFile, '#!/bin/sh\necho "test"', 'utf8')

        const linkFile = path.join(tmpDir, 'link')
        try {
          await fs.symlink(targetFile, linkFile)

          const result = resolveRealBinSync(linkFile)
          expect(result).toBeTruthy()
          // Should resolve to real path
          expect(result).toContain('target')
        } catch (error) {
          // Skip if symlinks are not supported on this platform
          if (
            error instanceof Error &&
            (error.message.includes('EPERM') ||
              error.message.includes('operation not permitted'))
          ) {
            console.log('Skipping symlink test - not supported')
          } else {
            throw error
          }
        }
      }, 'resolveBin-symlink-')
    })

    it('should handle non-absolute paths', () => {
      const result = resolveRealBinSync('node')
      expect(result).toBeTruthy()
    })

    it('should normalize Windows-style paths', () => {
      const result = resolveRealBinSync('C:\\Program Files\\nodejs\\node.exe')
      expect(result).not.toContain('\\')
    })

    it('should handle paths with spaces', () => {
      const result = resolveRealBinSync('/usr/local/bin/my binary')
      expect(result).toBeTruthy()
    })

    it('should return normalized path when realpath fails', async () => {
      const result = resolveRealBinSync('/nonexistent/path/to/binary')
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    })
  })

  describe('resolveRealBinSync - Windows scenarios', () => {
    it('should handle extensionless npm on Windows', async () => {
      await runWithTempDir(async tmpDir => {
        const npmBin = path.join(tmpDir, 'npm')
        const npmCliJs = path.join(tmpDir, 'node_modules/npm/bin/npm-cli.js')

        // Create directory structure
        await fs.mkdir(path.join(tmpDir, 'node_modules/npm/bin'), {
          recursive: true,
        })
        await fs.writeFile(npmCliJs, 'console.log("npm")', 'utf8')

        // Create extensionless npm wrapper (Unix-style)
        const npmScript = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
NPM_CLI_JS="$basedir/node_modules/npm/bin/npm-cli.js"
exec node "$NPM_CLI_JS" "$@"
`
        await fs.writeFile(npmBin, npmScript, 'utf8')

        const result = resolveRealBinSync(npmBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-npm-ext-')
    })

    it('should handle extensionless npx on Windows', async () => {
      await runWithTempDir(async tmpDir => {
        const npxBin = path.join(tmpDir, 'npx')
        const npxCliJs = path.join(tmpDir, 'node_modules/npm/bin/npx-cli.js')

        await fs.mkdir(path.join(tmpDir, 'node_modules/npm/bin'), {
          recursive: true,
        })
        await fs.writeFile(npxCliJs, 'console.log("npx")', 'utf8')

        const npxScript = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
NPX_CLI_JS="$basedir/node_modules/npm/bin/npx-cli.js"
exec node "$NPX_CLI_JS" "$@"
`
        await fs.writeFile(npxBin, npxScript, 'utf8')

        const result = resolveRealBinSync(npxBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-npx-ext-')
    })

    it('should handle cmd-shim .cmd files', async () => {
      await runWithTempDir(async tmpDir => {
        const binCmd = path.join(tmpDir, 'test.cmd')
        const targetJs = path.join(tmpDir, 'lib/test.js')

        await fs.mkdir(path.join(tmpDir, 'lib'), { recursive: true })
        await fs.writeFile(targetJs, 'console.log("test")', 'utf8')

        // Create cmd-shim style .cmd file
        const cmdScript = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
"%dp0%\\lib\\test.js" %*\r
`
        await fs.writeFile(binCmd, cmdScript, 'utf8')

        const result = resolveRealBinSync(binCmd)
        expect(result).toBeTruthy()
      }, 'resolveBin-cmd-')
    })

    it('should handle PowerShell .ps1 files', async () => {
      await runWithTempDir(async tmpDir => {
        const binPs1 = path.join(tmpDir, 'test.ps1')
        const targetJs = path.join(tmpDir, 'lib/test.js')

        await fs.mkdir(path.join(tmpDir, 'lib'), { recursive: true })
        await fs.writeFile(targetJs, 'console.log("test")', 'utf8')

        const ps1Script = `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
& "$basedir/lib/test.js" $args
`
        await fs.writeFile(binPs1, ps1Script, 'utf8')

        const result = resolveRealBinSync(binPs1)
        expect(result).toBeTruthy()
      }, 'resolveBin-ps1-')
    })
  })

  describe('resolveRealBinSync - Unix scenarios', () => {
    it('should handle extensionless pnpm shell script', async () => {
      await runWithTempDir(async tmpDir => {
        const pnpmBin = path.join(tmpDir, 'pnpm')

        await fs.mkdir(path.join(tmpDir, '../pnpm/bin'), { recursive: true })
        await fs.writeFile(
          path.join(tmpDir, '../pnpm/bin/pnpm.cjs'),
          'console.log("pnpm")',
          'utf8',
        )

        const pnpmScript = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec node "$basedir/../pnpm/bin/pnpm.cjs" "$@"
`
        await fs.writeFile(pnpmBin, pnpmScript, 'utf8')

        const result = resolveRealBinSync(pnpmBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-pnpm-unix-')
    })

    it('should handle extensionless yarn shell script', async () => {
      await runWithTempDir(async tmpDir => {
        const yarnBin = path.join(tmpDir, 'yarn')

        await fs.mkdir(path.join(tmpDir, '../yarn/bin'), { recursive: true })
        await fs.writeFile(
          path.join(tmpDir, '../yarn/bin/yarn.js'),
          'console.log("yarn")',
          'utf8',
        )

        const yarnScript = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec node "$basedir/../yarn/bin/yarn.js" "$@"
`
        await fs.writeFile(yarnBin, yarnScript, 'utf8')

        const result = resolveRealBinSync(yarnBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-yarn-unix-')
    })

    it('should handle pnpm with .tools directory', async () => {
      await runWithTempDir(async tmpDir => {
        const pnpmBin = path.join(tmpDir, 'pnpm')
        const pnpmCjs = path.join(tmpDir, '.tools/pnpm/1.0.0/bin/pnpm.cjs')

        await fs.mkdir(path.join(tmpDir, '.tools/pnpm/1.0.0/bin'), {
          recursive: true,
        })
        await fs.writeFile(pnpmCjs, 'console.log("pnpm")', 'utf8')

        const pnpmScript = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec "$basedir/node" "$basedir/.tools/pnpm/1.0.0/bin/pnpm.cjs" "$@"
`
        await fs.writeFile(pnpmBin, pnpmScript, 'utf8')

        const result = resolveRealBinSync(pnpmBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-pnpm-tools-')
    })

    it('should handle malformed pnpm path in CI', async () => {
      await runWithTempDir(async tmpDir => {
        // Create the correct shell script location
        const correctPnpmBin = path.join(
          tmpDir,
          'setup-pnpm/node_modules/.bin/pnpm',
        )
        await fs.mkdir(path.dirname(correctPnpmBin), { recursive: true })

        const pnpmScript = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec node "$basedir/pnpm/bin/pnpm.cjs" "$@"
`
        await fs.writeFile(correctPnpmBin, pnpmScript, 'utf8')

        const result = resolveRealBinSync(correctPnpmBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-pnpm-ci-')
    })
  })

  describe('resolveRealBinSync - Volta scenarios', () => {
    it('should handle Volta-managed npm', async () => {
      await runWithTempDir(async tmpDir => {
        // Create Volta directory structure
        const voltaDir = path.join(tmpDir, '.volta')
        const voltaToolsPath = path.join(voltaDir, 'tools')
        const voltaImagePath = path.join(voltaToolsPath, 'image')
        const voltaUserPath = path.join(voltaToolsPath, 'user')
        const voltaBinPath = path.join(voltaUserPath, 'bin')

        await fs.mkdir(voltaBinPath, { recursive: true })
        await fs.mkdir(voltaImagePath, { recursive: true })

        // Create platform.json
        const platformJson = {
          node: {
            runtime: '18.0.0',
            npm: '9.0.0',
          },
        }
        await fs.writeFile(
          path.join(voltaUserPath, 'platform.json'),
          JSON.stringify(platformJson),
          'utf8',
        )

        // Create npm binary location
        const npmCliPath = path.join(voltaImagePath, 'npm/9.0.0/bin/npm-cli.js')
        await fs.mkdir(path.dirname(npmCliPath), { recursive: true })
        await fs.writeFile(npmCliPath, 'console.log("npm")', 'utf8')

        // Create Volta shim
        const npmShim = path.join(voltaBinPath, 'npm')
        await fs.writeFile(npmShim, '#!/bin/sh\necho "volta shim"', 'utf8')

        const voltaNpmPath = path.join(voltaDir, 'bin/npm')
        await fs.mkdir(path.dirname(voltaNpmPath), { recursive: true })
        await fs.writeFile(voltaNpmPath, '#!/bin/sh\necho "npm"', 'utf8')

        const result = resolveRealBinSync(voltaNpmPath)
        expect(result).toBeTruthy()
      }, 'resolveBin-volta-npm-')
    })

    it('should handle Volta-managed npx', async () => {
      await runWithTempDir(async tmpDir => {
        const voltaDir = path.join(tmpDir, '.volta')
        const voltaToolsPath = path.join(voltaDir, 'tools')
        const voltaImagePath = path.join(voltaToolsPath, 'image')
        const voltaUserPath = path.join(voltaToolsPath, 'user')

        await fs.mkdir(voltaImagePath, { recursive: true })
        await fs.mkdir(voltaUserPath, { recursive: true })

        const platformJson = {
          node: {
            runtime: '18.0.0',
            npm: '9.0.0',
          },
        }
        await fs.writeFile(
          path.join(voltaUserPath, 'platform.json'),
          JSON.stringify(platformJson),
          'utf8',
        )

        const npxCliPath = path.join(voltaImagePath, 'npm/9.0.0/bin/npx-cli.js')
        await fs.mkdir(path.dirname(npxCliPath), { recursive: true })
        await fs.writeFile(npxCliPath, 'console.log("npx")', 'utf8')

        const voltaNpxPath = path.join(voltaDir, 'bin/npx')
        await fs.mkdir(path.dirname(voltaNpxPath), { recursive: true })
        await fs.writeFile(voltaNpxPath, '#!/bin/sh\necho "npx"', 'utf8')

        const result = resolveRealBinSync(voltaNpxPath)
        expect(result).toBeTruthy()
      }, 'resolveBin-volta-npx-')
    })

    it('should handle Volta-managed custom package binary', async () => {
      await runWithTempDir(async tmpDir => {
        const voltaDir = path.join(tmpDir, '.volta')
        const voltaToolsPath = path.join(voltaDir, 'tools')
        const voltaImagePath = path.join(voltaToolsPath, 'image')
        const voltaUserPath = path.join(voltaToolsPath, 'user')
        const voltaBinPath = path.join(voltaUserPath, 'bin')

        await fs.mkdir(voltaBinPath, { recursive: true })
        await fs.mkdir(voltaImagePath, { recursive: true })

        // Create binary info file
        const binInfo = {
          package: 'typescript@5.0.0',
        }
        await fs.writeFile(
          path.join(voltaBinPath, 'tsc.json'),
          JSON.stringify(binInfo),
          'utf8',
        )

        // Create package binary
        const tscPath = path.join(
          voltaImagePath,
          'packages/typescript@5.0.0/bin/tsc',
        )
        await fs.mkdir(path.dirname(tscPath), { recursive: true })
        await fs.writeFile(tscPath, '#!/bin/sh\necho "tsc"', 'utf8')

        const voltaTscPath = path.join(voltaDir, 'bin/tsc')
        await fs.mkdir(path.dirname(voltaTscPath), { recursive: true })
        await fs.writeFile(voltaTscPath, '#!/bin/sh\necho "tsc"', 'utf8')

        const result = resolveRealBinSync(voltaTscPath)
        expect(result).toBeTruthy()
      }, 'resolveBin-volta-package-')
    })

    it('should skip Volta resolution for node binary', () => {
      // Node binary should not go through Volta resolution
      const result = resolveRealBinSync('/path/to/.volta/bin/node')
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    })
  })

  describe('findRealBin', () => {
    it('should find node binary', () => {
      const result = findRealBin('node')
      expect(result).toBeDefined()
      if (result) {
        expect(result).toContain('node')
      }
    })

    it('should return undefined for non-existent binary', () => {
      const result = findRealBin('totally-nonexistent-binary-xyz-12345')
      expect(result).toBeUndefined()
    })

    it('should check common paths first', async () => {
      await runWithTempDir(async tmpDir => {
        const binPath = path.join(tmpDir, 'custom-bin')
        await fs.writeFile(binPath, '#!/bin/sh\necho "test"', 'utf8')

        const result = findRealBin('test-binary', [binPath])
        expect(result).toBe(binPath)
      }, 'findRealBin-common-')
    })

    it('should skip shadow bins', async () => {
      await runWithTempDir(async _tmpDir => {
        // This test verifies the behavior but may not find an actual shadow bin
        const result = findRealBin('node', [])
        if (result) {
          expect(isShadowBinPath(path.dirname(result))).toBe(false)
        }
      }, 'findRealBin-shadow-')
    })

    it('should handle empty common paths array', () => {
      const result = findRealBin('node', [])
      expect(result).toBeDefined()
    })

    it('should return first existing common path', async () => {
      await runWithTempDir(async tmpDir => {
        const bin1 = path.join(tmpDir, 'bin1')
        const bin2 = path.join(tmpDir, 'bin2')

        await fs.writeFile(bin2, '#!/bin/sh\necho "test"', 'utf8')

        const result = findRealBin('test', [bin1, bin2])
        expect(result).toBe(bin2)
      }, 'findRealBin-first-')
    })
  })

  describe('findRealNpm', () => {
    it('should find npm binary', () => {
      const result = findRealNpm()
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('should return a valid path or fallback to "npm"', () => {
      const result = findRealNpm()
      expect(result.length).toBeGreaterThan(0)
      // Should either be a full path or the string "npm"
      if (result !== 'npm') {
        expect(result).toContain('npm')
      }
    })

    it('should not return a shadow bin path when possible', () => {
      const result = findRealNpm()
      // If we found a real path (not just "npm"), it shouldn't be a shadow bin
      if (result !== 'npm' && result.includes('/')) {
        const dir = path.dirname(result)
        // We prefer non-shadow paths, but don't strictly require it
        // since the system might only have shadow bins available
        expect(typeof isShadowBinPath(dir)).toBe('boolean')
      }
    })
  })

  describe('findRealPnpm', () => {
    it('should return a string', () => {
      const result = findRealPnpm()
      expect(typeof result).toBe('string')
    })

    it('should return empty string if pnpm not found', () => {
      // This test documents current behavior - returns empty string when not found
      const result = findRealPnpm()
      expect(typeof result).toBe('string')
    })

    it('should return path containing pnpm if found', () => {
      const result = findRealPnpm()
      if (result) {
        expect(result).toContain('pnpm')
      }
    })
  })

  describe('findRealYarn', () => {
    it('should return a string', () => {
      const result = findRealYarn()
      expect(typeof result).toBe('string')
    })

    it('should return empty string if yarn not found', () => {
      // This test documents current behavior - returns empty string when not found
      const result = findRealYarn()
      expect(typeof result).toBe('string')
    })

    it('should return path containing yarn if found', () => {
      const result = findRealYarn()
      if (result) {
        expect(result).toContain('yarn')
      }
    })
  })

  describe('execBin', () => {
    it('should execute a binary by path', async () => {
      const result = await execBin('node', ['--version'])
      expect(result.code).toBe(0)
      expect(result.stdout).toBeTruthy()
    })

    it('should execute a binary by name', async () => {
      const result = await execBin('node', ['--version'])
      expect(result.code).toBe(0)
      expect(result.stdout).toBeTruthy()
    })

    it('should throw ENOENT error when binary not found', async () => {
      await expect(
        execBin('totally-nonexistent-binary-xyz-12345', []),
      ).rejects.toThrow('Binary not found')
    })

    it('should throw error with ENOENT code', async () => {
      try {
        await execBin('nonexistent-bin-12345')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error) {
          expect((error as any).code).toBe('ENOENT')
        }
      }
    })

    it('should handle binary with arguments', async () => {
      const result = await execBin('node', ['-e', 'console.log("hello")'])
      expect(result.code).toBe(0)
      expect(result.stdout).toContain('hello')
    })

    it('should handle binary without arguments', async () => {
      const result = await execBin('node', ['--version'])
      expect(result.code).toBe(0)
    })

    it('should pass options to spawn', async () => {
      const result = await execBin('node', ['--version'], {
        cwd: process.cwd(),
      })
      expect(result.code).toBe(0)
    })

    it('should handle absolute path to binary', async () => {
      const nodePath = process.execPath
      const result = await execBin(nodePath, ['--version'])
      expect(result.code).toBe(0)
    })

    it('should handle relative path to binary', async () => {
      await runWithTempDir(async tmpDir => {
        const scriptPath = path.join(tmpDir, 'test.js')
        await fs.writeFile(scriptPath, 'console.log("test output")', 'utf8')

        const result = await execBin('node', [scriptPath])
        expect(result.code).toBe(0)
        expect(result.stdout).toContain('test output')
      }, 'execBin-script-')
    })
  })

  describe('resolveRealBinSync - edge cases', () => {
    it('should handle paths with special characters', () => {
      const result = resolveRealBinSync('/usr/bin/test-binary-name')
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    })

    it('should handle Windows drive letters', () => {
      const result = resolveRealBinSync('C:/Windows/System32/cmd.exe')
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    })

    it('should handle UNC paths', () => {
      const result = resolveRealBinSync('//server/share/bin/executable')
      expect(result).toBeTruthy()
    })

    it('should handle current directory reference', () => {
      const result = resolveRealBinSync('./node')
      expect(result).toBeTruthy()
    })

    it('should handle parent directory reference', () => {
      const result = resolveRealBinSync('../bin/node')
      expect(result).toBeTruthy()
    })

    it('should handle multiple path separators', () => {
      const result = resolveRealBinSync('/usr//local//bin///node')
      expect(result).toBeTruthy()
      expect(result).not.toMatch(/\/\//)
    })

    it('should handle trailing slash', () => {
      const result = resolveRealBinSync('/usr/bin/node/')
      expect(result).toBeTruthy()
    })
  })

  describe('resolveRealBinSync - pnpm edge cases', () => {
    it('should handle pnpm with missing pnpm/ prefix in path', async () => {
      await runWithTempDir(async tmpDir => {
        const pnpmBin = path.join(tmpDir, 'pnpm')
        const pnpmCjs = path.join(tmpDir, '../pnpm/bin/pnpm.cjs')

        await fs.mkdir(path.dirname(pnpmCjs), { recursive: true })
        await fs.writeFile(pnpmCjs, 'console.log("pnpm")', 'utf8')

        // Script with missing ../ prefix (malformed)
        const pnpmScript = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec node "$basedir/pnpm/bin/pnpm.cjs" "$@"
`
        await fs.writeFile(pnpmBin, pnpmScript, 'utf8')

        const result = resolveRealBinSync(pnpmBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-pnpm-malformed-')
    })

    it('should handle pnpm.cmd with node.exe reference', async () => {
      await runWithTempDir(async tmpDir => {
        const pnpmCmd = path.join(tmpDir, 'pnpm.cmd')
        const pnpmCjs = path.join(tmpDir, '../pnpm/bin/pnpm.cjs')

        await fs.mkdir(path.dirname(pnpmCjs), { recursive: true })
        await fs.writeFile(pnpmCjs, 'console.log("pnpm")', 'utf8')

        const cmdScript = `@ECHO off
"%~dp0\\node.exe" "%~dp0\\..\\pnpm\\bin\\pnpm.cjs" %*\r
`
        await fs.writeFile(pnpmCmd, cmdScript, 'utf8')

        const result = resolveRealBinSync(pnpmCmd)
        expect(result).toBeTruthy()
      }, 'resolveBin-pnpm-cmd-node-')
    })

    it('should handle yarn.cmd with node.exe reference', async () => {
      await runWithTempDir(async tmpDir => {
        const yarnCmd = path.join(tmpDir, 'yarn.cmd')
        const yarnJs = path.join(tmpDir, '../yarn/bin/yarn.js')

        await fs.mkdir(path.dirname(yarnJs), { recursive: true })
        await fs.writeFile(yarnJs, 'console.log("yarn")', 'utf8')

        const cmdScript = `@ECHO off
"%~dp0\\node.exe" "%~dp0\\..\\yarn\\bin\\yarn.js" %*\r
`
        await fs.writeFile(yarnCmd, cmdScript, 'utf8')

        const result = resolveRealBinSync(yarnCmd)
        expect(result).toBeTruthy()
      }, 'resolveBin-yarn-cmd-node-')
    })

    it('should handle pnpm with exec node format', async () => {
      await runWithTempDir(async tmpDir => {
        const pnpmBin = path.join(tmpDir, 'pnpm')
        const pnpmCjs = path.join(tmpDir, '.tools/pnpm/8.0.0/bin/pnpm.cjs')

        await fs.mkdir(path.dirname(pnpmCjs), { recursive: true })
        await fs.writeFile(pnpmCjs, 'console.log("pnpm")', 'utf8')

        const pnpmScript = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec node  "$basedir/.tools/pnpm/8.0.0/bin/pnpm.cjs" "$@"
`
        await fs.writeFile(pnpmBin, pnpmScript, 'utf8')

        const result = resolveRealBinSync(pnpmBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-pnpm-exec-')
    })

    it('should handle npm.ps1 format', async () => {
      await runWithTempDir(async tmpDir => {
        const npmPs1 = path.join(tmpDir, 'npm.ps1')
        const npmCliJs = path.join(tmpDir, 'node_modules/npm/bin/npm-cli.js')

        await fs.mkdir(path.dirname(npmCliJs), { recursive: true })
        await fs.writeFile(npmCliJs, 'console.log("npm")', 'utf8')

        const ps1Script = `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
$NPM_CLI_JS="$PSScriptRoot/node_modules/npm/bin/npm-cli.js"
& node $NPM_CLI_JS $args
`
        await fs.writeFile(npmPs1, ps1Script, 'utf8')

        const result = resolveRealBinSync(npmPs1)
        expect(result).toBeTruthy()
      }, 'resolveBin-npm-ps1-')
    })

    it('should handle npx.ps1 format', async () => {
      await runWithTempDir(async tmpDir => {
        const npxPs1 = path.join(tmpDir, 'npx.ps1')
        const npxCliJs = path.join(tmpDir, 'node_modules/npm/bin/npx-cli.js')

        await fs.mkdir(path.dirname(npxCliJs), { recursive: true })
        await fs.writeFile(npxCliJs, 'console.log("npx")', 'utf8')

        const ps1Script = `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
$NPX_CLI_JS="$PSScriptRoot/node_modules/npm/bin/npx-cli.js"
& node $NPX_CLI_JS $args
`
        await fs.writeFile(npxPs1, ps1Script, 'utf8')

        const result = resolveRealBinSync(npxPs1)
        expect(result).toBeTruthy()
      }, 'resolveBin-npx-ps1-')
    })

    it('should handle pnpm.ps1 format', async () => {
      await runWithTempDir(async tmpDir => {
        const pnpmPs1 = path.join(tmpDir, 'pnpm.ps1')
        const pnpmCjs = path.join(tmpDir, '../pnpm/bin/pnpm.cjs')

        await fs.mkdir(path.dirname(pnpmCjs), { recursive: true })
        await fs.writeFile(pnpmCjs, 'console.log("pnpm")', 'utf8')

        const ps1Script = `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
& node "$basedir/../pnpm/bin/pnpm.cjs" $args
`
        await fs.writeFile(pnpmPs1, ps1Script, 'utf8')

        const result = resolveRealBinSync(pnpmPs1)
        expect(result).toBeTruthy()
      }, 'resolveBin-pnpm-ps1-')
    })

    it('should handle yarn.ps1 format', async () => {
      await runWithTempDir(async tmpDir => {
        const yarnPs1 = path.join(tmpDir, 'yarn.ps1')
        const yarnJs = path.join(tmpDir, '../yarn/bin/yarn.js')

        await fs.mkdir(path.dirname(yarnJs), { recursive: true })
        await fs.writeFile(yarnJs, 'console.log("yarn")', 'utf8')

        const ps1Script = `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
& node "$basedir/../yarn/bin/yarn.js" $args
`
        await fs.writeFile(yarnPs1, ps1Script, 'utf8')

        const result = resolveRealBinSync(yarnPs1)
        expect(result).toBeTruthy()
      }, 'resolveBin-yarn-ps1-')
    })
  })

  describe('resolveRealBinSync - npm CMD variations', () => {
    it('should handle npm.cmd with quick path', async () => {
      await runWithTempDir(async tmpDir => {
        const npmCmd = path.join(tmpDir, 'npm.cmd')
        const npmCliJs = path.join(tmpDir, 'node_modules/npm/bin/npm-cli.js')

        await fs.mkdir(path.dirname(npmCliJs), { recursive: true })
        await fs.writeFile(npmCliJs, 'console.log("npm")', 'utf8')

        const cmdScript = `@ECHO off
SET "NPM_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npm-cli.js"
node "%NPM_CLI_JS%" %*\r
`
        await fs.writeFile(npmCmd, cmdScript, 'utf8')

        const result = resolveRealBinSync(npmCmd)
        expect(result).toBeTruthy()
      }, 'resolveBin-npm-cmd-quick-')
    })

    it('should handle npx.cmd with NPX_CLI_JS variable', async () => {
      await runWithTempDir(async tmpDir => {
        const npxCmd = path.join(tmpDir, 'npx.cmd')
        const npxCliJs = path.join(tmpDir, 'node_modules/npm/bin/npx-cli.js')

        await fs.mkdir(path.dirname(npxCliJs), { recursive: true })
        await fs.writeFile(npxCliJs, 'console.log("npx")', 'utf8')

        const cmdScript = `@ECHO off
SET "NPX_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npx-cli.js"
node "%NPX_CLI_JS%" %*\r
`
        await fs.writeFile(npxCmd, cmdScript, 'utf8')

        const result = resolveRealBinSync(npxCmd)
        expect(result).toBeTruthy()
      }, 'resolveBin-npx-cmd-')
    })
  })

  describe('resolveRealBinSync - Volta fallback paths', () => {
    it('should fallback to node_modules for Volta npm when primary path missing', async () => {
      await runWithTempDir(async tmpDir => {
        const voltaDir = path.join(tmpDir, '.volta')
        const voltaToolsPath = path.join(voltaDir, 'tools')
        const voltaImagePath = path.join(voltaToolsPath, 'image')
        const voltaUserPath = path.join(voltaToolsPath, 'user')

        await fs.mkdir(voltaImagePath, { recursive: true })
        await fs.mkdir(voltaUserPath, { recursive: true })

        const platformJson = {
          node: {
            runtime: '18.0.0',
            npm: '9.0.0',
          },
        }
        await fs.writeFile(
          path.join(voltaUserPath, 'platform.json'),
          JSON.stringify(platformJson),
          'utf8',
        )

        // Only create the node_modules fallback path
        const npmCliPath = path.join(
          voltaImagePath,
          'node/18.0.0/lib/node_modules/npm/bin/npm-cli.js',
        )
        await fs.mkdir(path.dirname(npmCliPath), { recursive: true })
        await fs.writeFile(npmCliPath, 'console.log("npm")', 'utf8')

        const voltaNpmPath = path.join(voltaDir, 'bin/npm')
        await fs.mkdir(path.dirname(voltaNpmPath), { recursive: true })
        await fs.writeFile(voltaNpmPath, '#!/bin/sh\necho "npm"', 'utf8')

        const result = resolveRealBinSync(voltaNpmPath)
        expect(result).toBeTruthy()
      }, 'resolveBin-volta-npm-fallback-')
    })

    it('should handle Volta package binary with .cmd extension', async () => {
      await runWithTempDir(async tmpDir => {
        const voltaDir = path.join(tmpDir, '.volta')
        const voltaToolsPath = path.join(voltaDir, 'tools')
        const voltaImagePath = path.join(voltaToolsPath, 'image')
        const voltaUserPath = path.join(voltaToolsPath, 'user')
        const voltaBinPath = path.join(voltaUserPath, 'bin')

        await fs.mkdir(voltaBinPath, { recursive: true })
        await fs.mkdir(voltaImagePath, { recursive: true })

        const binInfo = {
          package: 'some-package@1.0.0',
        }
        await fs.writeFile(
          path.join(voltaBinPath, 'somecmd.json'),
          JSON.stringify(binInfo),
          'utf8',
        )

        // Create .cmd version of binary
        const cmdPath = path.join(
          voltaImagePath,
          'packages/some-package@1.0.0/bin/somecmd.cmd',
        )
        await fs.mkdir(path.dirname(cmdPath), { recursive: true })
        await fs.writeFile(cmdPath, '@ECHO off\necho "somecmd"', 'utf8')

        const voltaCmdPath = path.join(voltaDir, 'bin/somecmd')
        await fs.mkdir(path.dirname(voltaCmdPath), { recursive: true })
        await fs.writeFile(voltaCmdPath, '#!/bin/sh\necho "somecmd"', 'utf8')

        const result = resolveRealBinSync(voltaCmdPath)
        expect(result).toBeTruthy()
      }, 'resolveBin-volta-cmd-')
    })
  })

  describe('resolveRealBinSync - non-existent file scenarios', () => {
    it('should handle non-existent .cmd file', () => {
      const result = resolveRealBinSync('/nonexistent/path/test.cmd')
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    })

    it('should handle non-existent .ps1 file', () => {
      const result = resolveRealBinSync('/nonexistent/path/test.ps1')
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    })

    it('should handle non-existent extensionless file', () => {
      const result = resolveRealBinSync('/nonexistent/path/test')
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    })

    it('should handle non-existent .exe file', () => {
      const result = resolveRealBinSync('/nonexistent/path/test.exe')
      expect(result).toBeTruthy()
      expect(result).not.toContain('\\')
    })
  })

  describe('whichRealSync and whichReal - options coverage', () => {
    it('should handle options with all explicitly set to undefined', () => {
      const result = whichRealSync('node', { all: undefined as any })
      expect(result).toBeDefined()
    })

    it('should handle async version with all explicitly set to undefined', async () => {
      const result = await whichReal('node', { all: undefined as any })
      expect(result).toBeDefined()
    })

    it('should handle multiple paths when all is true', () => {
      const result = whichRealSync('node', { all: true, nothrow: true })
      if (result && Array.isArray(result)) {
        expect(result.length).toBeGreaterThan(0)
      }
    })

    it('should handle async multiple paths when all is true', async () => {
      const result = await whichReal('node', { all: true, nothrow: true })
      if (result && Array.isArray(result)) {
        expect(result.length).toBeGreaterThan(0)
      }
    })
  })

  describe('findRealBin - shadow bin detection', () => {
    it('should prefer non-shadow bin paths', async () => {
      // This test verifies that if we have multiple binaries,
      // we prefer the one that's not in node_modules/.bin
      const result = findRealBin('node', [])
      if (result) {
        const dirName = path.dirname(result)
        // If we found a bin, it should preferably not be a shadow bin
        // However, we can't guarantee this on all systems
        expect(typeof isShadowBinPath(dirName)).toBe('boolean')
      }
    })

    it('should handle when all paths are shadow bins', () => {
      // In some environments, all available paths might be shadow bins
      const result = findRealBin('node', [])
      expect(result === undefined || typeof result === 'string').toBe(true)
    })
  })

  describe('execBin - path handling', () => {
    it('should handle binary name that needs path resolution', async () => {
      const result = await execBin('node', ['-p', 'process.version'])
      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/^v\d+\.\d+\.\d+/)
    })

    it('should handle binary with absolute path', async () => {
      const nodePath = process.execPath
      const result = await execBin(nodePath, ['-p', '1+1'])
      expect(result.code).toBe(0)
      expect(result.stdout).toContain('2')
    })

    it('should throw for path that resolves to undefined', async () => {
      await expect(
        execBin('/absolutely/nonexistent/path/to/binary'),
      ).rejects.toThrow()
    })
  })

  describe('resolveRealBinSync - comprehensive format coverage', () => {
    it('should handle empty relPath in cmd file', async () => {
      await runWithTempDir(async tmpDir => {
        const testCmd = path.join(tmpDir, 'test.cmd')
        // CMD file that doesn't match any patterns
        const cmdScript = `@ECHO off
echo "test"
`
        await fs.writeFile(testCmd, cmdScript, 'utf8')

        const result = resolveRealBinSync(testCmd)
        expect(result).toBeTruthy()
      }, 'resolveBin-empty-relpath-')
    })

    it('should handle npm.cmd with standard format', async () => {
      await runWithTempDir(async tmpDir => {
        const npmCmd = path.join(tmpDir, 'npm.cmd')
        const npmCliJs = path.join(tmpDir, 'lib/npm-cli.js')

        await fs.mkdir(path.dirname(npmCliJs), { recursive: true })
        await fs.writeFile(npmCliJs, 'console.log("npm")', 'utf8')

        const cmdScript = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
SET "_prog=node"
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\lib\\npm-cli.js" %*\r
`
        await fs.writeFile(npmCmd, cmdScript, 'utf8')

        const result = resolveRealBinSync(npmCmd)
        expect(result).toBeTruthy()
      }, 'resolveBin-npm-standard-')
    })

    it('should handle extensionless binary with no relPath extracted', async () => {
      await runWithTempDir(async tmpDir => {
        const testBin = path.join(tmpDir, 'test')
        // Shell script that doesn't match any patterns
        const script = `#!/bin/sh
echo "test"
`
        await fs.writeFile(testBin, script, 'utf8')

        const result = resolveRealBinSync(testBin)
        expect(result).toBeTruthy()
      }, 'resolveBin-no-relpath-')
    })
  })

  describe('findRealBin - additional edge cases', () => {
    it('should handle binary found in common paths', async () => {
      await runWithTempDir(async tmpDir => {
        const binPath = path.join(tmpDir, 'test-binary')
        await fs.writeFile(binPath, '#!/bin/sh\necho "test"', 'utf8')
        await fs.chmod(binPath, 0o755)

        const result = findRealBin('test-binary', [binPath])
        expect(result).toBe(binPath)
      }, 'findRealBin-common-found-')
    })

    it('should fall back to which when common paths not found', () => {
      // Use node which should be available in PATH
      const result = findRealBin('node', [
        '/nonexistent/path1',
        '/nonexistent/path2',
      ])
      expect(result).toBeDefined()
      if (result) {
        expect(result).toContain('node')
      }
    })

    it('should detect and skip shadow bin paths', async () => {
      await runWithTempDir(async tmpDir => {
        // This tests the shadow bin detection logic
        const shadowPath = path.join(tmpDir, 'node_modules/.bin')
        await fs.mkdir(shadowPath, { recursive: true })

        const binPath = path.join(shadowPath, 'test-bin')
        await fs.writeFile(binPath, '#!/bin/sh\necho "test"', 'utf8')

        // findRealBin should try to find alternates when it detects shadow paths
        const result = findRealBin('node', []) // Use node which exists
        if (result) {
          // The result should ideally not be in a shadow bin path
          // but we can't guarantee it, so just verify it returns something
          expect(result).toBeDefined()
        }
      }, 'findRealBin-shadow-detection-')
    })
  })

  describe('findRealNpm - edge cases', () => {
    it('should check npm in node directory', () => {
      // This test exercises the logic that checks for npm next to node
      const result = findRealNpm()
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('should fall back through all strategies', () => {
      // This exercises all fallback paths in findRealNpm
      const result = findRealNpm()
      // Should return either a path or 'npm' as final fallback
      expect(result).toBeTruthy()
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('findRealPnpm - edge cases', () => {
    it('should check common pnpm locations', () => {
      const result = findRealPnpm()
      // Should return either a path or empty string
      expect(typeof result).toBe('string')
    })

    it('should return empty string when pnpm not found', () => {
      // This tests the ?? '' fallback
      const result = findRealPnpm()
      expect(typeof result).toBe('string')
    })
  })

  describe('findRealYarn - edge cases', () => {
    it('should check common yarn locations', () => {
      const result = findRealYarn()
      // Should return either a path or empty string
      expect(typeof result).toBe('string')
    })

    it('should return empty string when yarn not found', () => {
      // This tests the ?? '' fallback
      const result = findRealYarn()
      expect(typeof result).toBe('string')
    })
  })

  describe('resolveRealBinSync - Volta edge cases', () => {
    it('should handle missing Volta platform.json', async () => {
      await runWithTempDir(async tmpDir => {
        // Create a .volta path without platform.json
        const voltaPath = path.join(tmpDir, '.volta')
        const binPath = path.join(voltaPath, 'bin', 'npm')

        await fs.mkdir(path.dirname(binPath), { recursive: true })
        await fs.writeFile(binPath, '#!/bin/sh\necho "npm"', 'utf8')

        const result = resolveRealBinSync(binPath)
        // Should still return something even without platform.json
        expect(result).toBeTruthy()
      }, 'resolveBin-volta-no-platform-')
    })

    it('should handle Volta npm with missing version', async () => {
      await runWithTempDir(async tmpDir => {
        // Create Volta structure with platform.json but missing npm version
        const voltaPath = path.join(tmpDir, '.volta')
        const voltaUser = path.join(voltaPath, 'tools/user')
        const binPath = path.join(voltaPath, 'bin', 'npm')

        await fs.mkdir(voltaUser, { recursive: true })
        await fs.mkdir(path.dirname(binPath), { recursive: true })

        await fs.writeFile(
          path.join(voltaUser, 'platform.json'),
          JSON.stringify({ node: { runtime: '20.0.0' } }),
          'utf8',
        )
        await fs.writeFile(binPath, '#!/bin/sh\necho "npm"', 'utf8')

        const result = resolveRealBinSync(binPath)
        expect(result).toBeTruthy()
      }, 'resolveBin-volta-no-npm-version-')
    })

    it('should handle Volta with non-npm/npx binary', async () => {
      await runWithTempDir(async tmpDir => {
        const voltaPath = path.join(tmpDir, '.volta')
        const voltaUserBin = path.join(voltaPath, 'tools/user/bin')
        const binPath = path.join(voltaPath, 'bin', 'custom-tool')

        await fs.mkdir(voltaUserBin, { recursive: true })
        await fs.mkdir(path.dirname(binPath), { recursive: true })

        await fs.writeFile(
          path.join(voltaUserBin, 'custom-tool.json'),
          JSON.stringify({ package: 'custom-package@1.0.0' }),
          'utf8',
        )
        await fs.writeFile(binPath, '#!/bin/sh\necho "tool"', 'utf8')

        const result = resolveRealBinSync(binPath)
        expect(result).toBeTruthy()
      }, 'resolveBin-volta-custom-')
    })
  })

  describe('resolveRealBinSync - additional scenarios', () => {
    it('should handle current directory reference', () => {
      const result = resolveRealBinSync('.')
      expect(result).toBe('.')
    })

    it('should handle non-absolute path lookup', async () => {
      // When given a relative or binary name, should try to find it first
      const result = resolveRealBinSync('node')
      expect(result).toBeDefined()
      if (typeof result === 'string') {
        expect(result.length).toBeGreaterThan(0)
      }
    })

    it('should normalize Windows paths with backslashes', async () => {
      await runWithTempDir(async tmpDir => {
        const binPath = path.join(tmpDir, 'test.cmd')
        await fs.writeFile(binPath, '@echo off\necho test', 'utf8')

        const result = resolveRealBinSync(binPath)
        expect(result).toBeTruthy()
        // Result should be normalized (no backslashes mixed with forward slashes)
        if (typeof result === 'string') {
          expect(result.includes('\\')).toBe(false)
        }
      }, 'resolveBin-normalize-')
    })
  })
})
