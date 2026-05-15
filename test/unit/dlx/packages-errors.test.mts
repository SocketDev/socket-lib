/**
 * @fileoverview Tests for catch branches in src/dlx/packages.ts that
 * fire when filesystem ops fail (EACCES / EPERM / EROFS / generic).
 *
 * Mocks the safeDelete[Sync] exports from ../../../src/fs so the SUT's
 * call surfaces an errno-typed error and exercises the corresponding
 * catch handlers in removeDlxPackage[Sync].
 */

import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { resetEnv, setEnv } from '@socketsecurity/lib-stable/env/rewire'
import { invalidateCaches } from '@socketsecurity/lib-stable/paths/rewire'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  removeDlxPackage,
  removeDlxPackageSync,
} from '../../../src/dlx/packages'

import { safeDelete, safeDeleteSync } from '../../../src/fs/safe'

// Mock the fs helpers at the resolved path the SUT imports.
vi.mock('../../../src/fs/safe', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/fs/safe')>()
  return {
    ...original,
    safeDelete: vi.fn(original.safeDelete),
    safeDeleteSync: vi.fn(original.safeDeleteSync),
  }
})

export function makeFsError(code: string): Error {
  const e = new Error(`simulated ${code}`) as Error & { code: string }
  e.code = code
  return e
}

describe.sequential('dlx/packages — error branches', () => {
  let testDlxDir: string

  beforeEach(() => {
    invalidateCaches()
    testDlxDir = path.join(
      os.tmpdir(),
      `socket-dlx-err-${randomUUID()}`,
      '_dlx',
    )
    mkdirSync(testDlxDir, { recursive: true })
    setEnv('SOCKET_DLX_DIR', testDlxDir)
    vi.mocked(safeDelete).mockClear()
    vi.mocked(safeDeleteSync).mockClear()
  })

  afterEach(async () => {
    resetEnv()
    invalidateCaches()
    // Clean the parent of testDlxDir so the random root goes too.
    // Mock wraps original.safeDelete; default-impl calls through.
    try {
      await safeDelete(path.dirname(testDlxDir), { force: true })
    } catch {}
  })

  describe('removeDlxPackage (async)', () => {
    it('wraps generic safeDelete failure with package context', async () => {
      vi.mocked(safeDelete).mockImplementationOnce(async () => {
        throw new Error('underlying-fs-error')
      })
      await expect(removeDlxPackage('pkg-async-1')).rejects.toThrow(
        /Failed to remove DLX package "pkg-async-1"/,
      )
    })

    it('preserves the original error via Error.cause', async () => {
      const original = new Error('original-error')
      vi.mocked(safeDelete).mockImplementationOnce(async () => {
        throw original
      })
      await expect(removeDlxPackage('pkg-async-2')).rejects.toMatchObject({
        cause: original,
      })
    })
  })

  describe('removeDlxPackageSync', () => {
    it('throws permission-denied error on EACCES', () => {
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw makeFsError('EACCES')
      })
      expect(() => removeDlxPackageSync('pkg-eacces')).toThrow(
        /Permission denied removing DLX package "pkg-eacces"/,
      )
    })

    it('throws permission-denied error on EPERM', () => {
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw makeFsError('EPERM')
      })
      expect(() => removeDlxPackageSync('pkg-eperm')).toThrow(
        /Permission denied removing DLX package "pkg-eperm"/,
      )
    })

    it('throws read-only-filesystem error on EROFS', () => {
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw makeFsError('EROFS')
      })
      expect(() => removeDlxPackageSync('pkg-erofs')).toThrow(
        /read-only filesystem/,
      )
    })

    it('throws generic error for unknown error codes', () => {
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw makeFsError('EWEIRD')
      })
      expect(() => removeDlxPackageSync('pkg-other')).toThrow(
        /Failed to remove DLX package "pkg-other"/,
      )
    })

    it('throws generic error when there is no error code', () => {
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw new Error('plain')
      })
      expect(() => removeDlxPackageSync('pkg-plain')).toThrow(
        /Failed to remove DLX package "pkg-plain"/,
      )
    })

    it('preserves the original error via Error.cause', () => {
      const original = makeFsError('EACCES')
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw original
      })
      try {
        removeDlxPackageSync('pkg-cause')
      } catch (e) {
        expect((e as Error & { cause?: unknown }).cause).toBe(original)
      }
    })
  })
})
