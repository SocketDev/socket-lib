/**
 * @fileoverview Tests for catch branches in src/process-lock.ts that
 * fire when lock-file fs ops fail. Each test covers a distinct catch
 * handler whose only purpose is "log and continue / log and rethrow."
 */

import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { processLock } from '../../src/process-lock'
import { safeDeleteSync } from '../../src/fs'

vi.mock('../../src/fs', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/fs')>()
  return {
    ...original,
    safeDeleteSync: vi.fn(original.safeDeleteSync),
  }
})

function makeFsError(code: string): Error {
  const e = new Error(`simulated ${code}`) as Error & { code: string }
  e.code = code
  return e
}

describe.sequential('process-lock — error branches', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'plock-err-'))
    vi.mocked(safeDeleteSync).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('release()', () => {
    it('warns and continues when safeDeleteSync fails', async () => {
      const lockPath = path.join(testDir, 'release-fail.lock')
      // Acquire so the lock file exists and `release` enters the
      // safeDeleteSync branch.
      const release = await processLock.acquire(lockPath)
      // Inject an error for the next safeDeleteSync call.
      vi.mocked(safeDeleteSync).mockImplementationOnce(() => {
        throw makeFsError('EPERM')
      })
      // release() must NOT throw — its job is to swallow and warn.
      expect(() => release()).not.toThrow()
    })
  })

  describe('acquire()', () => {
    it('removes a stale lock and re-acquires successfully', async () => {
      const lockPath = path.join(testDir, 'stale.lock')
      // Create the lock path manually with old mtime.
      mkdirSync(lockPath, { recursive: true })
      const fs = await import('node:fs')
      const past = new Date(Date.now() - 60_000)
      fs.utimesSync(lockPath, past, past)
      // staleMs: 1000 → 60s mtime is stale → acquire removes and succeeds.
      const release = await processLock.acquire(lockPath, {
        retries: 0,
        staleMs: 1000,
      })
      expect(typeof release).toBe('function')
      release()
    })

    it('throws lock-already-exists when not stale', async () => {
      const lockPath = path.join(testDir, 'fresh.lock')
      const release = await processLock.acquire(lockPath)
      try {
        await expect(
          processLock.acquire(lockPath, {
            // Very large staleMs so the existing lock is never stale.
            staleMs: 1_000_000,
          }),
        ).rejects.toThrow(/Lock already exists/)
      } finally {
        release()
      }
    })
  })
})
