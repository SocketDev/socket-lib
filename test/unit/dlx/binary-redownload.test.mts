/**
 * @file Unit tests for DLX binary cache re-validation and edge cases. Covers
 *   dlxBinary() re-downloading when cached metadata is invalid/missing, plus
 *   concurrent download, directory creation, empty args, and path
 *   normalization. Split from binary.test.mts to stay under the file-size cap;
 *   the core download/option suites live there.
 */

import crypto from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

import {
  dlxBinary,
  getDlxCachePath,
} from '../../../src/dlx/binary'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mockHomeDir, runWithTempDir } from '../util/temp-file-helper'
import { safeDelete } from '../../../src/fs/safe'
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

describe.sequential('dlx-binary re-validation', () => {
  describe('cache metadata re-download', () => {
    it('should re-download if metadata is invalid', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // First download
          const result1 = await dlxBinary(['--version'], {
            name: 'invalid-meta-binary',
            url,
          })
          await result1.spawnPromise.catch(() => {})

          // Corrupt metadata
          const name = 'invalid-meta-binary'
          const spec = `${url}:${name}`
          const cacheKey = crypto
            .createHash('sha512')
            .update(spec)
            .digest('hex')
            .substring(0, 16)
          const cachePath = getDlxCachePath()
          const metaPath = path.join(cachePath, cacheKey, '.dlx-metadata.json')
          await fs.writeFile(metaPath, 'invalid json', 'utf8')

          // Second call should re-download due to invalid metadata
          const result2 = await dlxBinary(['--version'], {
            name: 'invalid-meta-binary',
            url,
          })

          expect(result2.downloaded).toBe(true)
          await result2.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-invalid-meta-')
    })

    it('should handle missing metadata file', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // First download
          const result1 = await dlxBinary(['--version'], {
            name: 'missing-meta-binary',
            url,
          })
          await result1.spawnPromise.catch(() => {})

          // Delete metadata
          const name = 'missing-meta-binary'
          const spec = `${url}:${name}`
          const cacheKey = crypto
            .createHash('sha512')
            .update(spec)
            .digest('hex')
            .substring(0, 16)
          const cachePath = getDlxCachePath()
          const metaPath = path.join(cachePath, cacheKey, '.dlx-metadata.json')
          await safeDelete(metaPath)

          // Second call should re-download due to missing metadata
          const result = await dlxBinary(['--version'], {
            name: 'missing-meta-binary',
            url,
          })

          expect(result.downloaded).toBe(true)
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-missing-meta-')
    })

    it('should handle metadata with non-object value', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // First download
          const result1 = await dlxBinary(['--version'], {
            name: 'array-meta-binary',
            url,
          })
          await result1.spawnPromise.catch(() => {})

          // Write array as metadata (invalid)
          const name = 'array-meta-binary'
          const spec = `${url}:${name}`
          const cacheKey = crypto
            .createHash('sha512')
            .update(spec)
            .digest('hex')
            .substring(0, 16)
          const cachePath = getDlxCachePath()
          const metaPath = path.join(cachePath, cacheKey, '.dlx-metadata.json')
          await fs.writeFile(metaPath, JSON.stringify([]), 'utf8')

          // Second call should re-download
          const result = await dlxBinary(['--version'], {
            name: 'array-meta-binary',
            url,
          })

          expect(result.downloaded).toBe(true)
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-array-meta-')
    })

    it('should handle metadata with missing integrity', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // First download
          const result1 = await dlxBinary(['--version'], {
            name: 'no-integrity-meta-binary',
            url,
          })
          await result1.spawnPromise.catch(() => {})

          // Write metadata without integrity
          const name = 'no-integrity-meta-binary'
          const spec = `${url}:${name}`
          const cacheKey = crypto
            .createHash('sha512')
            .update(spec)
            .digest('hex')
            .substring(0, 16)
          const cachePath = getDlxCachePath()
          const metaPath = path.join(cachePath, cacheKey, '.dlx-metadata.json')
          await fs.writeFile(
            metaPath,
            JSON.stringify({ timestamp: Date.now() }),
            'utf8',
          )

          // Second call should re-download
          const result = await dlxBinary(['--version'], {
            name: 'no-integrity-meta-binary',
            url,
          })

          expect(result.downloaded).toBe(true)
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-no-integrity-meta-')
    })

    it('should handle metadata read errors during cache validation', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // First download
          const result1 = await dlxBinary(['--version'], {
            name: 'read-error-binary',
            url,
          })
          // Wait for first spawn to complete
          await result1.spawnPromise.catch(() => {})

          // Make metadata unreadable (change permissions)
          const name = 'read-error-binary'
          const spec = `${url}:${name}`
          const cacheKey = crypto
            .createHash('sha512')
            .update(spec)
            .digest('hex')
            .substring(0, 16)
          const cachePath = getDlxCachePath()
          const metaPath = path.join(cachePath, cacheKey, '.dlx-metadata.json')

          // On Windows, we can't easily make files unreadable, so we'll corrupt it instead
          await fs.writeFile(metaPath, Buffer.from([0xff, 0xfe]), 'utf8')

          // Second call should re-download
          const result = await dlxBinary(['--version'], {
            name: 'read-error-binary',
            url,
          })

          expect(result.downloaded).toBe(true)
          // Wait for second spawn to complete
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-read-error-')
    })
  })

  describe('edge cases', () => {
    it('should handle concurrent downloads of same binary', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Download first one to completion
          const result1 = await dlxBinary(['--version'], {
            name: 'concurrent-binary',
            url,
          })
          // Catch spawn promise immediately to prevent unhandled rejection on Windows.
          result1.spawnPromise.catch(() => {})
          expect(result1.downloaded).toBe(true)

          // Second download should use cache
          const result2 = await dlxBinary(['--version'], {
            name: 'concurrent-binary',
            url,
          })
          // Catch spawn promise immediately to prevent unhandled rejection on Windows.
          result2.spawnPromise.catch(() => {})
          expect(result2.downloaded).toBe(false)
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-concurrent-')
    })

    it('should create cache directory if it does not exist', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Cache directory should not exist initially
          const cachePath = getDlxCachePath()
          const exists = existsSync(cachePath)
          expect(exists).toBe(false)

          // Download should create directory
          const result = await dlxBinary(['--version'], {
            name: 'create-dir-binary',
            url,
          })
          await result.spawnPromise.catch(() => {})

          const existsAfter = existsSync(cachePath)
          expect(existsAfter).toBe(true)
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-create-dir-')
    })

    it('should handle download with empty args array', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          const result = await dlxBinary([], {
            name: 'no-args-binary',
            url,
          })

          expect(result.spawnPromise).toBeDefined()
          // Wait for spawn to complete to avoid SIGKILL errors
          await result.spawnPromise.catch(() => {
            // Ignore spawn errors in tests
          })
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-no-args-')
    })

    it('should normalize binary path', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          const result = await dlxBinary(['--version'], {
            name: 'normalized-binary',
            url,
          })

          // Path should not contain backslashes on any platform
          expect(result.binaryPath.includes('\\')).toBe(false)
          // Wait for spawn to complete to avoid SIGKILL errors
          await result.spawnPromise.catch(() => {
            // Ignore spawn errors in tests
          })
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-normalized-')
    })
  })
})
