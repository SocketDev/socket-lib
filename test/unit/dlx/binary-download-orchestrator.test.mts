import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type * as BinaryCacheModule from '../../../src/dlx/binary-cache'
import type * as FsSafeModule from '../../../src/fs/safe'
import type { processLock as ProcessLockType } from '../../../src/process/lock-instance'

vi.mock(import('../../../src/http-request/download'), () => ({
  httpDownload: vi.fn(),
}))
vi.mock(import('../../../src/process/lock-instance'), () => ({
  processLock: {
    withLock: vi.fn(async (_lockPath: string, fn: () => Promise<unknown>) =>
      fn(),
    ),
  } as unknown as typeof ProcessLockType,
}))
vi.mock(import('../../../src/dlx/binary-cache'), async () => {
  const actual = await vi.importActual<typeof BinaryCacheModule>(
    '../../../src/dlx/binary-cache',
  )
  return { ...actual, getDlxCachePath: vi.fn() }
})

const IS_WIN = os.platform() === 'win32'

let tmpRoot: string

async function loadFresh() {
  const httpMod = await import('../../../src/http-request/download')
  const bcMod = await import('../../../src/dlx/binary-cache')
  ;(bcMod.getDlxCachePath as ReturnType<typeof vi.fn>).mockReturnValue(tmpRoot)
  const mod = await import('../../../src/dlx/binary-download')
  const cacheMod = await import('../../../src/dlx/cache')
  return {
    httpDownload: httpMod.httpDownload as ReturnType<typeof vi.fn>,
    downloadBinary: mod.downloadBinary,
    generateCacheKey: cacheMod.generateCacheKey,
  }
}

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'binary-download-orch-test-'))
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
  vi.clearAllMocks()
})

describe.sequential('dlx/binary-download — downloadBinary cache hit', () => {
  test('reuses a valid cached binary and reads integrity from metadata', async () => {
    const { downloadBinary, generateCacheKey, httpDownload } = await loadFresh()
    const url = 'https://example.com/tool-xyz'
    const name = 'mytool'
    const cacheKey = generateCacheKey(`${url}:${name}`)
    const cacheEntryDir = path.join(tmpRoot, cacheKey)
    mkdirSync(cacheEntryDir, { recursive: true })
    writeFileSync(path.join(cacheEntryDir, name), 'cached-bytes')
    writeFileSync(
      path.join(cacheEntryDir, '.dlx-metadata.json'),
      JSON.stringify({
        version: '1.0.0',
        cache_key: cacheKey,
        timestamp: Date.now(),
        integrity: 'sha512-cachedintegrity==',
        size: 12,
        source: { type: 'download', url },
      }),
    )
    const result = await downloadBinary({ url, name })
    expect(result.downloaded).toBe(false)
    expect(result.integrity).toBe('sha512-cachedintegrity==')
    expect(httpDownload).not.toHaveBeenCalled()
  })

  test('falls back to recomputing integrity from disk when metadata lacks integrity', async () => {
    const { downloadBinary, generateCacheKey, httpDownload } = await loadFresh()
    const url = 'https://example.com/tool-no-meta'
    const name = 'mytool'
    const cacheKey = generateCacheKey(`${url}:${name}`)
    const cacheEntryDir = path.join(tmpRoot, cacheKey)
    mkdirSync(cacheEntryDir, { recursive: true })
    writeFileSync(path.join(cacheEntryDir, name), 'cached-bytes')
    writeFileSync(
      path.join(cacheEntryDir, '.dlx-metadata.json'),
      JSON.stringify({
        version: '1.0.0',
        cache_key: cacheKey,
        timestamp: Date.now(),
        size: 12,
      }),
    )
    const result = await downloadBinary({ url, name })
    expect(result.downloaded).toBe(false)
    expect(result.integrity).toMatch(/^sha512-/)
    expect(httpDownload).not.toHaveBeenCalled()
  })
})

