import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  getBinaryCacheMetadataPath,
  isBinaryCacheValid,
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
})
