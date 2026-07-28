/**
 * @file Tests for downloadBinaryFile in src/dlx/binary.ts: integrity
 *   verification, retry-on-existing-file fast path, download failure wrapping,
 *   and chmod-on-Unix. Mocks httpDownload so the test runs hermetically without
 *   making real network calls.
 */

import crypto from 'node:crypto'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadBinaryFile } from '../../../src/dlx/binary'
import { safeDelete } from '../../../src/fs/safe'
import { httpDownload } from '../../../src/http-request/download'

import type * as DownloadModule from '../../../src/http-request/download'
import type {
  HttpDownloadOptions,
  HttpDownloadResult,
  HttpDownloadWriteStreamFactory,
} from '../../../src/http-request/download-types'

function mockDownloadResult(
  destPath: string,
  payload = Buffer.from('default-payload'),
): HttpDownloadResult {
  return {
    headers: {},
    integrity: sha512OfBuffer(payload),
    ok: true,
    path: destPath,
    sha256: crypto.createHash('sha256').update(payload).digest('hex'),
    size: 0,
    status: 200,
    statusText: 'OK',
  }
}

type DownloadModuleExports = typeof DownloadModule

vi.mock(import('../../../src/http-request/download'), async importOriginal => {
  const original = await importOriginal<DownloadModuleExports>()
  return {
    ...original,
    httpDownload: vi.fn(
      async (
        _url: string,
        destPath: string,
        _opts?: HttpDownloadOptions | undefined,
      ): Promise<HttpDownloadResult> => {
        // Default behavior: write a known payload.
        writeFileSync(destPath, Buffer.from('default-payload'))
        return mockDownloadResult(destPath)
      },
    ) as unknown as DownloadModuleExports['httpDownload'],
  }
})

export function sha512OfBuffer(buf: Buffer): string {
  const h = crypto.createHash('sha512').update(buf).digest('base64')
  return `sha512-${h}`
}

describe.sequential('dlx/binary — downloadBinaryFile', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(path.join(os.tmpdir(), 'dlx-bin-dl-'))
    vi.mocked(httpDownload).mockClear()
  })

  afterEach(async () => {
    // Clear only THIS file's httpDownload mock — not vi.restoreAllMocks(),
    // which under `isolate: false` restores module mocks shared across the
    // worker and tears down (or is torn down by) other files' mocks mid-run,
    // letting the real httpDownload leak through. mockClear (not mockReset)
    // drops call history + the mockImplementationOnce queue while preserving
    // the vi.mock factory's default implementation for the next test.
    vi.mocked(httpDownload).mockClear()
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

  it('uses the download stream integrity without rereading the fresh file', async () => {
    const streamedIntegrity = `sha512-${Buffer.from('stream-digest').toString('base64')}`
    vi.mocked(httpDownload).mockImplementationOnce(async (_url, destPath) => {
      writeFileSync(destPath, Buffer.from('different-on-disk-payload'))
      return {
        ...mockDownloadResult(destPath),
        integrity: streamedIntegrity,
      }
    })
    const destPath = path.join(testDir, 'streamed-integrity')
    const result = await downloadBinaryFile('https://example.com/x', destPath)
    expect(result).toBe(streamedIntegrity)
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
      return mockDownloadResult(destPath, payload)
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
      return mockDownloadResult(destPath, payload)
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
    expect(args[2]).toEqual({
      createWriteStream: undefined,
      integrity: undefined,
      sha256: 'a'.repeat(64),
    })
  })

  it('passes the injected write stream through to httpDownload', async () => {
    const destPath = path.join(testDir, 'with-custom-stream')
    const createWriteStream =
      vi.fn() as unknown as HttpDownloadWriteStreamFactory
    await downloadBinaryFile(
      'https://example.com/x',
      destPath,
      undefined,
      undefined,
      createWriteStream,
    )
    expect(vi.mocked(httpDownload).mock.calls[0]![2]?.createWriteStream).toBe(
      createWriteStream,
    )
  })

  it('verifies sha256 on cached file and accepts a matching hash', async () => {
    const payload = Buffer.from('cached-payload')
    const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
    const destPath = path.join(testDir, 'cached-ok')
    writeFileSync(destPath, payload)
    const result = await downloadBinaryFile(
      'https://example.com/x',
      destPath,
      undefined,
      sha256,
    )
    expect(result.startsWith('sha512-')).toBe(true)
    expect(httpDownload).not.toHaveBeenCalled()
  })

  it('throws SHA-256 mismatch on cached file and removes the bad file', async () => {
    const payload = Buffer.from('cached-bad')
    const destPath = path.join(testDir, 'cached-mismatch')
    writeFileSync(destPath, payload)
    const wrongSha256 = 'f'.repeat(64)
    await expect(
      downloadBinaryFile(
        'https://example.com/x',
        destPath,
        undefined,
        wrongSha256,
      ),
    ).rejects.toThrow(/SHA-256 mismatch/)
    expect(existsSync(destPath)).toBe(false)
  })
})
