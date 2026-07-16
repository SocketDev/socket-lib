/**
 * @file Integration-style unit coverage for the public DLX package
 *   orchestrators. Pre-staged packages keep the tests deterministic and avoid
 *   registry access while exercising download, executable preparation, and
 *   process spawning end to end.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import { dlxPackage, downloadNpmPackage } from '../../../src/dlx/package'
import { runWithTempDir } from '../util/temp-file-helper'

function stagePackage(installRoot: string, packageName: string): string {
  const installedDir = path.join(installRoot, 'node_modules', packageName)
  const isWindows = process.platform === 'win32'
  const binaryName = isWindows ? 'cli.cmd' : 'cli.js'
  const binaryPath = path.join(installedDir, binaryName)
  mkdirSync(installedDir, { recursive: true })
  writeFileSync(
    path.join(installedDir, 'package.json'),
    JSON.stringify({
      bin: `./${binaryName}`,
      name: packageName,
      version: '1.0.0',
    }),
  )
  writeFileSync(
    binaryPath,
    isWindows
      ? '@echo off\r\nexit /b 0\r\n'
      : '#!/usr/bin/env node\nprocess.exit(0)\n',
  )
  return normalizePath(binaryPath)
}

describe.sequential('dlx/package orchestrators', () => {
  it('returns a pre-staged package without reinstalling it', async () => {
    await runWithTempDir(async installRoot => {
      const expectedBinaryPath = stagePackage(installRoot, 'fixture-package')

      const result = await downloadNpmPackage({
        force: false,
        installRoot,
        spec: 'fixture-package@1.0.0',
      })

      expect(result).toEqual({
        binaryPath: expectedBinaryPath,
        installed: false,
        packageDir: normalizePath(installRoot),
      })
    }, 'dlx-package-download-')
  })

  it('downloads and executes a pre-staged package', async () => {
    await runWithTempDir(async installRoot => {
      const expectedBinaryPath = stagePackage(installRoot, 'fixture-exec')

      const result = await dlxPackage([], {
        force: false,
        installRoot,
        spec: 'fixture-exec@1.0.0',
      })

      expect(result.binaryPath).toBe(expectedBinaryPath)
      expect(result.installed).toBe(false)
      await expect(result.spawnPromise).resolves.toMatchObject({ code: 0 })
    }, 'dlx-package-execute-')
  })
})
