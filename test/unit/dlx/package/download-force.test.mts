/**
 * @file Unit tests for src/dlx/package — the force-resolution ladder inside
 *   downloadNpmPackage and the Windows shell wrap inside executePackage.
 *   Arborist, the firewall check, isWin32, and spawn are all mocked so the
 *   branches run deterministically on any host platform.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

import type NpmArborist from '../../../../src/external/@npmcli/arborist.js'

const {
  arboristBuildIdealTreeMock,
  arboristReifyMock,
  checkFirewallPurlsMock,
  isWin32Mock,
  spawnMock,
} = vi.hoisted(() => ({
  arboristBuildIdealTreeMock: vi.fn(),
  arboristReifyMock: vi.fn(),
  checkFirewallPurlsMock: vi.fn(),
  isWin32Mock: vi.fn(),
  spawnMock: vi.fn(),
}))

vi.mock(import('../../../../src/external/@npmcli/arborist.js'), () => ({
  default: class FakeArborist {
    async buildIdealTree(options: unknown) {
      return await arboristBuildIdealTreeMock(options)
    }

    async reify(options: unknown) {
      return await arboristReifyMock(options)
    }
  } as unknown as typeof NpmArborist,
}))

vi.mock(import('../../../../src/dlx/firewall.mjs'), () => ({
  checkFirewallPurls: checkFirewallPurlsMock,
}))

vi.mock(
  import('../../../../src/constants/platform.mjs'),
  async importOriginal => {
    const actual = await importOriginal()
    return {
      ...actual,
      isWin32: isWin32Mock,
    }
  },
)

vi.mock(import('../../../../src/process/spawn/child.mjs'), () => ({
  spawn: spawnMock,
}))

import {
  downloadNpmPackage,
  executePackage,
} from '../../../../src/dlx/package.mjs'

/**
 * Lay down a minimal installed package so findBinaryPath resolves without a
 * real install.
 */
function stagePackage(installRoot: string, packageName: string): void {
  const installedDir = path.join(installRoot, 'node_modules', packageName)
  mkdirSync(installedDir, { recursive: true })
  writeFileSync(
    path.join(installedDir, 'package.json'),
    JSON.stringify({ bin: './cli.js', name: packageName, version: '1.0.0' }),
  )
  writeFileSync(
    path.join(installedDir, 'cli.js'),
    '#!/usr/bin/env node\nprocess.exit(0)\n',
  )
}

describe.sequential('downloadNpmPackage force resolution', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dlx-pkg-force-'))
    isWin32Mock.mockReset().mockReturnValue(false)
    spawnMock.mockReset().mockReturnValue({ spawnPromise: true })
    arboristBuildIdealTreeMock
      .mockReset()
      .mockResolvedValue({ inventory: new Map() })
    arboristReifyMock.mockReset().mockResolvedValue(undefined)
    checkFirewallPurlsMock.mockReset().mockResolvedValue(undefined)
  })

  afterEach(async () => {
    try {
      await safeDelete(tmpDir)
    } catch {}
  })

  it('leaves force off for an alias spec that carries no version', async () => {
    const installRoot = path.join(tmpDir, 'aliased')
    stagePackage(installRoot, 'example-alias')

    const result = await downloadNpmPackage({
      installRoot,
      spec: 'example-alias@npm:lodash@4.17.21',
    })

    expect(result.installed).toBe(false)
    expect(arboristReifyMock).not.toHaveBeenCalled()
  })

  it('leaves force off for an exact version with no yes flag', async () => {
    const installRoot = path.join(tmpDir, 'exact-version')
    stagePackage(installRoot, 'exact-version')

    const result = await downloadNpmPackage({
      installRoot,
      spec: 'exact-version@1.0.0',
    })

    expect(result.installed).toBe(false)
    expect(arboristReifyMock).not.toHaveBeenCalled()
  })

  it('forces a reinstall when the version is a range', async () => {
    const installRoot = path.join(tmpDir, 'ranged')
    stagePackage(installRoot, 'ranged')

    const result = await downloadNpmPackage({
      installRoot,
      spec: 'ranged@^1.0.0',
    })

    expect(result.installed).toBe(true)
    expect(arboristReifyMock).toHaveBeenCalledTimes(1)
  })

  it('forces a reinstall when the yes flag is set', async () => {
    const installRoot = path.join(tmpDir, 'yes-flag')
    stagePackage(installRoot, 'yes-flag')

    const result = await downloadNpmPackage({
      installRoot,
      spec: 'yes-flag@1.0.0',
      yes: true,
    })

    expect(result.installed).toBe(true)
    expect(arboristReifyMock).toHaveBeenCalledTimes(1)
  })

  it('lets an explicit force of false beat a range version', async () => {
    const installRoot = path.join(tmpDir, 'explicit-false')
    stagePackage(installRoot, 'explicit-false')

    const result = await downloadNpmPackage({
      force: false,
      installRoot,
      spec: 'explicit-false@^1.0.0',
    })

    expect(result.installed).toBe(false)
    expect(arboristReifyMock).not.toHaveBeenCalled()
  })
})

describe.sequential('executePackage shell selection', () => {
  beforeEach(() => {
    isWin32Mock.mockReset().mockReturnValue(false)
    spawnMock.mockReset().mockReturnValue({ ok: true })
  })

  it('passes spawn options through unchanged off Windows', () => {
    executePackage('/tmp/pkg/cli.js', ['--version'], { cwd: '/tmp' })

    expect(spawnMock).toHaveBeenCalledWith(
      '/tmp/pkg/cli.js',
      ['--version'],
      { cwd: '/tmp' },
      undefined,
    )
  })

  it('leaves a plain executable unwrapped on Windows', () => {
    isWin32Mock.mockReturnValue(true)
    executePackage('C:/pkg/cli.exe', [], { cwd: 'C:/' })

    expect(spawnMock).toHaveBeenCalledWith(
      'C:/pkg/cli.exe',
      [],
      { cwd: 'C:/' },
      undefined,
    )
  })

  it('wraps a .cmd script in a shell on Windows', () => {
    isWin32Mock.mockReturnValue(true)
    executePackage('C:/pkg/cli.cmd', ['run'], { cwd: 'C:/' })

    expect(spawnMock).toHaveBeenCalledWith(
      'C:/pkg/cli.cmd',
      ['run'],
      // The mock forces isWin32() true, so this asserts the resolved value.
      // oxlint-disable-next-line socket/prefer-shell-win32 -- resolved value
      { cwd: 'C:/', shell: true },
      undefined,
    )
  })

  it('wraps a .ps1 script in a shell on Windows with no options given', () => {
    isWin32Mock.mockReturnValue(true)
    executePackage('C:/pkg/cli.ps1', [])

    expect(spawnMock).toHaveBeenCalledWith(
      'C:/pkg/cli.ps1',
      [],
      // The mock forces isWin32() true, so this asserts the resolved value.
      // oxlint-disable-next-line socket/prefer-shell-win32 -- resolved value
      { shell: true },
      undefined,
    )
  })
})
