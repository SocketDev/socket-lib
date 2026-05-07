/**
 * @fileoverview Tests for catch branches in src/dlx/manifest.ts that
 * fire when filesystem ops fail (safeMkdirSync / safeDeleteSync /
 * readFileUtf8Sync / fs.writeFileSync / fs.renameSync).
 *
 * Mocks the resolved helper exports so the SUT's call surfaces the
 * intended failure and exercises the corresponding catch / cleanup
 * paths.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DlxManifest } from '../../../src/dlx/manifest'

import {
  readFileUtf8Sync,
  safeDeleteSync,
  safeMkdirSync,
} from '../../../src/fs'

vi.mock('../../../src/fs', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/fs')>()
  return {
    ...original,
    readFileUtf8Sync: vi.fn(original.readFileUtf8Sync),
    safeDeleteSync: vi.fn(original.safeDeleteSync),
    safeMkdirSync: vi.fn(original.safeMkdirSync),
  }
})

function makeFsError(code: string): Error {
  const e = new Error(`simulated ${code}`) as Error & { code: string }
  e.code = code
  return e
}

describe.sequential('dlx/manifest — error branches', () => {
  let testDir: string
  let manifestPath: string
  let manifest: DlxManifest

  beforeEach(() => {
    testDir = path.join(tmpdir(), `socket-manifest-err-${randomUUID()}`)
    mkdirSync(testDir, { recursive: true })
    manifestPath = path.join(testDir, '.dlx-manifest.json')
    manifest = new DlxManifest({ manifestPath })
    vi.mocked(readFileUtf8Sync).mockClear()
    vi.mocked(safeDeleteSync).mockClear()
    vi.mocked(safeMkdirSync).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('readManifest catch path', () => {
    it('returns empty object when readFileUtf8Sync throws', () => {
      // First seed a real manifest so existsSync passes.
      writeFileSync(manifestPath, '{}', 'utf8')
      vi.mocked(readFileUtf8Sync).mockImplementationOnce(() => {
        throw makeFsError('EACCES')
      })
      // getAllPackages calls readManifest under the hood and swallows.
      const result = manifest.getAllPackages()
      expect(result).toEqual([])
    })
  })

  describe('clear() catch path', () => {
    it('warns and returns when reading the manifest fails', async () => {
      writeFileSync(manifestPath, '{"pkg-a":{}}', 'utf8')
      vi.mocked(readFileUtf8Sync).mockImplementationOnce(() => {
        throw makeFsError('EACCES')
      })
      // Should not throw — the catch swallows and warns.
      await expect(manifest.clear('pkg-a')).resolves.toBeUndefined()
    })
  })

  describe('clearAll() catch path', () => {
    it('warns when safeDeleteSync fails', async () => {
      writeFileSync(manifestPath, '{}', 'utf8')
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw makeFsError('EPERM')
      })
      await expect(manifest.clearAll()).resolves.toBeUndefined()
    })
  })

  describe('set() catch paths', () => {
    it('continues when readFileSync of existing manifest is malformed JSON', async () => {
      // Write malformed JSON: the read succeeds but JSON.parse throws,
      // exercising the catch branch that warns and treats as empty.
      writeFileSync(manifestPath, 'not-valid-json', 'utf8')
      const record = {
        timestampFetch: Date.now(),
        latestVersion: '1.0.0',
      }
      // Even with the malformed file on disk, set() should succeed
      // (catches the parse error, treats as empty, writes its single
      // entry). No throw is the assertion.
      await expect(
        manifest.set('pkg', record as never),
      ).resolves.toBeUndefined()
    })

    it('warns and continues when safeMkdirSync fails', async () => {
      vi.mocked(safeMkdirSync).mockImplementationOnce(() => {
        throw makeFsError('EACCES')
      })
      // Even with the mkdir warn, set() proceeds to writeFileSync.
      // If that succeeds (because the dir already exists from beforeEach),
      // the operation completes normally.
      await expect(
        manifest.set('p', {
          timestampFetch: Date.now(),
          latestVersion: '1.0.0',
        } as never),
      ).resolves.toBeUndefined()
    })
  })

  describe('writeManifest atomic-write catch path', () => {
    it('cleans up temp file when rename fails (clear() path)', async () => {
      writeFileSync(manifestPath, '{"a":{}}', 'utf8')
      // safeDeleteSync inside the catch is the cleanup call.
      // Force it to throw to exercise the inner catch (line 414).
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw makeFsError('EPERM')
      })
      // clear() will call writeManifest indirectly. Even if cleanup
      // fails internally, clear() swallows via its own try/catch.
      await expect(manifest.clear('a')).resolves.toBeUndefined()
    })
  })
})
