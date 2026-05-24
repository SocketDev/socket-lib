/**
 * @file Windows-only branches in src/dlx/binary-download.ts. Mocks
 *   constants/platform to set WIN32=true so the chmod-skip path runs without
 *   actually changing platform.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/constants/platform', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../src/constants/platform')>()
  return { ...actual, WIN32: true }
})

vi.mock('../../../src/http-request/download', async importOriginal => {
  const original =
    await importOriginal<typeof import('../../../src/http-request/download')>()
  return {
    ...original,
    httpDownload: vi.fn(
      async (_url: string, destPath: string, _opts?: unknown) => {
        // Write a known payload so SRI integrity computes deterministically.
        writeFileSync(destPath, Buffer.from('win-payload'))
        return { ok: true, status: 200, path: destPath } as unknown as Awaited<
          ReturnType<
            typeof import('../../../src/http-request/download').httpDownload
          >
        >
      },
    ),
  }
})

import { downloadBinaryFile } from '../../../src/dlx/binary-download'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'dlx-bin-dl-win-'))
})

afterEach(() => {
  rmSync(tmp, { force: true, recursive: true })
})

describe('dlx/binary-download — Windows branch (WIN32=true stub)', () => {
  it('skips chmod on Windows (downloadBinaryFile returns integrity)', async () => {
    const destPath = path.join(tmp, 'win-binary.exe')
    const result = await downloadBinaryFile('https://example.com/x', destPath)
    // The result is the SRI integrity hash; chmod was bypassed.
    expect(result.startsWith('sha512-')).toBe(true)
  })
})
