/**
 * @file Unit tests for src/bin/resolve — resolveRealBinSync Windows and Volta
 *   scenarios (cmd/ps1 shims, Volta-managed binaries, fallback paths,
 *   non-existent files, format coverage). Split out of resolve.test.mts to stay
 *   under the file-size cap.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveRealBinSync } from '../../../src/bin/resolve'
import { runWithTempDir } from '../util/temp-file-helper'

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
