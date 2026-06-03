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
      12_345,
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
    expect(read.size).toBe(12_345)
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
  // These exercise the global dlx dir (`getDlxCachePath()`). Point
  // SOCKET_DLX_DIR — the FIRST override getSocketDlxDir() honors — at a fresh
  // path under tmpRoot. HOME alone is not enough: getSocketDlxDir checks
  // SOCKET_DLX_DIR before homedir, and under `isolate: false` a concurrent
  // test in the same worker can leave SOCKET_DLX_DIR set, redirecting these
  // helpers to the wrong (or the real ~/.socket/_dlx) tree. Owning the env var
  // here makes the sandbox deterministic regardless of sibling tests.
  function withMockHome<T>(fn: () => T): T {
    const originalDlxDir = process.env['SOCKET_DLX_DIR']
    const originalHome = process.env['HOME']
    process.env['HOME'] = tmpRoot
    process.env['SOCKET_DLX_DIR'] = path.join(tmpRoot, '.socket', '_dlx')
    try {
      return fn()
    } finally {
      if (originalHome === undefined) {
        delete process.env['HOME']
      } else {
        process.env['HOME'] = originalHome
      }
      if (originalDlxDir === undefined) {
        delete process.env['SOCKET_DLX_DIR']
      } else {
        process.env['SOCKET_DLX_DIR'] = originalDlxDir
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

  test('listDlxCache returns entries with metadata', async () => {
    await withMockHome(async () => {
      const cachePath = getDlxCachePath()
      const entryPath = path.join(cachePath, 'listed-entry')
      mkdirSync(entryPath, { recursive: true })
      writeFileSync(path.join(entryPath, 'some-bin'), 'x'.repeat(42))
      writeFileSync(
        path.join(entryPath, '.dlx-metadata.json'),
        JSON.stringify({
          timestamp: Date.now() - 5000,
          integrity: 'sha512-abc',
          url: 'https://example.com/bin',
        }),
      )
      const entries = await listDlxCache()
      const listed = entries.find(e => e.name === 'some-bin')
      expect(listed).toBeDefined()
      expect(listed?.integrity).toBe('sha512-abc')
      expect(listed?.url).toBe('https://example.com/bin')
      expect(listed?.size).toBeGreaterThan(0)
      expect(listed?.age).toBeGreaterThanOrEqual(0)
    })
  })

  test('readBinaryCacheMetadata returns undefined when getNodeFs().existsSync throws', async () => {
    // Spy on getNodeFs() so the next existsSync call throws — exercises the
    // outer try/catch in readBinaryCacheMetadata (L289-291).
    const { getNodeFs } = await import('../../../src/node/fs')
    const realFs = getNodeFs()
    const origExists = realFs.existsSync
    ;(realFs as { existsSync: typeof realFs.existsSync }).existsSync = (() => {
      throw new Error('synthetic existsSync failure')
    }) as typeof realFs.existsSync
    try {
      expect(
        await readBinaryCacheMetadata(path.join(tmpRoot, 'unreadable')),
      ).toBeUndefined()
    } finally {
      ;(realFs as { existsSync: typeof realFs.existsSync }).existsSync =
        origExists
    }
  })

  test('isBinaryCacheValid returns false when getNodeFs().existsSync throws', async () => {
    const { getNodeFs } = await import('../../../src/node/fs')
    const realFs = getNodeFs()
    const origExists = realFs.existsSync
    ;(realFs as { existsSync: typeof realFs.existsSync }).existsSync = (() => {
      throw new Error('synthetic existsSync failure')
    }) as typeof realFs.existsSync
    try {
      expect(
        await isBinaryCacheValid(
          path.join(tmpRoot, 'unreadable-valid'),
          60 * 60 * 1000,
        ),
      ).toBe(false)
    } finally {
      ;(realFs as { existsSync: typeof realFs.existsSync }).existsSync =
        origExists
    }
  })
})
