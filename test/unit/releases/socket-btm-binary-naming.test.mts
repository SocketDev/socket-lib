/**
 * @file Unit tests for socket-btm binary asset/platform-arch naming helpers.
 */

import { describe, expect, it } from 'vitest'

import {
  getBinaryAssetName,
  getBinaryName,
  getNodePrebuildAssetName,
  getPlatformArch,
} from '../../../src/releases/socket-btm-binary-naming.mjs'

describe('releases/socket-btm-binary-naming', () => {
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

    it('uses the release platform token for node-smol windows assets', () => {
      // Published node-smol assets are node-win-<arch>.exe (release-platform
      // naming), unlike the binject/binflate families which keep win32.
      expect(getBinaryAssetName('node', 'win32', 'arm64')).toBe(
        'node-win-arm64.exe',
      )
      expect(getBinaryAssetName('node', 'win32', 'x64')).toBe(
        'node-win-x64.exe',
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

  describe('getNodePrebuildAssetName', () => {
    it('should return tag-infixed .node asset name for darwin-arm64', () => {
      expect(
        getNodePrebuildAssetName('opentui-20260424-18f0f46', 'darwin', 'arm64'),
      ).toBe('opentui-20260424-18f0f46-darwin-arm64.node')
    })

    it('should return tag-infixed .node asset name for linux-x64 with glibc', () => {
      expect(
        getNodePrebuildAssetName(
          'opentui-20260424-18f0f46',
          'linux',
          'x64',
          'glibc',
        ),
      ).toBe('opentui-20260424-18f0f46-linux-x64.node')
    })

    it('should encode musl exactly as getPlatformArch renders it', () => {
      expect(
        getNodePrebuildAssetName(
          'opentui-20260424-18f0f46',
          'linux',
          'x64',
          'musl',
        ),
      ).toBe('opentui-20260424-18f0f46-linux-x64-musl.node')
      expect(
        getNodePrebuildAssetName(
          'opentui-20260424-18f0f46',
          'linux',
          'arm64',
          'musl',
        ),
      ).toBe('opentui-20260424-18f0f46-linux-arm64-musl.node')
    })

    it('should use the release platform token win on windows', () => {
      // Published .node prebuilt assets are <tag>-win-<arch>.node, the
      // release-platform naming that matches the node-smol family.
      expect(
        getNodePrebuildAssetName('opentui-20260424-18f0f46', 'win32', 'arm64'),
      ).toBe('opentui-20260424-18f0f46-win-arm64.node')
      expect(
        getNodePrebuildAssetName('opentui-20260424-18f0f46', 'win32', 'x64'),
      ).toBe('opentui-20260424-18f0f46-win-x64.node')
    })

    it('should throw for unsupported architecture', () => {
      expect(() =>
        getNodePrebuildAssetName('tag', 'darwin', 'ia32' as 'x64'),
      ).toThrow('Unsupported architecture')
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

    it('should append .exe to non-node binary names on win32', () => {
      expect(getBinaryName('binject', 'win32')).toBe('binject.exe')
    })
  })
})
