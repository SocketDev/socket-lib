/**
 * @file Unit tests for src/dlx/package — the failure paths of
 *   ensurePackageInstalled. Every registry-facing and filesystem-facing
 *   dependency is mocked so the error-classification branches (mkdir errno
 *   mapping, lockfile materialization, Arborist error translation) run without
 *   touching the network or needing a read-only filesystem.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

import type NpmArborist from '../../../../src/external/@npmcli/arborist.js'

const {
  arboristBuildIdealTreeMock,
  arboristReifyMock,
  checkFirewallPurlsMock,
  safeMkdirMock,
} = vi.hoisted(() => ({
  arboristBuildIdealTreeMock: vi.fn(),
  arboristReifyMock: vi.fn(),
  checkFirewallPurlsMock: vi.fn(),
  safeMkdirMock: vi.fn(),
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

vi.mock(import('../../../../src/fs/safe.mjs'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    safeMkdir: safeMkdirMock,
  }
})

import { ensurePackageInstalled } from '../../../../src/dlx/package.mjs'

/**
 * Build an errno-shaped rejection the way node's fs surfaces one.
 */
function errnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(`mock ${code}`) as NodeJS.ErrnoException
  err.code = code
  return err
}

/**
 * Build a registry-shaped rejection carrying npm's `code` discriminant.
 */
function registryError(code: string): Error & { code: string } {
  const err = new Error(`mock registry ${code}`) as Error & { code: string }
  err.code = code
  return err
}

