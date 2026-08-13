/**
 * @file Unit tests for socket-btm release download utilities. The naming
 *   helpers are covered in socket-btm-binary-naming.test.mts.
 */

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  detectLibc,
  downloadSocketBtmRelease,
} from '../../../src/releases/socket-btm'

import { getReleaseAssetUrl } from '../../../src/releases/github-asset-url'
import { getLatestRelease } from '../../../src/releases/github-listing'
import { downloadGitHubRelease } from '../../../src/releases/github-downloads'

// Mock the downstream github release helpers so we can verify socket-btm's
// config construction without issuing real network or filesystem operations.
// Uses src path so vi.mock() intercepts cross-module imports within src/ files.
vi.mock(import('../../../src/releases/github-asset-url'), () => ({
  fetchReleaseAssetsViaGraphQL: vi.fn(),
  getReleaseAssetUrl: vi.fn(),
}))
vi.mock(import('../../../src/releases/github-listing'), () => ({
  fetchReleasesViaGraphQL: vi.fn(),
  fetchReleasesViaRest: vi.fn(),
  getLatestRelease: vi.fn(),
}))
vi.mock(import('../../../src/releases/github-downloads'), () => ({
  downloadGitHubRelease: vi.fn(),
}))

describe('releases/socket-btm', () => {
  describe('detectLibc', () => {
    it('should return undefined for non-Linux platforms on macOS/Windows', () => {
      // This test behavior depends on the host OS
      const result = detectLibc()
      if (process.platform !== 'linux') {
        expect(result).toBeUndefined()
      } else {
        expect(['musl', 'glibc']).toContain(result)
      }
    })
  })

  describe.sequential('downloadSocketBtmRelease', () => {
    beforeEach(() => {
      vi.mocked(downloadGitHubRelease).mockReset()
      vi.mocked(getLatestRelease).mockReset()
      vi.mocked(getReleaseAssetUrl).mockReset()
    })

    it('should pass binary config to downloadGitHubRelease for current platform', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('binject-20250101-abc')
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/tmp/dl/binject-darwin-arm64/binject',
      )

      const result = await downloadSocketBtmRelease('binject', {
        downloadDir: '/tmp/dl',
        quiet: true,
        targetPlatform: 'darwin',
        targetArch: 'arm64',
      })

      expect(result).toBe('/tmp/dl/binject-darwin-arm64/binject')
      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg).toMatchObject({
        owner: 'SocketDev',
        repo: 'socket-btm',
        toolName: 'binject',
        toolPrefix: 'binject-',
        assetName: [
          'binject-darwin-arm64',
          'binject-20250101-abc-darwin-arm64.node',
        ],
        binaryName: 'binject',
        platformArch: 'darwin-arm64',
        downloadDir: '/tmp/dl',
        quiet: true,
        tag: 'binject-20250101-abc',
      })
    })

    it('should encode libc in asset + platform for linux with musl', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('node-20250101-abc')
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/tmp/dl/node-linux-x64-musl/node',
      )

      await downloadSocketBtmRelease('node', {
        downloadDir: '/tmp/dl',
        quiet: true,
        targetPlatform: 'linux',
        targetArch: 'x64',
        libc: 'musl',
      })

      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg).toMatchObject({
        assetName: [
          'node-linux-x64-musl',
          'node-20250101-abc-linux-x64-musl.node',
        ],
        platformArch: 'linux-x64-musl',
        binaryName: 'node',
      })
    })

    it('should pass explicit tag through to downloadGitHubRelease', async () => {
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/tmp/dl/bin-darwin-arm64/bin',
      )

      await downloadSocketBtmRelease('bin', {
        quiet: true,
        tag: 'bin-20250101-abc',
        targetPlatform: 'darwin',
        targetArch: 'arm64',
      })

      // Explicit tag skips the latest-release lookup entirely.
      expect(getLatestRelease).not.toHaveBeenCalled()
      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg.tag).toBe('bin-20250101-abc')
      expect(cfg.assetName).toEqual([
        'bin-darwin-arm64',
        'bin-20250101-abc-darwin-arm64.node',
      ])
    })

    it('should include the tag-infixed .node prebuilt candidate after the plain asset name', async () => {
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/tmp/dl/opentui-linux-x64-musl/opentui',
      )

      await downloadSocketBtmRelease('opentui', {
        quiet: true,
        tag: 'opentui-20260424-18f0f46',
        targetPlatform: 'linux',
        targetArch: 'x64',
        libc: 'musl',
      })

      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg.assetName).toEqual([
        'opentui-linux-x64-musl',
        'opentui-20260424-18f0f46-linux-x64-musl.node',
      ])
    })

    it('should throw when no release exists for the binary tool prefix', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce(undefined)

      await expect(
        downloadSocketBtmRelease('ghost', {
          quiet: true,
          targetPlatform: 'darwin',
          targetArch: 'arm64',
        }),
      ).rejects.toThrow('No ghost- release found in SocketDev/socket-btm')
      expect(downloadGitHubRelease).not.toHaveBeenCalled()
    })

    it('should use .exe binary name on windows', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('node-20250101-abc')
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        'C:\\dl\\node-win32-x64\\node.exe',
      )

      await downloadSocketBtmRelease('node', {
        quiet: true,
        targetPlatform: 'win32',
        targetArch: 'x64',
      })

      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg).toMatchObject({
        // Published node-smol windows assets use the release platform token,
        // as do the .node prebuilt families.
        assetName: ['node-win-x64.exe', 'node-20250101-abc-win-x64.node'],
        binaryName: 'node.exe',
        platformArch: 'win32-x64',
      })
    })

    it('should default bin to tool name when bin is unset', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('lief-20250101-abc')
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/tmp/dl/example/lief',
      )

      await downloadSocketBtmRelease('lief', {
        quiet: true,
        targetPlatform: 'darwin',
        targetArch: 'arm64',
      })

      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg.binaryName).toBe('lief')
      expect(cfg.assetName).toEqual([
        'lief-darwin-arm64',
        'lief-20250101-abc-darwin-arm64.node',
      ])
    })

    it('should use explicit bin name when different from tool', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('tool-20250101-abc')
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/tmp/dl/example/other',
      )

      await downloadSocketBtmRelease('tool', {
        bin: 'other',
        quiet: true,
        targetPlatform: 'darwin',
        targetArch: 'arm64',
      })

      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg).toMatchObject({
        toolName: 'tool',
        toolPrefix: 'tool-',
        binaryName: 'other',
        assetName: [
          'other-darwin-arm64',
          'tool-20250101-abc-darwin-arm64.node',
        ],
      })
    })

    it('should download an asset by exact name', async () => {
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/tmp/assets/models-data.tar.gz',
      )

      const result = await downloadSocketBtmRelease('models', {
        asset: 'models-data.tar.gz',
        downloadDir: '/tmp/assets',
        quiet: true,
      })

      expect(result).toBe('/tmp/assets/models-data.tar.gz')
      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg).toMatchObject({
        toolName: 'models',
        toolPrefix: 'models-',
        assetName: 'models-data.tar.gz',
        binaryName: 'models-data.tar.gz',
        platformArch: 'assets',
      })
    })

    it('should resolve asset pattern via latest release and asset URL', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('models-20250101-abc')
      vi.mocked(getReleaseAssetUrl).mockResolvedValueOnce(
        'https://github.com/SocketDev/socket-btm/releases/download/models-20250101-abc/models-v2.tar.gz',
      )
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/tmp/assets/models-v2.tar.gz',
      )

      await downloadSocketBtmRelease('models', {
        asset: 'models-*.tar.gz',
        downloadDir: '/tmp/assets',
        quiet: true,
      })

      // Pattern resolution calls both helpers before delegating the download.
      expect(getLatestRelease).toHaveBeenCalled()
      expect(getReleaseAssetUrl).toHaveBeenCalled()
      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg).toMatchObject({
        assetName: 'models-v2.tar.gz',
        tag: 'models-20250101-abc',
      })
    })

    it('should reject asset pattern paired with explicit tag', async () => {
      await expect(
        downloadSocketBtmRelease('models', {
          asset: 'models-*.tar.gz',
          tag: 'models-20250101-abc',
          quiet: true,
        }),
      ).rejects.toThrow('Cannot use asset pattern with explicit tag')
    })

    it('should throw when no matching release found for pattern', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce(undefined)

      await expect(
        downloadSocketBtmRelease('models', {
          asset: 'models-*.tar.gz',
          quiet: true,
        }),
      ).rejects.toThrow(/No models release with matching asset pattern/)
    })

    it('forwards an explicit cwd through to downloadGitHubRelease config', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('bin-20250101-abc')
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce('/tmp/dl/example')
      await downloadSocketBtmRelease('bin', {
        cwd: '/my/repo/root',
        quiet: true,
        targetPlatform: 'darwin',
        targetArch: 'arm64',
      })
      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg.cwd).toBe('/my/repo/root')
    })

    it('forwards an explicit downloadDir through to downloadGitHubRelease config', async () => {
      vi.mocked(getLatestRelease).mockResolvedValueOnce('bin-20250101-abc')
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce(
        '/example/dl/sample',
      )
      await downloadSocketBtmRelease('bin', {
        downloadDir: '/example/dl',
        quiet: true,
        targetPlatform: 'darwin',
        targetArch: 'arm64',
      })
      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg.downloadDir).toBe('/example/dl')
    })
  })
})
