/**
 * @file Unit tests for src/bin/resolve — resolveRealBinSync (Windows, Unix,
 *   Volta, npm/pnpm/yarn edge cases, format coverage). Split out of the
 *   historical monolithic test/unit/bin.test.mts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveRealBinSync } from '../../../src/bin/resolve'
import { isError } from '../../../src/errors/predicates'
import { runWithTempDir } from '../util/temp-file-helper'

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
      } catch (e) {
        // Skip if symlinks are not supported on this platform
        if (
          isError(e) &&
          (e.message.includes('EPERM') ||
            e.message.includes('operation not permitted'))
        ) {
          logger.log('Skipping symlink test - not supported')
        } else {
          throw e
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
