/**
 * @fileoverview Unit tests for socket-btm release utilities.
 */

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  detectLibc,
  downloadSocketBtmRelease,
  getBinaryAssetName,
  getBinaryName,
  getPlatformArch,
} from '../../src/releases/socket-btm'

import {
  downloadGitHubRelease,
  getLatestRelease,
  getReleaseAssetUrl,
} from '../../src/releases/github'

// Mock the downstream github release helpers so we can verify socket-btm's
// config construction without issuing real network or filesystem operations.
// Uses src path so vi.mock() intercepts cross-module imports within src/ files.
vi.mock('../../src/releases/github', () => ({
  downloadGitHubRelease: vi.fn(),
  getLatestRelease: vi.fn(),
  getReleaseAssetUrl: vi.fn(),
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

  describe('getBinaryAssetName', () => {
    it('should return correct asset name for darwin-arm64', () => {
      expect(getBinaryAssetName('binject', 'darwin', 'arm64')).toBe(
        'binject-darwin-arm64',
      )
    })

    it('should return correct asset name for darwin-x64', () => {
      expect(getBinaryAssetName('node', 'darwin', 'x64')).toBe(
        'node-darwin-x64',
      )
    })

    it('should return correct asset name for linux-x64 with glibc', () => {
      expect(getBinaryAssetName('binject', 'linux', 'x64', 'glibc')).toBe(
        'binject-linux-x64',
      )
    })

    it('should return correct asset name for linux-x64 with musl', () => {
      expect(getBinaryAssetName('node', 'linux', 'x64', 'musl')).toBe(
        'node-linux-x64-musl',
      )
    })

    it('should return correct asset name for linux-arm64 with musl', () => {
      expect(getBinaryAssetName('binflate', 'linux', 'arm64', 'musl')).toBe(
        'binflate-linux-arm64-musl',
      )
    })

    it('should return correct asset name for win32-x64', () => {
      expect(getBinaryAssetName('binject', 'win32', 'x64')).toBe(
        'binject-win32-x64.exe',
      )
    })

    it('should return correct asset name for win32-arm64', () => {
      expect(getBinaryAssetName('node', 'win32', 'arm64')).toBe(
        'node-win32-arm64.exe',
      )
    })

    it('should throw for unsupported architecture', () => {
      expect(() =>
        getBinaryAssetName('node', 'darwin', 'ia32' as 'x64'),
      ).toThrow('Unsupported architecture')
    })

    it('should throw for unsupported platform', () => {
      expect(() =>
        getBinaryAssetName('node', 'freebsd' as 'darwin', 'x64'),
      ).toThrow('Unsupported platform')
    })
  })

  describe('getPlatformArch', () => {
    it('should return correct identifier for darwin-arm64', () => {
      expect(getPlatformArch('darwin', 'arm64')).toBe('darwin-arm64')
    })

    it('should return correct identifier for darwin-x64', () => {
      expect(getPlatformArch('darwin', 'x64')).toBe('darwin-x64')
    })

    it('should return correct identifier for linux-x64 without libc', () => {
      expect(getPlatformArch('linux', 'x64')).toBe('linux-x64')
    })

    it('should return correct identifier for linux-x64 with glibc', () => {
      expect(getPlatformArch('linux', 'x64', 'glibc')).toBe('linux-x64')
    })

    it('should return correct identifier for linux-x64 with musl', () => {
      expect(getPlatformArch('linux', 'x64', 'musl')).toBe('linux-x64-musl')
    })

    it('should return correct identifier for linux-arm64 with musl', () => {
      expect(getPlatformArch('linux', 'arm64', 'musl')).toBe('linux-arm64-musl')
    })

    it('should return correct identifier for win32-x64', () => {
      expect(getPlatformArch('win32', 'x64')).toBe('win32-x64')
    })

    it('should ignore libc for non-linux platforms', () => {
      expect(getPlatformArch('darwin', 'arm64', 'musl')).toBe('darwin-arm64')
      expect(getPlatformArch('win32', 'x64', 'musl')).toBe('win32-x64')
    })

    it('should throw for unsupported architecture', () => {
      expect(() => getPlatformArch('darwin', 'ia32' as 'x64')).toThrow(
        'Unsupported architecture',
      )
    })
  })

  describe('getBinaryName', () => {
    it('should return binary name without extension for darwin', () => {
      expect(getBinaryName('node', 'darwin')).toBe('node')
    })

    it('should return binary name without extension for linux', () => {
      expect(getBinaryName('binject', 'linux')).toBe('binject')
    })

    it('should return binary name with .exe extension for win32', () => {
      expect(getBinaryName('node', 'win32')).toBe('node.exe')
    })

    it('should return binary name with .exe extension for win32', () => {
      expect(getBinaryName('binject', 'win32')).toBe('binject.exe')
    })
  })

  describe.sequential('downloadSocketBtmRelease', () => {
    beforeEach(() => {
      vi.mocked(downloadGitHubRelease).mockReset()
      vi.mocked(getLatestRelease).mockReset()
      vi.mocked(getReleaseAssetUrl).mockReset()
    })

    it('should pass binary config to downloadGitHubRelease for current platform', async () => {
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
        assetName: 'binject-darwin-arm64',
        binaryName: 'binject',
        platformArch: 'darwin-arm64',
        downloadDir: '/tmp/dl',
        quiet: true,
      })
    })

    it('should encode libc in asset + platform for linux with musl', async () => {
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
        assetName: 'node-linux-x64-musl',
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

      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg.tag).toBe('bin-20250101-abc')
    })

    it('should use .exe binary name on windows', async () => {
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
        assetName: 'node-win32-x64.exe',
        binaryName: 'node.exe',
        platformArch: 'win32-x64',
      })
    })

    it('should default bin to tool name when bin is unset', async () => {
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce('/tmp/dl/x/lief')

      await downloadSocketBtmRelease('lief', {
        quiet: true,
        targetPlatform: 'darwin',
        targetArch: 'arm64',
      })

      const cfg = vi.mocked(downloadGitHubRelease).mock.lastCall![0]
      expect(cfg.binaryName).toBe('lief')
      expect(cfg.assetName).toBe('lief-darwin-arm64')
    })

    it('should use explicit bin name when different from tool', async () => {
      vi.mocked(downloadGitHubRelease).mockResolvedValueOnce('/tmp/dl/x/other')

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
        assetName: 'other-darwin-arm64',
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
      vi.mocked(getLatestRelease).mockResolvedValueOnce(null)

      await expect(
        downloadSocketBtmRelease('models', {
          asset: 'models-*.tar.gz',
          quiet: true,
        }),
      ).rejects.toThrow(/No models release with matching asset pattern/)
    })
  })
})