describe.sequential('ensurePackageInstalled failure paths', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dlx-pkg-errors-'))
    safeMkdirMock.mockReset().mockResolvedValue(undefined)
    arboristBuildIdealTreeMock.mockReset().mockResolvedValue({
      inventory: new Map(),
    })
    arboristReifyMock.mockReset().mockResolvedValue(undefined)
    checkFirewallPurlsMock.mockReset().mockResolvedValue(undefined)
  })

  afterEach(async () => {
    try {
      await safeDelete(tmpDir)
    } catch {}
  })

  describe('package directory creation', () => {
    it('maps EACCES to a permission-denied message', async () => {
      safeMkdirMock.mockRejectedValueOnce(errnoError('EACCES'))
      await expect(
        ensurePackageInstalled('pkg-eacces', 'pkg-eacces@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'eacces') },
        }),
      ).rejects.toThrow(/Permission denied creating package directory/)
    })

    it('maps EPERM to the same permission-denied message', async () => {
      safeMkdirMock.mockRejectedValueOnce(errnoError('EPERM'))
      await expect(
        ensurePackageInstalled('pkg-eperm', 'pkg-eperm@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'eperm') },
        }),
      ).rejects.toThrow(/Permission denied creating package directory/)
    })

    it('maps EROFS to a read-only filesystem message', async () => {
      safeMkdirMock.mockRejectedValueOnce(errnoError('EROFS'))
      await expect(
        ensurePackageInstalled('pkg-erofs', 'pkg-erofs@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'erofs') },
        }),
      ).rejects.toThrow(/read-only filesystem/)
    })

    it('wraps an unrecognized errno in a generic create failure', async () => {
      safeMkdirMock.mockRejectedValueOnce(errnoError('ENOSPC'))
      await expect(
        ensurePackageInstalled('pkg-enospc', 'pkg-enospc@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'enospc') },
        }),
      ).rejects.toThrow(/Failed to create package directory/)
    })
  })

  describe('lockfile materialization', () => {
    it('writes an explicit content lockfile verbatim', async () => {
      const installRoot = path.join(tmpDir, 'lock-content')
      const value = JSON.stringify({ lockfileVersion: 3, name: 'lock-content' })

      await ensurePackageInstalled('lock-content', 'lock-content@1.0.0', {
        force: true,
        install: {
          installRoot,
          lockfile: { type: 'content', value },
        },
      })

      expect(
        readFileSync(path.join(installRoot, 'package-lock.json'), 'utf8'),
      ).toBe(value)
    })

    it('copies an explicit path lockfile from disk', async () => {
      const installRoot = path.join(tmpDir, 'lock-path')
      const source = path.join(tmpDir, 'source-lock.json')
      const value = JSON.stringify({ lockfileVersion: 3, name: 'lock-path' })
      writeFileSync(source, value, 'utf8')

      await ensurePackageInstalled('lock-path', 'lock-path@1.0.0', {
        force: true,
        install: {
          installRoot,
          lockfile: { type: 'path', value: source },
        },
      })

      expect(
        readFileSync(path.join(installRoot, 'package-lock.json'), 'utf8'),
      ).toBe(value)
    })

    it('treats a bare non-JSON string lockfile as a filesystem path', async () => {
      const installRoot = path.join(tmpDir, 'lock-sniff-path')
      const source = path.join(tmpDir, 'sniffed-lock.json')
      const value = JSON.stringify({ lockfileVersion: 3, name: 'sniffed' })
      writeFileSync(source, value, 'utf8')

      await ensurePackageInstalled('sniffed', 'sniffed@1.0.0', {
        force: true,
        install: { installRoot, lockfile: source },
      })

      expect(
        readFileSync(path.join(installRoot, 'package-lock.json'), 'utf8'),
      ).toBe(value)
    })
  })

  describe('install error translation', () => {
    it('rethrows a Socket Firewall block unwrapped', async () => {
      const blocked = new Error('Socket Firewall blocked malicious-pkg@1.0.0')
      arboristBuildIdealTreeMock.mockRejectedValueOnce(blocked)

      await expect(
        ensurePackageInstalled('malicious-pkg', 'malicious-pkg@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'firewall') },
        }),
      ).rejects.toBe(blocked)
    })

    it('maps E404 to a package-not-found message', async () => {
      arboristBuildIdealTreeMock.mockRejectedValueOnce(registryError('E404'))
      await expect(
        ensurePackageInstalled('missing-pkg', 'missing-pkg@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'e404') },
        }),
      ).rejects.toThrow(/Package not found: missing-pkg@1\.0\.0/)
    })

    it('maps ETARGET to the same package-not-found message', async () => {
      arboristBuildIdealTreeMock.mockRejectedValueOnce(registryError('ETARGET'))
      await expect(
        ensurePackageInstalled('bad-range', 'bad-range@9.9.9', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'etarget') },
        }),
      ).rejects.toThrow(/Package not found: bad-range@9\.9\.9/)
    })

    it('maps EAI_AGAIN to a network-error message', async () => {
      arboristBuildIdealTreeMock.mockRejectedValueOnce(
        registryError('EAI_AGAIN'),
      )
      await expect(
        ensurePackageInstalled('dns-flake', 'dns-flake@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'eai') },
        }),
      ).rejects.toThrow(/Network error installing dns-flake@1\.0\.0/)
    })

    it('maps ENOTFOUND to a network-error message', async () => {
      arboristBuildIdealTreeMock.mockRejectedValueOnce(
        registryError('ENOTFOUND'),
      )
      await expect(
        ensurePackageInstalled('no-host', 'no-host@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'enotfound') },
        }),
      ).rejects.toThrow(/Network error installing/)
    })

    it('maps ETIMEDOUT to a network-error message', async () => {
      arboristBuildIdealTreeMock.mockRejectedValueOnce(
        registryError('ETIMEDOUT'),
      )
      await expect(
        ensurePackageInstalled('slow-host', 'slow-host@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'etimedout') },
        }),
      ).rejects.toThrow(/Network error installing/)
    })

    it('wraps an unclassified install failure with the destination', async () => {
      arboristBuildIdealTreeMock.mockRejectedValueOnce(new Error('boom'))
      await expect(
        ensurePackageInstalled('mystery', 'mystery@1.0.0', {
          force: true,
          install: { installRoot: path.join(tmpDir, 'mystery') },
        }),
      ).rejects.toThrow(/Failed to install package: mystery@1\.0\.0/)
    })
  })
})
