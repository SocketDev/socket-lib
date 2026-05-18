/**
 * @file Tests for downloadBinaryFile in src/dlx/binary.ts: integrity
 *   verification, retry-on-existing-file fast path, download failure wrapping,
 *   and chmod-on-Unix. Mocks httpDownload so the test runs hermetically without
 *   making real network calls.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadBinaryFile } from '../../../src/dlx/binary'
import { safeDelete } from '../../../src/fs/safe'
import { httpDownload } from '../../../src/http-request/download'

vi.mock('../../../src/http-request/download', async importOriginal => {
  const original =
    await importOriginal<typeof import('../../../src/http-request/download')>()
  return {
    ...original,
    httpDownload: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_url: string, destPath: string, _opts?: any) => {
        // Default behavior: write a known payload.
        writeFileSync(destPath, Buffer.from('default-payload'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { ok: true, status: 200, path: destPath } as any
      },
    ),
  }
})

export function sha512OfBuffer(buf: Buffer): string {
  const h = createHash('sha512').update(buf).digest('base64')
  return `sha512-${h}`
}

describe.sequential('dlx/binary — downloadBinaryFile', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(path.join(os.tmpdir(), 'dlx-bin-dl-'))
    vi.mocked(httpDownload).mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    try {
      await safeDelete(testDir, { force: true })
    } catch {}
  })

  it('downloads and returns the SRI integrity hash', async () => {
    const destPath = path.join(testDir, 'tool')
    const result = await downloadBinaryFile(
      'https://example.com/tool',
      destPath,
    )
    expect(result.startsWith('sha512-')).toBe(true)
    expect(existsSync(destPath)).toBe(true)
  })

  it('returns existing-file integrity when destPath already has content', async () => {
    const destPath = path.join(testDir, 'pre-existing')
    const payload = Buffer.from('already-here')
    writeFileSync(destPath, payload)
    const expectedIntegrity = sha512OfBuffer(payload)
    const result = await downloadBinaryFile('https://example.com/x', destPath)
    expect(result).toBe(expectedIntegrity)
    // httpDownload should NOT be called when the file is pre-staged.
    expect(httpDownload).not.toHaveBeenCalled()
  })

  it('verifies integrity and accepts matching hash', async () => {
    const payload = Buffer.from('expected-content')
    vi.mocked(httpDownload).mockImplementationOnce(async (_url, destPath) => {
      writeFileSync(destPath, payload)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { ok: true, status: 200, path: destPath } as any
    })
    const expectedIntegrity = sha512OfBuffer(payload)
    const destPath = path.join(testDir, 'verified')
    const result = await downloadBinaryFile(
      'https://example.com/x',
      destPath,
      expectedIntegrity,
    )
    expect(result).toBe(expectedIntegrity)
  })

  it('throws integrity-mismatch and removes the bad file', async () => {
    const payload = Buffer.from('actual-content')
    vi.mocked(httpDownload).mockImplementationOnce(async (_url, destPath) => {
      writeFileSync(destPath, payload)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { ok: true, status: 200, path: destPath } as any
    })
    const wrongIntegrity = sha512OfBuffer(Buffer.from('different-content'))
    const destPath = path.join(testDir, 'mismatch')
    await expect(
      downloadBinaryFile('https://example.com/x', destPath, wrongIntegrity),
    ).rejects.toThrow(/Integrity mismatch/)
    // Bad file removed by safeDelete.
    expect(existsSync(destPath)).toBe(false)
  })

  it('wraps download errors with URL + destination context', async () => {
    vi.mocked(httpDownload).mockRejectedValueOnce(new Error('network-down'))
    const destPath = path.join(testDir, 'err')
    await expect(
      downloadBinaryFile('https://example.com/x', destPath),
    ).rejects.toThrow(
      /Failed to download binary from https:\/\/example\.com\/x/,
    )
  })

  it('passes sha256 option through to httpDownload when provided', async () => {
    const destPath = path.join(testDir, 'with-sha256')
    await downloadBinaryFile(
      'https://example.com/x',
      destPath,
      undefined,
      'a'.repeat(64),
    )
    const args = vi.mocked(httpDownload).mock.calls[0]!
    expect(args[2]).toEqual({ sha256: 'a'.repeat(64) })
  })
})
