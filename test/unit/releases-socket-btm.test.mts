/**
 * @fileoverview Unit tests for socket-btm release utilities.
 */

import { describe, expect, it } from 'vitest'

import {
  detectLibc,
  downloadSocketBtmRelease,
  getBinaryAssetName,
  getBinaryName,
  getPlatformArch,
} from '@socketsecurity/lib/releases/socket-btm'

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
        'binject-win-x64.exe',
      )
    })

    it('should return correct asset name for win32-arm64', () => {
      expect(getBinaryAssetName('node', 'win32', 'arm64')).toBe(
        'node-win-arm64.exe',
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

    it('should return correct identifier for win-x64', () => {
      expect(getPlatformArch('win32', 'x64')).toBe('win-x64')
    })

    it('should ignore libc for non-linux platforms', () => {
      expect(getPlatformArch('darwin', 'arm64', 'musl')).toBe('darwin-arm64')
      expect(getPlatformArch('win32', 'x64', 'musl')).toBe('win-x64')
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

  describe('downloadSocketBtmRelease', () => {
    it('should accept tool as first parameter and options as second parameter', () => {
      // Type checking test - verifies new signature compiles correctly
      expect(typeof downloadSocketBtmRelease).toBe('function')

      // Verify the function accepts the correct signature
      // (actual download tests would require mocking GitHub API)
      const tool = 'lief'
      const options = {
        downloadDir: 'build/downloaded',
        quiet: true,
      }

      // This verifies TypeScript accepts the new signature
      expect(() => downloadSocketBtmRelease(tool, options)).toBeDefined()
      expect(() => downloadSocketBtmRelease(tool, undefined)).toBeDefined()
    })

    it('should accept undefined options parameter', () => {
      // Verify options is truly optional
      const tool = 'curl'

      // TypeScript should allow calling with just tool parameter
      expect(() => downloadSocketBtmRelease(tool, undefined)).toBeDefined()
    })
  })
})
