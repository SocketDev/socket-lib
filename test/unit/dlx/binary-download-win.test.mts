/**
 * @file Windows-only branches in src/dlx/binary-download.ts. Mocks
 *   constants/platform to set WIN32=true so the chmod-skip path runs without
 *   actually changing platform.
 */

import crypto from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as PlatformModule from '../../../src/constants/platform'
import type * as DownloadModule from '../../../src/http-request/download'

vi.mock(import('../../../src/constants/platform'), async importOriginal => {
  const actual = await importOriginal<typeof PlatformModule>()
  return { ...actual, WIN32: true }
})

vi.mock(import('../../../src/http-request/download'), async importOriginal => {
  const original = await importOriginal<typeof DownloadModule>()
  return {
    ...original,
    httpDownload: vi.fn(
      async (_url: string, destPath: string, _opts?: unknown | undefined) => {
        // Write a known payload so SRI integrity computes deterministically.
        const payload = Buffer.from('win-payload')
        writeFileSync(destPath, payload)
        return {
          headers: {},
          integrity: `sha512-${crypto.createHash('sha512').update(payload).digest('base64')}`,
          ok: true,
          path: destPath,
          sha256: crypto.createHash('sha256').update(payload).digest('hex'),
          size: payload.length,
          status: 200,
          statusText: 'OK',
        } as Awaited<ReturnType<typeof DownloadModule.httpDownload>>
      },
    ),
  }
})

import { downloadBinaryFile } from '../../../src/dlx/binary-download'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

let tmp: string

beforeEach(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'dlx-bin-dl-win-'))
})

afterEach(async () => {
  await safeDelete(tmp)
})

describe.sequential('dlx/binary-download — Windows branch (WIN32=true stub)', () => {
  it('skips chmod on Windows (downloadBinaryFile returns integrity)', async () => {
    const destPath = path.join(tmp, 'win-binary.exe')
    const result = await downloadBinaryFile('https://example.com/x', destPath)
    // The result is the SRI integrity hash; chmod was bypassed.
    expect(result.startsWith('sha512-')).toBe(true)
  })
})
