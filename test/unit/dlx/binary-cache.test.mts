import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  cleanDlxCache,
  getBinaryCacheMetadataPath,
  getDlxCachePath,
  isBinaryCacheValid,
  listDlxCache,
  readBinaryCacheMetadata,
  writeBinaryCacheMetadata,
} from '../../../src/dlx/binary-cache'

let tmpRoot: string

function writeMeta(entryPath: string, meta: unknown): void {
  mkdirSync(entryPath, { recursive: true })
  writeFileSync(
    path.join(entryPath, '.dlx-metadata.json'),
    JSON.stringify(meta),
  )
}

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'dlx-cache-test-'))
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
})

describe.sequential('dlx/binary-cache — getBinaryCacheMetadataPath', () => {
  test('joins entry path + .dlx-metadata.json', () => {
    expect(getBinaryCacheMetadataPath('/cache/entry-abc')).toBe(
      path.join('/cache/entry-abc', '.dlx-metadata.json'),
    )
  })

  test('handles trailing slash on entry path', () => {
    expect(getBinaryCacheMetadataPath('/cache/entry-abc/')).toContain(
      '.dlx-metadata.json',
    )
  })
})

describe.sequential('dlx/binary-cache — isBinaryCacheValid', () => {
  const ONE_HOUR = 60 * 60 * 1000

  test('returns false when entry directory has no metadata file', async () => {
    const entryPath = path.join(tmpRoot, 'entry-without-meta')
    mkdirSync(entryPath, { recursive: true })
    expect(await isBinaryCacheValid(entryPath, ONE_HOUR)).toBe(false)
  })

  test('returns false when metadata is not a plain object', async () => {
    const entryPath = path.join(tmpRoot, 'entry-bad')
    writeMeta(entryPath, [1, 2, 3])
    expect(await isBinaryCacheValid(entryPath, ONE_HOUR)).toBe(false)
  })

  test('returns false when timestamp is missing', async () => {
    const entryPath = path.join(tmpRoot, 'entry-no-ts')
    writeMeta(entryPath, { integrity: 'sha512-x==' })
    expect(await isBinaryCacheValid(entryPath, ONE_HOUR)).toBe(false)
  })

  test('returns false when timestamp is the wrong type', async () => {
    const entryPath = path.join(tmpRoot, 'entry-wrong-ts')
    writeMeta(entryPath, { timestamp: 'yesterday' })
    expect(await isBinaryCacheValid(entryPath, ONE_HOUR)).toBe(false)
  })

  test('returns false when timestamp is zero or negative', async () => {
    const a = path.join(tmpRoot, 'entry-zero')
    writeMeta(a, { timestamp: 0 })
    expect(await isBinaryCacheValid(a, ONE_HOUR)).toBe(false)

    const b = path.join(tmpRoot, 'entry-negative')
    writeMeta(b, { timestamp: -1 })
    expect(await isBinaryCacheValid(b, ONE_HOUR)).toBe(false)
  })

  test('returns false when timestamp is in the future (clock skew)', async () => {
    const entryPath = path.join(tmpRoot, 'entry-future')
    writeMeta(entryPath, { timestamp: Date.now() + 10 * ONE_HOUR })
    expect(await isBinaryCacheValid(entryPath, ONE_HOUR)).toBe(false)
  })

  test('returns true when timestamp is recent and within TTL', async () => {
    const entryPath = path.join(tmpRoot, 'entry-fresh')
    writeMeta(entryPath, { timestamp: Date.now() - 60_000 })
    expect(await isBinaryCacheValid(entryPath, ONE_HOUR)).toBe(true)
  })

  test('returns false when age exceeds TTL', async () => {
    const entryPath = path.join(tmpRoot, 'entry-stale')
    writeMeta(entryPath, { timestamp: Date.now() - 2 * ONE_HOUR })
    expect(await isBinaryCacheValid(entryPath, ONE_HOUR)).toBe(false)
  })
})

describe.sequential('dlx/binary-cache — readBinaryCacheMetadata', () => {
  test('returns undefined when metadata file does not exist', async () => {
    const entryPath = path.join(tmpRoot, 'no-such-entry')
    mkdirSync(entryPath, { recursive: true })
    expect(await readBinaryCacheMetadata(entryPath)).toBeUndefined()
  })

  test('returns undefined when metadata file holds non-object JSON', async () => {
    const entryPath = path.join(tmpRoot, 'array-meta')
    writeMeta(entryPath, [1, 2, 3])
    expect(await readBinaryCacheMetadata(entryPath)).toBeUndefined()
  })

  test('returns the parsed metadata when file is valid', async () => {
    const entryPath = path.join(tmpRoot, 'good-entry')
    const meta = {
      timestamp: 1_700_000_000_000,
      integrity: 'sha512-fake==',
      binaryFile: 'tool',
    }
    writeMeta(entryPath, meta)
    expect(await readBinaryCacheMetadata(entryPath)).toEqual(meta)
  })

  test('round-trips through writeBinaryCacheMetadata', async () => {
    const entryPath = path.join(tmpRoot, 'rt-entry')
    mkdirSync(entryPath, { recursive: true })
    await writeBinaryCacheMetadata(
      entryPath,
      'rt-cache-key',
      'https://example.com/tool.tar.gz',
      'sha512-rt==',
      12345,
    )
    const read = (await readBinaryCacheMetadata(entryPath)) as {
      version: string
      cache_key: string
      integrity: string
      size: number
      source: { type: string; url: string }
      timestamp: number
    }
    expect(read.version).toBe('1.0.0')
    expect(read.cache_key).toBe('rt-cache-key')
    expect(read.integrity).toBe('sha512-rt==')
    expect(read.size).toBe(12345)
    expect(read.source).toEqual({
      type: 'download',
      url: 'https://example.com/tool.tar.gz',
    })
    expect(typeof read.timestamp).toBe('number')
  })

  test('returns undefined when metadata file contains invalid JSON', async () => {
    const entryPath = path.join(tmpRoot, 'bad-json')
    mkdirSync(entryPath, { recursive: true })
    writeFileSync(path.join(entryPath, '.dlx-metadata.json'), '{not json')
    expect(await readBinaryCacheMetadata(entryPath)).toBeUndefined()
  })

  test('returns undefined when metadata is JSON but not a plain object', async () => {
    const entryPath = path.join(tmpRoot, 'arr-meta')
    writeMeta(entryPath, ['not', 'an', 'object'])
    expect(await readBinaryCacheMetadata(entryPath)).toBeUndefined()
  })
})

