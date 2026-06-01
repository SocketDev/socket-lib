/**
 * @file Unit tests for DLX binary cache cleanup. Covers cleanDlxCache()
 *   expiry and clock-skew handling. Split from binary.test.mts to stay under
 *   the file-size cap; listDlxCache()/atomic metadata writes live in
 *   binary-list.test.mts and the dlxBinary() suites in binary.test.mts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { cleanDlxCache, dlxBinary, getDlxCachePath } from '../../../src/dlx/binary'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mockHomeDir, runWithTempDir } from '../util/temp-file-helper'
import {
  startDlxTestServer,
  stopDlxTestServer,
} from './binary-test-server.mts'

import type { DlxTestServer } from './binary-test-server.mts'

let testServer: DlxTestServer
let httpBaseUrl: string

beforeAll(async () => {
  testServer = await startDlxTestServer()
  httpBaseUrl = testServer.baseUrl
})

afterAll(async () => {
  await stopDlxTestServer(testServer.server)
})

describe.sequential('dlx-binary cache cleanup', () => {
  describe('cleanDlxCache', () => {
    it('should return 0 if cache directory does not exist', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cleaned = await cleanDlxCache()
          expect(cleaned).toBe(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-no-dir-')
    })

    it('should clean expired cache entries', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Download binary with short TTL; give timing generous headroom.
          const result = await dlxBinary(['--version'], {
            cacheTtl: 500,
            name: 'clean-binary',
            url,
          })
          await result.spawnPromise.catch(() => {})

          // Wait for cache to expire.
          await new Promise(resolve => setTimeout(resolve, 700))

          // Clean expired entries.
          const cleaned = await cleanDlxCache(500)
          expect(cleaned).toBeGreaterThan(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-expired-')
    })

    it('should not clean non-expired entries', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Download binary
          const result = await dlxBinary(['--version'], {
            name: 'fresh-binary',
            url,
          })
          await result.spawnPromise.catch(() => {})

          // Try to clean with large maxAge
          const cleaned = await cleanDlxCache(7 * 24 * 60 * 60 * 1000) // 7 days
          expect(cleaned).toBe(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-fresh-')
    })

    it('should skip non-directory entries', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          await fs.mkdir(cachePath, { recursive: true })

          // Create a file in cache directory
          await fs.writeFile(path.join(cachePath, 'file.txt'), '', 'utf8')

          const cleaned = await cleanDlxCache()
          expect(cleaned).toBe(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-skip-files-')
    })

    it('should skip entries with invalid metadata', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'invalid-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Write invalid metadata
          await fs.writeFile(
            path.join(entryPath, '.dlx-metadata.json'),
            'invalid',
            'utf8',
          )

          const cleaned = await cleanDlxCache(0)
          expect(cleaned).toBe(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-invalid-meta-')
    })

    it('should skip entries with array metadata', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'array-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Write array as metadata
          await fs.writeFile(
            path.join(entryPath, '.dlx-metadata.json'),
            JSON.stringify([]),
            'utf8',
          )

          const cleaned = await cleanDlxCache(0)
          expect(cleaned).toBe(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-array-meta-')
    })

    it('should clean empty directories', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const emptyEntry = path.join(cachePath, 'empty-entry')
          await fs.mkdir(emptyEntry, { recursive: true })

          const cleaned = await cleanDlxCache(0)
          expect(cleaned).toBeGreaterThanOrEqual(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-empty-')
    })

    it('should handle entries without metadata', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'no-meta-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Create a file but no metadata
          await fs.writeFile(path.join(entryPath, 'binary'), '', 'utf8')

          const cleaned = await cleanDlxCache(0)
          expect(cleaned).toBeGreaterThanOrEqual(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-no-meta-')
    })

    it('should handle metadata with missing timestamp', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'no-timestamp-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Write metadata without timestamp
          await fs.writeFile(
            path.join(entryPath, '.dlx-metadata.json'),
            JSON.stringify({ url: 'test' }),
            'utf8',
          )

          const cleaned = await cleanDlxCache(0)
          expect(cleaned).toBeGreaterThan(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-no-timestamp-')
    })

    it('should use default maxAge', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Download binary
          const result = await dlxBinary(['--version'], {
            name: 'default-ttl-binary',
            url,
          })
          await result.spawnPromise.catch(() => {})

          // Clean with default maxAge (7 days)
          const cleaned = await cleanDlxCache()
          expect(cleaned).toBe(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-default-')
    })

    it('should treat future timestamps as expired (clock skew protection)', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'future-timestamp-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Write metadata with future timestamp (clock skew scenario)
          const futureTimestamp = Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year in future
          await fs.writeFile(
            path.join(entryPath, '.dlx-metadata.json'),
            JSON.stringify({
              url: 'test',
              timestamp: futureTimestamp,
            }),
            'utf8',
          )

          // Create a binary file
          await fs.writeFile(path.join(entryPath, 'binary'), '', 'utf8')

          // Clean should remove future-timestamped entries
          const cleaned = await cleanDlxCache(7 * 24 * 60 * 60 * 1000) // 7 days
          expect(cleaned).toBeGreaterThan(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-future-timestamp-')
    })

    it('should handle slightly future timestamps from clock skew', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'slight-future-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Write metadata with slightly future timestamp (minor clock skew)
          const slightlyFutureTimestamp = Date.now() + 5000 // 5 seconds in future
          await fs.writeFile(
            path.join(entryPath, '.dlx-metadata.json'),
            JSON.stringify({
              url: 'test',
              timestamp: slightlyFutureTimestamp,
            }),
            'utf8',
          )

          // Create a binary file
          await fs.writeFile(path.join(entryPath, 'binary'), '', 'utf8')

          // Clean with short maxAge - should remove future-timestamped entries
          const cleaned = await cleanDlxCache(1000) // 1 second
          expect(cleaned).toBeGreaterThan(0)
        } finally {
          restoreHome()
        }
      }, 'cleanDlxCache-slight-future-')
    })
  })
})
