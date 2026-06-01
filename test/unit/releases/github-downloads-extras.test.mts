/**
 * @file Tests for the toolPrefix tag-resolution branch and the asset-not-found
 *   throw in src/releases/github-downloads.ts that the existing
 *   releases-github-downloads.test.mts doesn't cover. Mocks getLatestRelease +
 *   getReleaseAssetUrl + httpDownload so the tests run hermetically.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  downloadGitHubRelease,
  downloadReleaseAsset,
} from '../../../src/releases/github-downloads'

import { safeDelete } from '../../../src/fs/safe'
import { httpDownload } from '../../../src/http-request/download'
import { getReleaseAssetUrl } from '../../../src/releases/github-asset-url'
import { getLatestRelease } from '../../../src/releases/github-listing'

vi.mock(
  import('../../../src/releases/github-asset-url'),
  async importOriginal => {
    const original =
      await importOriginal<
        typeof import('../../../src/releases/github-asset-url')
      >()
    return {
      ...original,
      getReleaseAssetUrl: vi.fn(),
    }
  },
)

vi.mock(
  import('../../../src/releases/github-listing'),
  async importOriginal => {
    const original =
      await importOriginal<
        typeof import('../../../src/releases/github-listing')
      >()
    return {
      ...original,
      getLatestRelease: vi.fn(),
    }
  },
)

vi.mock(import('../../../src/http-request/download'), async importOriginal => {
  const original =
    await importOriginal<typeof import('../../../src/http-request/download')>()
  return {
    ...original,
    httpDownload: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_url: string, destPath: string, _opts?: any) => {
        // Write a real file at destPath so subsequent fs ops succeed.
        writeFileSync(destPath, 'fake-binary-content')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { ok: true, status: 200, path: destPath } as any
      },
    ),
  }
})

const REPO = { owner: 'SocketDev', repo: 'socket-btm' }

describe.sequential('releases/github-downloads — extras', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(path.join(os.tmpdir(), 'gh-downloads-extras-'))
    vi.mocked(getLatestRelease).mockClear()
    vi.mocked(getReleaseAssetUrl).mockClear()
    vi.mocked(httpDownload).mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    try {
      await safeDelete(testDir, { force: true })
    } catch {}
  })

  describe('downloadGitHubRelease — toolPrefix tag resolution', () => {
    it('resolves latest tag from toolPrefix when explicit tag is absent', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('mytool-v1.2.3')
      vi.mocked(getReleaseAssetUrl).mockResolvedValueOnce(
        'https://example.com/asset.tar.gz',
      )
      const downloadDir = path.join(testDir, 'tool-prefix-ok')
      mkdirSync(downloadDir, { recursive: true })
      const result = await downloadGitHubRelease({
        ...REPO,
        binaryName: 'mytool',
        downloadDir,
        cwd: testDir,
        platformArch: 'darwin-arm64',
        toolName: 'mytool',
        toolPrefix: 'mytool-',
        assetName: 'mytool-darwin-arm64.tar.gz',
        quiet: true,
      })
      expect(result).toContain('mytool')
      expect(getLatestRelease).toHaveBeenCalled()
    })

    it('throws when toolPrefix has no matching release', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce(undefined)
      const downloadDir = path.join(testDir, 'tool-prefix-fail')
      mkdirSync(downloadDir, { recursive: true })
      await expect(
        downloadGitHubRelease({
          ...REPO,
          binaryName: 'mytool',
          downloadDir,
          cwd: testDir,
          platformArch: 'darwin-arm64',
          toolName: 'mytool',
          toolPrefix: 'unknown-',
          assetName: 'asset.tar.gz',
          quiet: true,
        }),
      ).rejects.toThrow(/No unknown- release found/)
    })

    it('throws when neither tag nor toolPrefix are provided', async () => {
      const downloadDir = path.join(testDir, 'no-tag')
      mkdirSync(downloadDir, { recursive: true })
      await expect(
        downloadGitHubRelease({
          ...REPO,
          binaryName: 'mytool',
          downloadDir,
          cwd: testDir,
          platformArch: 'darwin-arm64',
          toolName: 'mytool',
          assetName: 'asset.tar.gz',
          quiet: true,
        }),
      ).rejects.toThrow(/Either toolPrefix or tag must be provided/)
    })

    it('honors explicit tag over toolPrefix', async () => {
      vi.mocked(getReleaseAssetUrl).mockResolvedValueOnce(
        'https://example.com/asset.tar.gz',
      )
      const downloadDir = path.join(testDir, 'explicit-tag')
      mkdirSync(downloadDir, { recursive: true })
      const result = await downloadGitHubRelease({
        ...REPO,
        binaryName: 'mytool',
        downloadDir,
        cwd: testDir,
        platformArch: 'darwin-arm64',
        toolName: 'mytool',
        tag: 'v9.9.9',
        assetName: 'asset.tar.gz',
        quiet: true,
      })
      expect(result).toContain('mytool')
      expect(getLatestRelease).not.toHaveBeenCalled()
    })

    it('uses cached binary when version file matches tag', async () => {
      const downloadDir = path.join(testDir, 'cache-hit')
      mkdirSync(downloadDir, { recursive: true })
      // Pre-seed the binary and version file.
      writeFileSync(path.join(downloadDir, 'mytool'), 'cached-binary')
      writeFileSync(path.join(downloadDir, '.version'), 'v1.0.0')
      const result = await downloadGitHubRelease({
        ...REPO,
        binaryName: 'mytool',
        downloadDir,
        cwd: testDir,
        platformArch: 'darwin-arm64',
        toolName: 'mytool',
        tag: 'v1.0.0',
        assetName: 'asset.tar.gz',
        quiet: true,
      })
      expect(result).toContain('mytool')
      // Cached path: httpDownload should not be called.
      expect(httpDownload).not.toHaveBeenCalled()
    })
  })

  describe('downloadReleaseAsset — error path', () => {
    it('throws when getReleaseAssetUrl returns undefined', async () => {
      vi.mocked(getReleaseAssetUrl).mockResolvedValueOnce(undefined)
      await expect(
        downloadReleaseAsset(
          'v1.0.0',
          'missing-asset.tar.gz',
          path.join(testDir, 'output'),
          REPO,
          { quiet: true },
        ),
      ).rejects.toThrow(/Asset .+ not found in release v1\.0\.0/)
    })

    it('uses object pattern description when assetPattern is not a string', async () => {
      vi.mocked(getReleaseAssetUrl).mockResolvedValueOnce(undefined)
      await expect(
        downloadReleaseAsset(
          'v1.0.0',
          { prefix: 'asset-', suffix: '.zip' },
          path.join(testDir, 'output'),
          REPO,
          { quiet: true },
        ),
      ).rejects.toThrow(/Asset matching pattern not found/)
    })
  })
})