describe.sequential('dlx/binary-download — downloadBinary fresh download', () => {
  test('downloads, writes cache metadata, returns downloaded: true', async () => {
    const { downloadBinary, httpDownload } = await loadFresh()
    httpDownload.mockImplementationOnce(async (_url: string, p: string) => {
      writeFileSync(p, 'new-bytes')
      return { path: p, size: 9 }
    })
    const result = await downloadBinary({
      url: 'https://example.com/tool',
      name: 'mytool',
    })
    expect(result.downloaded).toBe(true)
    expect(result.integrity).toMatch(/^sha512-/)
    const cacheEntryDir = path.dirname(result.binaryPath)
    const metaPath = path.join(cacheEntryDir, '.dlx-metadata.json')
    expect(statSync(metaPath).isFile()).toBe(true)
    if (!IS_WIN) {
      expect(statSync(result.binaryPath).mode & 0o777).toBe(0o755)
    }
  })

  test('force: true bypasses cache validation (downloaded: true even with valid cache)', async () => {
    const { downloadBinary, generateCacheKey, httpDownload } = await loadFresh()
    const url = 'https://example.com/tool-force'
    const name = 'mytool'
    const cacheKey = generateCacheKey(`${url}:${name}`)
    const cacheEntryDir = path.join(tmpRoot, cacheKey)
    mkdirSync(cacheEntryDir, { recursive: true })
    // No pre-existing file — force=true takes the download path; the
    // mocked httpDownload writes the file.
    httpDownload.mockImplementationOnce(async (_url: string, p: string) => {
      writeFileSync(p, 'fresh-bytes')
      return { path: p, size: 11 }
    })
    const result = await downloadBinary({ url, name, force: true })
    expect(result.downloaded).toBe(true)
    expect(httpDownload).toHaveBeenCalled()
  })

  test('expired cache (TTL exceeded) is treated as invalid and triggers fresh-path', async () => {
    const { downloadBinary, generateCacheKey, httpDownload } = await loadFresh()
    const url = 'https://example.com/tool-ttl'
    const name = 'mytool'
    const cacheKey = generateCacheKey(`${url}:${name}`)
    const cacheEntryDir = path.join(tmpRoot, cacheKey)
    // Pre-make the dir + ancient metadata so isBinaryCacheValid() returns false.
    mkdirSync(cacheEntryDir, { recursive: true })
    writeFileSync(
      path.join(cacheEntryDir, '.dlx-metadata.json'),
      JSON.stringify({
        version: '1.0.0',
        cache_key: cacheKey,
        timestamp: 1_700_000_000_000,
        integrity: 'sha512-stale==',
        size: 11,
      }),
    )
    httpDownload.mockImplementationOnce(async (_url: string, p: string) => {
      writeFileSync(p, 'fresh-bytes')
      return { path: p, size: 11 }
    })
    const result = await downloadBinary({ url, name, cacheTtl: 1000 })
    expect(result.downloaded).toBe(true)
    expect(httpDownload).toHaveBeenCalled()
  })

  test('hash: { type: "integrity", value } normalizes to integrity pin', async () => {
    const { downloadBinary, httpDownload } = await loadFresh()
    httpDownload.mockImplementationOnce(async (_url: string, p: string) => {
      writeFileSync(p, 'bytes')
      return { path: p, size: 5 }
    })
    const fake = 'sha512-' + 'B'.repeat(86) + '=='
    await expect(
      downloadBinary({
        url: 'https://example.com/tool-hash',
        name: 'mytool',
        hash: { type: 'integrity', value: fake },
      }),
    ).rejects.toThrow(/Integrity mismatch/)
  })

  test('hash: { type: "checksum", value } normalizes to sha256 pin', async () => {
    const { downloadBinary, httpDownload } = await loadFresh()
    httpDownload.mockImplementationOnce(async (_url: string, p: string) => {
      writeFileSync(p, 'bytes')
      return { path: p, size: 5 }
    })
    const sha256 = 'a'.repeat(64)
    await downloadBinary({
      url: 'https://example.com/tool-csum',
      name: 'mytool',
      hash: { type: 'checksum', value: sha256 },
    })
    // Inline sha256 verification is delegated to httpDownload — assert
    // sha256 was forwarded in its opts.
    const [, , opts] = httpDownload.mock.calls[0]!
    expect((opts as { sha256?: string | undefined } | undefined)?.sha256).toBe(
      sha256,
    )
  })

  test('uses platform-default binary name when none provided', async () => {
    const { downloadBinary, httpDownload } = await loadFresh()
    httpDownload.mockImplementationOnce(async (_url: string, p: string) => {
      writeFileSync(p, 'bytes')
      return { path: p, size: 5 }
    })
    const result = await downloadBinary({
      url: 'https://example.com/no-name',
    })
    expect(result.binaryPath).toMatch(/binary-[a-z0-9]+-[a-z0-9]+$/)
  })
})

describe.sequential('dlx/binary-download — mkdir failure wrapping', () => {
  // These tests need a fresh-mocked safeMkdir per test; isolate via
  // resetModules + doMock + unmock to avoid leaking into siblings.
  async function loadWithMkdirError(code: string | undefined) {
    vi.resetModules()
    vi.doMock(import('../../../src/fs/safe'), async () => {
      const actual = await vi.importActual<typeof FsSafeModule>(
        '../../../src/fs/safe',
      )
      const err = new Error(code ?? 'generic')
      if (code) {
        Object.assign(err, { code })
      }
      return { ...actual, safeMkdir: vi.fn().mockRejectedValue(err) }
    })
    const bcMod = await import('../../../src/dlx/binary-cache')
    ;(bcMod.getDlxCachePath as ReturnType<typeof vi.fn>).mockReturnValue(
      tmpRoot,
    )
    const mod = await import('../../../src/dlx/binary-download')
    return { downloadBinary: mod.downloadBinary }
  }

  afterEach(() => {
    vi.doUnmock(import('../../../src/fs/safe'))
  })

  test('wraps EACCES with a permission-denied message', async () => {
    const { downloadBinary } = await loadWithMkdirError('EACCES')
    await expect(
      downloadBinary({ url: 'https://example.com/tool', name: 'tool' }),
    ).rejects.toThrow(/Permission denied creating binary cache directory/)
  })

  test('wraps EPERM with a permission-denied message', async () => {
    const { downloadBinary } = await loadWithMkdirError('EPERM')
    await expect(
      downloadBinary({ url: 'https://example.com/tool', name: 'tool' }),
    ).rejects.toThrow(/Permission denied/)
  })

  test('wraps EROFS with a read-only-filesystem message', async () => {
    const { downloadBinary } = await loadWithMkdirError('EROFS')
    await expect(
      downloadBinary({ url: 'https://example.com/tool', name: 'tool' }),
    ).rejects.toThrow(/read-only filesystem/)
  })

  test('wraps unknown errors with a generic "Failed to create" message', async () => {
    const { downloadBinary } = await loadWithMkdirError(undefined)
    await expect(
      downloadBinary({ url: 'https://example.com/tool', name: 'tool' }),
    ).rejects.toThrow(/Failed to create binary cache directory/)
  })
})
