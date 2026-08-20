/**
 * @file A cached dlx binary is measured against the caller's pin. A cache hit
 *   skips the download, so without this check a pin governs only the first
 *   fetch on each machine and anything able to write the cache reaches
 *   execution.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  hashBinaryFile,
  verifyCachedBinary,
} from '../../../src/dlx/binary-download.mjs'

async function stagedBinary(bytes: string): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dlx-verify-'))
  const file = path.join(dir, 'tool')
  writeFileSync(file, bytes)
  return file
}

describe('verifyCachedBinary', () => {
  it('returns the digests when the pin matches', async () => {
    const file = await stagedBinary('the real payload')
    const digests = await hashBinaryFile(file)
    const verified = await verifyCachedBinary(file, {
      integrity: digests.integrity,
    })
    expect(verified.sha256).toBe(digests.sha256)
  })

  it('throws when a swapped cache entry fails the pinned integrity', async () => {
    const honest = await stagedBinary('the real payload')
    const pinned = await hashBinaryFile(honest)
    const swapped = await stagedBinary('an attacker payload')
    await expect(
      verifyCachedBinary(swapped, { integrity: pinned.integrity }),
    ).rejects.toThrow(/Integrity mismatch/)
  })

  it('throws when a swapped cache entry fails the pinned sha256', async () => {
    const honest = await stagedBinary('the real payload')
    const pinned = await hashBinaryFile(honest)
    const swapped = await stagedBinary('an attacker payload')
    await expect(
      verifyCachedBinary(swapped, { sha256: pinned.sha256 }),
    ).rejects.toThrow(/SHA-256 mismatch/)
  })

  it('accepts any bytes when the caller pinned nothing', async () => {
    const file = await stagedBinary('unpinned payload')
    const digests = await verifyCachedBinary(file)
    expect(digests.integrity).toMatch(/^sha512-/)
  })
})
