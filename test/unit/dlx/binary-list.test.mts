/**
 * @file Unit tests for DLX binary cache enumeration. Covers atomic metadata
 *   writes and listDlxCache() enumeration. Split from binary.test.mts to stay
 *   under the file-size cap; cleanDlxCache() lives in binary-clean.test.mts and
 *   the dlxBinary() download/execution suites in binary.test.mts.
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

import {
  dlxBinary,
  getDlxCachePath,
  listDlxCache,
} from '../../../src/dlx/binary'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mockHomeDir, runWithTempDir } from '../util/temp-file-helper'
import { safeDelete } from '../../../src/fs/safe'
import { startDlxTestServer, stopDlxTestServer } from './binary-test-server.mts'

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

describe.sequential('dlx-binary cache enumeration', () => {
  describe('metadata writes (atomic operation)', () => {
    it('should write metadata atomically using temp file', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Download binary which writes metadata
          const result = await dlxBinary(['--version'], {
            name: 'atomic-write-binary',
            url,
          })
          await result.spawnPromise.catch(() => {})

          // Verify metadata was written successfully
          const cachePath = getDlxCachePath()
          const entries = await fs.readdir(cachePath)
          expect(entries.length).toBeGreaterThan(0)

          // Find the entry directory
          for (const entry of entries) {
            const entryPath = path.join(cachePath, entry)
            // oxlint-disable-next-line socket/prefer-exists-sync -- needs the Stats object to call isDirectory(), not a mere existence check.
            const stat = await fs.stat(entryPath)
            if (stat.isDirectory()) {
              const metadataPath = path.join(entryPath, '.dlx-metadata.json')
              const metadataExists = existsSync(metadataPath)

              if (metadataExists) {
                // Verify metadata is valid JSON
                const metadataContent = await fs.readFile(metadataPath, 'utf8')
                const metadata = JSON.parse(metadataContent)
                expect(metadata).toBeDefined()
                expect(metadata.timestamp).toBeDefined()
                expect(metadata.source?.url).toBe(url)

                // Verify no temp files left behind
                const tempFiles = entries.filter(file => file.includes('.tmp.'))
                expect(tempFiles).toHaveLength(0)
              }
            }
          }
        } finally {
          restoreHome()
        }
      }, 'atomic-write-metadata-')
    })
  })

  describe('listDlxCache', () => {
    it('should return empty array if cache directory does not exist', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const list = await listDlxCache()
          expect(list).toEqual([])
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-no-dir-')
    })

    it('should list cached binaries', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Download binary
          const result = await dlxBinary(['--version'], {
            name: 'list-binary',
            url,
          })
          await result.spawnPromise.catch(() => {})

          const list = await listDlxCache()
          expect(list.length).toBeGreaterThan(0)

          const entry = list[0]!
          expect(entry.name).toBe('list-binary')
          expect(entry.url).toBe(url)
          expect(entry.integrity).toBeDefined()
          expect(entry.integrity).toMatch(/^sha512-/)
          expect(entry.size).toBeGreaterThan(0)
          expect(entry.age).toBeGreaterThanOrEqual(0)
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-basic-')
    })

    it('should skip non-directory entries', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          await fs.mkdir(cachePath, { recursive: true })

          // Create a file
          await fs.writeFile(path.join(cachePath, 'file.txt'), '', 'utf8')

          const list = await listDlxCache()
          expect(list).toEqual([])
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-skip-files-')
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

          const list = await listDlxCache()
          expect(list).toEqual([])
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-invalid-meta-')
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

          const list = await listDlxCache()
          expect(list).toEqual([])
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-array-meta-')
    })

    it('should skip entries without binary file', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'no-binary-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Write metadata but no binary.
          await fs.writeFile(
            path.join(entryPath, '.dlx-metadata.json'),
            JSON.stringify({
              integrity: 'sha512-test',
              timestamp: Date.now(),
              url: 'test',
            }),
            'utf8',
          )

          const list = await listDlxCache()
          expect(list).toEqual([])
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-no-binary-')
    })

    it('should handle metadata with missing fields', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'partial-meta-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Write partial metadata
          await fs.writeFile(
            path.join(entryPath, '.dlx-metadata.json'),
            JSON.stringify({ timestamp: Date.now() }),
            'utf8',
          )

          // Create binary
          await fs.writeFile(path.join(entryPath, 'binary'), '', 'utf8')

          const list = await listDlxCache()
          expect(list.length).toBe(1)

          const entry = list[0]!
          expect(entry.url).toBe('')
          expect(entry.integrity).toBe('')
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-partial-meta-')
    })

    it('should calculate age correctly', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Download binary
          const result = await dlxBinary(['--version'], {
            name: 'age-binary',
            url,
          })
          await result.spawnPromise.catch(() => {})

          // Wait a bit
          await new Promise(resolve => setTimeout(resolve, 100))

          const list = await listDlxCache()
          expect(list.length).toBe(1)
          expect(list[0]!.age).toBeGreaterThan(0)
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-age-')
    })

    it('should handle multiple cached binaries', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          // Download multiple binaries
          const result1 = await dlxBinary(['--version'], {
            name: 'binary-1',
            url: `${httpBaseUrl}/binary`,
          })
          await result1.spawnPromise.catch(() => {})

          const result2 = await dlxBinary(['--version'], {
            name: 'binary-2',
            url: `${httpBaseUrl}/slow-binary`,
          })
          await result2.spawnPromise.catch(() => {})

          const list = await listDlxCache()
          expect(list.length).toBe(2)

          const names = list.map(e => e.name).toSorted()
          expect(names).toEqual(['binary-1', 'binary-2'])
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-multiple-')
    })

    it('should handle entries that fail to stat', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const cachePath = getDlxCachePath()
          const entryPath = path.join(cachePath, 'stat-fail-entry')
          await fs.mkdir(entryPath, { recursive: true })

          // Write metadata.
          await fs.writeFile(
            path.join(entryPath, '.dlx-metadata.json'),
            JSON.stringify({
              integrity: 'sha512-test',
              timestamp: Date.now(),
              url: 'test',
            }),
            'utf8',
          )

          // Create binary.
          const binaryPath = path.join(entryPath, 'binary')
          await fs.writeFile(binaryPath, '', 'utf8')

          // Delete binary to cause stat failure.
          await safeDelete(binaryPath)

          const list = await listDlxCache()
          // Should skip entry that fails to stat
          expect(list).toEqual([])
        } finally {
          restoreHome()
        }
      }, 'listDlxCache-stat-fail-')
    })
  })
})
