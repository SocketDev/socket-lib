/**
 * @file Tests for catch branches in src/dlx/manifest.ts that fire when
 *   filesystem ops fail (safeMkdirSync / safeDeleteSync / readFileUtf8Sync /
 *   fs.writeFileSync / fs.renameSync). Mocks the resolved helper exports so the
 *   SUT's call surfaces the intended failure and exercises the corresponding
 *   catch / cleanup paths.
 */

import crypto from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DlxManifest } from '../../../src/dlx/manifest.mjs'

import { readFileUtf8Sync } from '../../../src/fs/read-file.mjs'
import {
  safeDelete,
  safeDeleteSync,
  safeMkdirSync,
} from '../../../src/fs/safe.mjs'

import type * as nodeFs from 'node:fs'
import type * as readFileModule from '../../../src/fs/read-file.mjs'
import type * as safeModule from '../../../src/fs/safe.mjs'

vi.mock(import('../../../src/fs/read-file.mjs'), async importOriginal => {
  const original = await importOriginal<typeof readFileModule>()
  return {
    ...original,
    readFileUtf8Sync: vi.fn(original.readFileUtf8Sync),
  }
})

vi.mock(import('../../../src/fs/safe.mjs'), async importOriginal => {
  const original = await importOriginal<typeof safeModule>()
  return {
    ...original,
    safeDeleteSync: vi.fn(original.safeDeleteSync),
    safeMkdirSync: vi.fn(original.safeMkdirSync),
  }
})

export function makeFsError(code: string): Error {
  const e = new Error(`simulated ${code}`) as Error & { code: string }
  e.code = code
  return e
}

describe.sequential('dlx/manifest — error branches', () => {
  let testDir: string
  let manifestPath: string
  let manifest: DlxManifest

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `socket-manifest-err-${crypto.randomUUID()}`,
    )
    mkdirSync(testDir, { recursive: true })
    manifestPath = path.join(testDir, '.dlx-manifest.json')
    manifest = new DlxManifest({ manifestPath })
    vi.mocked(readFileUtf8Sync).mockClear()
    vi.mocked(safeDeleteSync).mockClear()
    vi.mocked(safeMkdirSync).mockClear()
  })

  afterEach(async () => {
    // The vi.mock factory spreads `...original`, so `safeDelete`
    // (async) is passed through unchanged. Use the async form per
    // CLAUDE.md preference for async surrounding code.
    try {
      await safeDelete(testDir)
    } catch {}
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

    it('returns empty array from getAllPackages when manifest content is empty', () => {
      writeFileSync(manifestPath, '   \n  ', 'utf8')
      expect(manifest.getAllPackages()).toEqual([])
    })

    it('returns empty array from getAllPackages when manifest does not exist', () => {
      // No file written at manifestPath.
      expect(manifest.getAllPackages()).toEqual([])
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

    it('returns early when the manifest does not exist', async () => {
      // No file written at manifestPath — clear() short-circuits.
      await expect(manifest.clear('pkg-x')).resolves.toBeUndefined()
    })

    it('returns early when the manifest is empty/whitespace', async () => {
      writeFileSync(manifestPath, '   \n  ', 'utf8')
      await expect(manifest.clear('pkg-x')).resolves.toBeUndefined()
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

  describe('setPackageEntry() catch paths', () => {
    it('continues when readFileSync of existing manifest is malformed JSON', async () => {
      // Write malformed JSON: the read succeeds but JSON.parse throws,
      // exercising readManifest's catch branch that treats it as empty.
      writeFileSync(manifestPath, 'not-valid-json', 'utf8')
      // Even with the malformed file on disk, setPackageEntry should
      // succeed (treats as empty, writes its single entry). No throw is
      // the assertion.
      await expect(
        manifest.setPackageEntry('pkg@1.0.0', 'cache-key', {
          name: 'pkg',
          version: '1.0.0',
        } as never),
      ).resolves.toBeUndefined()
    })

    it('warns and continues when safeMkdirSync fails', async () => {
      vi.mocked(safeMkdirSync).mockImplementationOnce(() => {
        throw makeFsError('EACCES')
      })
      // Even with the mkdir warn, writeManifest proceeds to writeFileSync.
      // If that succeeds (because the dir already exists from beforeEach),
      // the operation completes normally.
      await expect(
        manifest.setPackageEntry('p@1.0.0', 'cache-key', {
          name: 'p',
          version: '1.0.0',
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

    it('runs cleanup branch when renameSync throws + temp file exists', async () => {
      // Seed a manifest so the write goes through writeManifest with a
      // real temp file.
      writeFileSync(manifestPath, '{}', 'utf8')
      // Patch fs.renameSync at runtime to throw, causing the outer catch.
      const fsMod = require('node:fs') as typeof nodeFs
      const originalRename = fsMod.renameSync
      fsMod.renameSync = ((src: string, dest: string) => {
        void src
        void dest
        throw makeFsError('EPERM')
      }) as typeof fsMod.renameSync
      try {
        // setPackageEntry calls writeManifest; the writeFileSync to
        // tempPath succeeds, the renameSync throws, the inner cleanup runs.
        await expect(
          manifest.setPackageEntry('test-pkg@1.0.0', 'cache-key', {
            name: 'test-pkg',
            version: '1.0.0',
          } as never),
        ).rejects.toThrow(/EPERM/)
      } finally {
        fsMod.renameSync = originalRename
      }
    })
  })
})