describe.sequential('dlx/binary-cache — cleanDlxCache + listDlxCache', () => {
  // These exercise the global dlx dir (`getDlxCachePath()`), which lives
  // under $HOME/.socket/_dlx. We use stubEnv to point HOME → tmpRoot so
  // the global helpers operate against an isolated tree.
  function withMockHome<T>(fn: () => T): T {
    const originalHome = process.env['HOME']
    process.env['HOME'] = tmpRoot
    try {
      return fn()
    } finally {
      if (originalHome === undefined) {
        delete process.env['HOME']
      } else {
        process.env['HOME'] = originalHome
      }
    }
  }

  test('returns 0 when the cache dir does not exist', async () => {
    await withMockHome(async () => {
      // Fresh tmp HOME → no .socket/_dlx dir yet.
      const cleaned = await cleanDlxCache()
      expect(cleaned).toBe(0)
    })
  })

  test('listDlxCache returns [] when the cache dir does not exist', async () => {
    await withMockHome(async () => {
      const entries = await listDlxCache()
      expect(entries).toEqual([])
    })
  })

  test('cleanDlxCache removes expired entries based on metadata timestamp', async () => {
    await withMockHome(async () => {
      const cachePath = getDlxCachePath()
      const entryPath = path.join(cachePath, 'expired-entry')
      mkdirSync(entryPath, { recursive: true })
      // Old timestamp → far in the past.
      writeFileSync(
        path.join(entryPath, '.dlx-metadata.json'),
        JSON.stringify({ timestamp: 1 }),
      )
      // maxAge=0 means any age is expired.
      const cleaned = await cleanDlxCache(0)
      expect(cleaned).toBe(1)
    })
  })

  test('cleanDlxCache keeps fresh entries', async () => {
    await withMockHome(async () => {
      const cachePath = getDlxCachePath()
      const entryPath = path.join(cachePath, 'fresh-entry')
      mkdirSync(entryPath, { recursive: true })
      writeFileSync(
        path.join(entryPath, '.dlx-metadata.json'),
        JSON.stringify({ timestamp: Date.now() }),
      )
      const cleaned = await cleanDlxCache(60 * 60 * 1000) // 1h TTL
      expect(cleaned).toBe(0)
    })
  })

  test('cleanDlxCache catch-arm: cleans up an empty entry dir with no metadata', async () => {
    await withMockHome(async () => {
      const cachePath = getDlxCachePath()
      const entryPath = path.join(cachePath, 'empty-no-meta')
      mkdirSync(entryPath, { recursive: true })
      // No metadata file → readJson throws (caught) → fallback inspects
      // empty dir → removes it.
      const cleaned = await cleanDlxCache(0)
      expect(cleaned).toBe(1)
    })
  })

  test('cleanDlxCache catch-arm: keeps a non-empty dir even when metadata is missing', async () => {
    await withMockHome(async () => {
      const cachePath = getDlxCachePath()
      const entryPath = path.join(cachePath, 'non-empty-no-meta')
      mkdirSync(entryPath, { recursive: true })
      // Add a stray file (no metadata.json) so the inner cleanup branch
      // sees a non-empty dir → it must NOT remove the entry.
      writeFileSync(path.join(entryPath, 'binary.exe'), 'mz...')
      const cleaned = await cleanDlxCache(0)
      // entry kept; cleaned counts dirs actually removed.
      expect(cleaned).toBe(0)
    })
  })

  test('cleanDlxCache: skips entries that disappear between readdir and existsSync', async () => {
    await withMockHome(async () => {
      const cachePath = getDlxCachePath()
      // Create dir, then immediately delete to mimic the race.
      const entryPath = path.join(cachePath, 'race-entry')
      mkdirSync(entryPath, { recursive: true })
      rmSync(entryPath, { force: true, recursive: true })
      // existsSync now returns false → continue (line 216).
      const cleaned = await cleanDlxCache(0)
      expect(cleaned).toBe(0)
    })
  })
})
