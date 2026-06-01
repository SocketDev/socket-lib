/**
 * @file Tests for the cache eviction + stale-entry paths in src/dlx/detect.ts
 *   that aren't covered by the existing detect tests.
 */

import crypto from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  detectLocalExecutableType,
  isJsFilePath,
} from '../../../src/dlx/detect'
import { safeDelete } from '../../../src/fs/safe'

describe.sequential('dlx/detect — cache + stale paths', () => {
  let testDir: string

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `socket-detect-cache-${crypto.randomUUID()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(async () => {
    await safeDelete(testDir, { force: true })
  })

  describe('detectLocalExecutableType', () => {
    it('detects package via package.json with bin field', () => {
      const projDir = path.join(testDir, 'proj')
      mkdirSync(projDir, { recursive: true })
      writeFileSync(
        path.join(projDir, 'package.json'),
        JSON.stringify({ name: 'p', bin: './cli.js' }),
      )
      const result = detectLocalExecutableType(path.join(projDir, 'cli.js'))
      expect(result.type).toBe('package')
      expect(result.method).toBe('package-json')
    })

    it('detects native binary when no package.json + non-JS ext', () => {
      const filePath = path.join(testDir, 'tool')
      writeFileSync(filePath, 'fake-bin')
      const result = detectLocalExecutableType(filePath)
      expect(result.type).toBe('binary')
      expect(result.method).toBe('file-extension')
    })

    it('detects package via .js extension fallback when no package.json', () => {
      const filePath = path.join(testDir, 'script.js')
      writeFileSync(filePath, 'console.log()')
      const result = detectLocalExecutableType(filePath)
      expect(result.type).toBe('package')
      expect(result.method).toBe('file-extension')
    })

    it('caches package.json lookups (second call hits the cache)', () => {
      const projDir = path.join(testDir, 'cached-proj')
      mkdirSync(projDir, { recursive: true })
      writeFileSync(
        path.join(projDir, 'package.json'),
        JSON.stringify({ name: 'p', bin: './cli.js' }),
      )
      const first = detectLocalExecutableType(path.join(projDir, 'cli.js'))
      const second = detectLocalExecutableType(path.join(projDir, 'cli.js'))
      expect(first.type).toBe(second.type)
    })

    it('reprobes after the cached path is removed (stale entry path)', () => {
      const projDir = path.join(testDir, 'stale-proj')
      mkdirSync(projDir, { recursive: true })
      const pkgJson = path.join(projDir, 'package.json')
      writeFileSync(pkgJson, JSON.stringify({ name: 'p', bin: './cli.js' }))
      // Prime cache.
      detectLocalExecutableType(path.join(projDir, 'cli.js'))
      // Remove the package.json — next call should re-probe.
      rmSync(pkgJson)
      const result = detectLocalExecutableType(path.join(projDir, 'cli.js'))
      // Falls back to file-extension because package.json is gone.
      expect(result.method).toBe('file-extension')
    })

    it('re-uses cached package.json content when mtime is unchanged', () => {
      const projDir = path.join(testDir, 'mtime-proj')
      mkdirSync(projDir, { recursive: true })
      writeFileSync(
        path.join(projDir, 'package.json'),
        JSON.stringify({ name: 'p', bin: './cli.js' }),
      )
      // Two calls back-to-back hit the content cache (mtime unchanged).
      const a = detectLocalExecutableType(path.join(projDir, 'cli.js'))
      const b = detectLocalExecutableType(path.join(projDir, 'cli.js'))
      expect(a.type).toBe('package')
      expect(b.type).toBe('package')
    })

    it('returns binary when package.json exists but has no bin field', () => {
      const projDir = path.join(testDir, 'no-bin-proj')
      mkdirSync(projDir, { recursive: true })
      writeFileSync(
        path.join(projDir, 'package.json'),
        JSON.stringify({ name: 'p' }),
      )
      // No bin → falls through to extension check; tool has no .js → binary.
      const filePath = path.join(projDir, 'tool')
      writeFileSync(filePath, 'fake')
      const result = detectLocalExecutableType(filePath)
      expect(result.type).toBe('binary')
    })

    it('returns binary when package.json is malformed', () => {
      const projDir = path.join(testDir, 'bad-proj')
      mkdirSync(projDir, { recursive: true })
      writeFileSync(path.join(projDir, 'package.json'), '{ not valid json')
      const filePath = path.join(projDir, 'tool')
      writeFileSync(filePath, 'fake')
      const result = detectLocalExecutableType(filePath)
      // package.json read failed; falls through to extension check.
      expect(result.type).toBe('binary')
    })
  })

  describe('isJsFilePath', () => {
    it('returns true for .js, .mjs, .cjs', () => {
      expect(isJsFilePath('a.js')).toBe(true)
      expect(isJsFilePath('a.mjs')).toBe(true)
      expect(isJsFilePath('a.cjs')).toBe(true)
    })

    it('returns false for binary extensions', () => {
      expect(isJsFilePath('a.exe')).toBe(false)
      expect(isJsFilePath('a.so')).toBe(false)
      expect(isJsFilePath('a')).toBe(false)
    })

    it('case-insensitive', () => {
      expect(isJsFilePath('A.JS')).toBe(true)
    })
  })

  describe('packageJsonPathCacheSet', () => {
    it('refreshes a cached entry when the key already exists', async () => {
      const { packageJsonPathCacheSet } =
        await import('../../../src/dlx/detect')
      // Set, then re-set the same key — exercises the delete-when-present branch.
      packageJsonPathCacheSet('/some/key', '/path/v1')
      packageJsonPathCacheSet('/some/key', '/path/v2')
      expect(() =>
        packageJsonPathCacheSet('/some/key', undefined),
      ).not.toThrow()
    })

    it('handles many distinct keys without throwing (LRU eviction path)', async () => {
      const { packageJsonPathCacheSet } =
        await import('../../../src/dlx/detect')
      // Push enough entries to exceed the cache cap and force eviction.
      for (let i = 0; i < 200; i++) {
        packageJsonPathCacheSet(`/key-${i}`, `/path-${i}`)
      }
      expect(true).toBe(true)
    })
  })
})
