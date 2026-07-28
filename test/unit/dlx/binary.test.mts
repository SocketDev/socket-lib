/**
 * @file Unit tests for DLX binary execution and downloading. Tests DLX binary
 *   execution with HTTP server integration:
 *
 *   - dlxBinary() downloads and executes package binaries
 *   - getDlxCachePath() resolves cache directory paths
 *   - Cross-platform binary execution
 *   - HTTP download with integrity verification Used by Socket CLI for secure
 *     one-off package execution. Cache enumeration/cleanup suites
 *     (cleanDlxCache, listDlxCache, atomic metadata writes) live in
 *     binary-cache-list.test.mts to keep both files under the file-size cap.
 */

import crypto from 'node:crypto'
import os from 'node:os'
import process from 'node:process'

import { dlxBinary, getDlxCachePath } from '../../../src/dlx/binary'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { itWindowsOnly } from '../util/skip-helpers'
import { mockHomeDir, runWithTempDir } from '../util/temp-file-helper'
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

describe.sequential('dlx-binary', () => {
  describe('getDlxCachePath', () => {
    it('should return normalized cache path', () => {
      const cachePath = getDlxCachePath()

      expect(cachePath).toBeDefined()
      expect(cachePath).toContain('.socket')
      expect(cachePath).toContain('_dlx')
      // Should not contain backslashes on any platform.
      // oxlint-disable-next-line socket/normalize-path-before-match -- asserts backslash ABSENCE; normalizing first would make the check vacuous.
      expect(cachePath.includes('\\')).toBe(false)
    })

    it('should return consistent path across multiple calls', () => {
      const path1 = getDlxCachePath()
      const path2 = getDlxCachePath()

      expect(path1).toBe(path2)
    })
  })

  describe('dlxBinary', () => {
    it('should download and cache binary', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`
          const result = await dlxBinary(['--version'], {
            name: 'test-binary',
            url,
          })

          expect(result.downloaded).toBe(true)
          expect(result.binaryPath).toBeDefined()
          expect(result.binaryPath).toContain('test-binary')
          expect(result.spawnPromise).toBeDefined()
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-download-')
    })

    it('should use cached binary on second call', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // First call - should download
          const result1 = await dlxBinary(['--version'], {
            name: 'cached-binary',
            url,
          })
          // Catch spawn promise immediately to prevent unhandled rejection on Windows.
          result1.spawnPromise.catch(() => {})
          expect(result1.downloaded).toBe(true)

          // Second call - should use cache
          const result2 = await dlxBinary(['--version'], {
            name: 'cached-binary',
            url,
          })
          // Catch spawn promise immediately to prevent unhandled rejection on Windows.
          result2.spawnPromise.catch(() => {})
          expect(result2.downloaded).toBe(false)
          expect(result2.binaryPath).toBe(result1.binaryPath)
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-cached-')
    })

    it('should force re-download when force option is true', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // First call
          const result1 = await dlxBinary(['--version'], {
            name: 'force-binary',
            url,
          })
          await result1.spawnPromise.catch(() => {})

          // Second call with force
          const result = await dlxBinary(['--version'], {
            force: true,
            name: 'force-binary',
            url,
          })
          expect(result.downloaded).toBe(true)
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-force-')
    })

    it('should force re-download when yes option is true (CLI-style)', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // First call
          const result1 = await dlxBinary(['--version'], {
            name: 'yes-binary',
            url,
          })
          await result1.spawnPromise.catch(() => {})

          // Second call with yes (should behave like force)
          const result = await dlxBinary(['--version'], {
            name: 'yes-binary',
            url,
            yes: true,
          })
          expect(result.downloaded).toBe(true)
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-yes-')
    })

    it('should accept quiet option (CLI-style, reserved)', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Call with quiet option - currently reserved for future use
          const result = await dlxBinary(['--version'], {
            name: 'quiet-binary',
            quiet: true,
            url,
          })
          expect(result.downloaded).toBe(true)
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-quiet-')
    })

    it('should verify integrity when provided', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const content = '#!/bin/bash\necho "verified binary"'
          const hash = crypto
            .createHash('sha512')
            .update(content)
            .digest('base64')
          const expectedIntegrity = `sha512-${hash}`
          const url = `${httpBaseUrl}/binary-with-integrity`

          const result = await dlxBinary(['--version'], {
            integrity: expectedIntegrity,
            name: 'verified-binary',
            url,
          })

          expect(result.downloaded).toBe(true)
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-integrity-')
    })

    it('should throw on integrity mismatch', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary-invalid-checksum`
          // SHA-512 base64 is 88 characters.
          const wrongIntegrity = `sha512-${'a'.repeat(86)}==`

          await expect(
            dlxBinary(['--version'], {
              integrity: wrongIntegrity,
              name: 'invalid-integrity-binary',
              url,
            }),
          ).rejects.toThrow(/Integrity mismatch/)
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-bad-integrity-')
    })

    it('should throw on download failure', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary-404`

          await expect(
            dlxBinary(['--version'], {
              name: 'not-found-binary',
              url,
            }),
          ).rejects.toThrow(/Failed to download binary from/)
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-404-')
    })

    it('should throw on server error', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary-500`

          await expect(
            dlxBinary(['--version'], {
              name: 'error-binary',
              url,
            }),
          ).rejects.toThrow(/Failed to download binary from/)
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-500-')
    })

    it('should use default binary name if not provided', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          const result = await dlxBinary(['--version'], {
            url,
          })

          expect(result.binaryPath).toContain(
            `binary-${process.platform}-${os.arch()}`,
          )
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-default-name-')
    })

    it('should pass spawn options to spawn', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          const result = await dlxBinary(['--version'], {
            name: 'spawn-options-binary',
            spawnOptions: {
              env: { CUSTOM_VAR: 'test' },
            },
            url,
          })

          expect(result.spawnPromise).toBeDefined()
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-spawn-options-')
    })

    it('should use custom cacheTtl', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`

          // Set short TTL with generous headroom to avoid CI timing flakes.
          const result = await dlxBinary(['--version'], {
            cacheTtl: 500,
            name: 'ttl-binary',
            url,
          })
          // Catch spawn promise immediately to prevent unhandled rejection on Windows.
          result.spawnPromise.catch(() => {})

          expect(result.downloaded).toBe(true)

          // Wait for cache to expire.
          await new Promise(resolve => setTimeout(resolve, 700))

          // Should re-download due to expired cache.
          const result2 = await dlxBinary(['--version'], {
            cacheTtl: 500,
            name: 'ttl-binary',
            url,
          })
          // Catch spawn promise immediately to prevent unhandled rejection on Windows.
          result2.spawnPromise.catch(() => {})

          expect(result2.downloaded).toBe(true)
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-ttl-')
    })

    it('should pass args to spawn', async () => {
      await runWithTempDir(async tmpDir => {
        const restoreHome = mockHomeDir(tmpDir)

        try {
          const url = `${httpBaseUrl}/binary`
          const args = ['arg1', 'arg2', '--flag']

          const result = await dlxBinary(args, {
            name: 'args-binary',
            url,
          })

          expect(result.spawnPromise).toBeDefined()
          await result.spawnPromise.catch(() => {})
        } finally {
          restoreHome()
        }
      }, 'dlxBinary-args-')
    })
  })

  describe('Windows-specific behavior', () => {
    const originalPlatform = process.platform

    // Windows script extensions that require shell: true in spawn.
    // Each test verifies dlxBinary downloads the script and resolves
    // the correct binaryPath. The spawnPromise is bounded by a timeout
    // to avoid hanging on CI when shell execution stalls (e.g. ps1
    // execution policy prompts).
    const windowsScriptExts = ['.cmd', '.bat', '.ps1'] as const

    for (const ext of windowsScriptExts) {
      itWindowsOnly(
        `should handle ${ext} files with shell on Windows`,
        async () => {
          await runWithTempDir(
            async tmpDir => {
              const restoreHome = mockHomeDir(tmpDir)

              try {
                Object.defineProperty(process, 'platform', {
                  configurable: true,
                  value: 'win32',
                })

                const url = `${httpBaseUrl}/binary-windows${ext}`

                const result = await dlxBinary(['--version'], {
                  name: `test${ext}`,
                  url,
                })

                expect(result.binaryPath).toContain(ext)
                // Bound the spawn wait with a 5s timeout to prevent hangs on
                // CI (e.g. PowerShell execution policy prompts). Resolving the
                // outer promise once either the spawn settles or the timer
                // fires keeps a single awaited promise (no Promise.race).
                await new Promise<void>(resolve => {
                  const timer = setTimeout(resolve, 5000)
                  result.spawnPromise
                    .catch(() => {})
                    .finally(() => {
                      clearTimeout(timer)
                      resolve()
                    })
                })
              } finally {
                restoreHome()
                Object.defineProperty(process, 'platform', {
                  configurable: true,
                  value: originalPlatform,
                })
              }
            },
            `dlxBinary-windows-${ext.slice(1)}-`,
          )
        },
      )
    }
  })
})
