/**
 * @fileoverview Unit tests for dlx/packages — DLX package management.
 *
 * Uses a real tmpdir and overrides SOCKET_DLX_DIR via env so we can
 * inspect actual filesystem state. Each test isolates with its own
 * tmpdir.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  isDlxPackageInstalled,
  listDlxPackages,
  listDlxPackagesAsync,
  removeDlxPackage,
  removeDlxPackageSync,
} from '@socketsecurity/lib/dlx/packages'
import { setPath } from '@socketsecurity/lib/paths/rewire'

let tmpDir: string
let savedDlxDir: string | undefined

describe.sequential('dlx/packages', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'socket-dlx-test-'))
    savedDlxDir = process.env['SOCKET_DLX_DIR']
    process.env['SOCKET_DLX_DIR'] = tmpDir
    // Override the cached path lookup so tests don't need a fresh process.
    setPath('socket-dlx-dir', tmpDir)
  })

  afterEach(() => {
    if (savedDlxDir === undefined) {
      delete process.env['SOCKET_DLX_DIR']
    } else {
      process.env['SOCKET_DLX_DIR'] = savedDlxDir
    }
    setPath('socket-dlx-dir', undefined)
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  describe('isDlxPackageInstalled', () => {
    it('returns false when the package directory does not exist', () => {
      expect(isDlxPackageInstalled('nope')).toBe(false)
    })
  })

  describe('listDlxPackages', () => {
    it('returns an empty array when DLX dir is empty', () => {
      const result = listDlxPackages()
      expect(result).toEqual([])
    })

    it('returns sorted entries when DLX dir has subdirectories', () => {
      const dlxRoot = tmpDir
      mkdirSync(path.join(dlxRoot, 'zzz'), { recursive: true })
      mkdirSync(path.join(dlxRoot, 'aaa'), { recursive: true })
      mkdirSync(path.join(dlxRoot, 'mmm'), { recursive: true })
      const result = listDlxPackages()
      expect(result).toEqual(['aaa', 'mmm', 'zzz'])
    })

    it('returns empty array when DLX dir does not exist', () => {
      // Remove the pre-created _dlx directory.
      rmSync(tmpDir, { recursive: true, force: true })
      const result = listDlxPackages()
      expect(result).toEqual([])
    })
  })

  describe('listDlxPackagesAsync', () => {
    it('returns sorted entries when DLX dir has subdirectories', async () => {
      const dlxRoot = tmpDir
      mkdirSync(path.join(dlxRoot, 'beta'), { recursive: true })
      mkdirSync(path.join(dlxRoot, 'alpha'), { recursive: true })
      const result = await listDlxPackagesAsync()
      expect(result).toEqual(['alpha', 'beta'])
    })

    it('filters out non-directory entries', async () => {
      const dlxRoot = tmpDir
      mkdirSync(path.join(dlxRoot, 'pkg-a'), { recursive: true })
      // Drop a file (not a directory) — should be filtered out.
      const fs = await import('node:fs')
      fs.writeFileSync(path.join(dlxRoot, 'not-a-package.txt'), '')
      const result = await listDlxPackagesAsync()
      expect(result).toEqual(['pkg-a'])
    })

    it('returns empty array when DLX dir does not exist', async () => {
      rmSync(tmpDir, { recursive: true, force: true })
      const result = await listDlxPackagesAsync()
      expect(result).toEqual([])
    })
  })

  describe('removeDlxPackage', () => {
    it('removes an existing package directory', async () => {
      const dlxRoot = tmpDir
      const pkgDir = path.join(dlxRoot, 'pkg-x')
      mkdirSync(pkgDir, { recursive: true })
      await removeDlxPackage('pkg-x')
      expect(existsSync(pkgDir)).toBe(false)
    })

    it('does not throw when removing a non-existent package', async () => {
      // safeDelete with force:true silently no-ops on missing paths.
      await expect(removeDlxPackage('does-not-exist')).resolves.toBeUndefined()
    })
  })

  describe('removeDlxPackageSync', () => {
    it('removes an existing package directory', () => {
      const dlxRoot = tmpDir
      const pkgDir = path.join(dlxRoot, 'pkg-y')
      mkdirSync(pkgDir, { recursive: true })
      removeDlxPackageSync('pkg-y')
      expect(existsSync(pkgDir)).toBe(false)
    })

    it('does not throw when removing a non-existent package', () => {
      expect(() => removeDlxPackageSync('does-not-exist')).not.toThrow()
    })
  })
})
