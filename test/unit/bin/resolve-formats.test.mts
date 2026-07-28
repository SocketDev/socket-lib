/**
 * @file Unit tests for src/bin/resolve — resolveRealBinSync's package-manager
 *   shim format coverage: extensionless Unix shell scripts (pnpm, yarn) and
 *   the Windows `.cmd`/`.ps1` shim variants for npm, npx, pnpm, and yarn.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveRealBinSync } from '../../../src/bin/resolve'
import { runWithTempDir } from '../util/temp-file-helper'

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
