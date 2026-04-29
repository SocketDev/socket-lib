/**
 * @fileoverview Unit tests for GitHub release asset downloads.
 *
 * Covers:
 * - downloadReleaseAsset (delegates to getReleaseAssetUrl + httpDownload)
 * - downloadGitHubRelease TOCTOU race protection on cached binaries
 */

import { existsSync } from 'node:fs'

import { safeDelete } from '@socketsecurity/lib/fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadReleaseAsset } from '../../src/releases/github-downloads'
import { SOCKET_BTM_REPO } from '../../src/releases/socket-btm'

import type { HttpDownloadResult } from '../../src/http-request'
import { httpDownload, httpRequest } from '../../src/http-request'

import { createMockHttpResponse } from './utils/http-mock'

vi.mock('../../src/http-request')

const JSONStringify = JSON.stringify

describe('releases/github-downloads', () => {
  describe.sequential('downloadReleaseAsset', () => {
    const mockRelease = {
      assets: [
        {
          browser_download_url:
            'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
          name: 'yoga-sync-abc.mjs',
        },
        {
          browser_download_url:
            'https://github.com/test/repo/releases/download/v1.0.0/models-data.tar.gz',
          name: 'models-data.tar.gz',
        },
      ],
      tag_name: 'v1.0.0',
    }

    afterEach(() => {
      vi.clearAllMocks()
    })

    it('should download asset with exact name', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )
      vi.mocked(httpDownload).mockResolvedValueOnce(
        undefined as unknown as HttpDownloadResult,
      )

      await downloadReleaseAsset(
        'v1.0.0',
        'yoga-sync-abc.mjs',
        '/tmp/output.mjs',
        SOCKET_BTM_REPO,
      )

      expect(httpDownload).toHaveBeenCalledWith(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
        '/tmp/output.mjs',
        expect.objectContaining({
          progressInterval: 10,
          retries: 2,
          retryDelay: 5000,
        }),
      )
    })

    it('should download asset with wildcard pattern', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )
      vi.mocked(httpDownload).mockResolvedValueOnce(
        undefined as unknown as HttpDownloadResult,
      )

      await downloadReleaseAsset(
        'v1.0.0',
        'yoga-*.mjs',
        '/tmp/output.mjs',
        SOCKET_BTM_REPO,
      )

      expect(httpDownload).toHaveBeenCalledWith(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
        '/tmp/output.mjs',
        expect.any(Object),
      )
    })

    it('should download asset with brace expansion', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )
      vi.mocked(httpDownload).mockResolvedValueOnce(
        undefined as unknown as HttpDownloadResult,
      )

      await downloadReleaseAsset(
        'v1.0.0',
        '{yoga,models}-*.{mjs,tar.gz}',
        '/tmp/output',
        SOCKET_BTM_REPO,
      )

      expect(httpDownload).toHaveBeenCalledWith(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
        '/tmp/output',
        expect.any(Object),
      )
    })

    it('should throw error when pattern does not match', async () => {
      // pRetry attempts the call up to 3 times — use
      // `mockResolvedValue` (always) instead of `mockResolvedValueOnce`
      // so each retry gets the same payload. Otherwise the second
      // pRetry attempt would receive `undefined` and throw an
      // unrelated "Cannot read properties of undefined" error.
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )

      await expect(
        downloadReleaseAsset(
          'v1.0.0',
          'nonexistent-*.xyz',
          '/tmp/output.xyz',
          SOCKET_BTM_REPO,
        ),
      ).rejects.toThrow('Asset nonexistent-*.xyz not found in release v1.0.0')
    }, 40_000)
  })

  // .sequential is required because vitest's config sets
  // `concurrent: !process.env.CI` (.config/vitest.config.mts). These
  // tests share the module-level httpDownload / httpRequest mocks so
  // running them in parallel lets one test's call pollute another's
  // `toHaveBeenCalledTimes` assertion. Pattern borrowed from
  // test/unit/logger-advanced.test.mts which disables concurrency for
  // the same reason.
  describe.sequential('downloadGitHubRelease - TOCTOU race protection', () => {
    // Pre-populate the on-disk cache state synchronously before calling
    // downloadGitHubRelease, so the function under test can only
    // observe the state the test prepared. httpDownload is either
    // asserted-never-called (cache-hit path) or mocked as a trivial
    // no-op that writes the missing file for the re-download path.
    // No mock side effects interleave with the call under test.

    // All state (temp dir, imports) lives inside each `it` block so
    // nothing leaks across tests under `isolate: false`. The previous
    // rewrite used `let testDir` at the describe scope and flaked
    // because that single binding got overwritten by the next
    // test's beforeEach while vitest was still reporting the first
    // test's assertion. Using fully local state makes that impossible.
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('uses cache and does not call httpDownload when binary + version file exist and tag matches', async () => {
      const { downloadGitHubRelease } =
        await import('../../src/releases/github-downloads')
      const { promises: fs } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const nodePath = await import('node:path')

      const testDir = await fs.mkdtemp(
        nodePath.join(tmpdir(), 'test-github-dl-'),
      )
      try {
        // Pre-populate the cache exactly as a prior successful download
        // would have left it: binary + .version file with matching tag.
        // downloadGitHubRelease must short-circuit to the cached binary
        // path without touching httpDownload.
        const binaryFile = nodePath.join(testDir, 'test-bin')
        const versionFile = nodePath.join(testDir, '.version')
        await fs.writeFile(binaryFile, '#!/bin/bash\necho "test"', 'utf8')
        await fs.writeFile(versionFile, 'v1.0.0', 'utf8')

        const result = await downloadGitHubRelease({
          assetName: 'test-binary',
          binaryName: 'test-bin',
          downloadDir: testDir,
          owner: 'test-owner',
          platformArch: 'test-arch',
          repo: 'test-repo',
          tag: 'v1.0.0',
          toolName: 'test-tool',
        })

        expect(result).toBe(binaryFile)
        expect(httpDownload).not.toHaveBeenCalled()
        expect(httpRequest).not.toHaveBeenCalled()
        expect(existsSync(binaryFile)).toBe(true)
        expect(existsSync(versionFile)).toBe(true)
      } finally {
        await safeDelete(testDir, { force: true }).catch(() => {})
      }
    })

    it('re-downloads when version file exists but binary is missing (TOCTOU recovery)', async () => {
      const { downloadGitHubRelease } =
        await import('../../src/releases/github-downloads')
      const { promises: fs } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const nodePath = await import('node:path')

      const testDir = await fs.mkdtemp(
        nodePath.join(tmpdir(), 'test-github-dl-missing-'),
      )
      try {
        // The TOCTOU recovery path: version file claims the right tag
        // is cached, but the binary was removed (by OS cleanup, another
        // process, manual rm, etc.). The second existsSync check inside
        // downloadGitHubRelease must detect the missing binary after
        // reading the version file and fall through to re-download.
        const binaryFile = nodePath.join(testDir, 'test-bin')
        const versionFile = nodePath.join(testDir, '.version')
        await fs.writeFile(versionFile, 'v1.0.0', 'utf8')
        // Intentionally do NOT create binaryFile.

        vi.mocked(httpRequest).mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(
              JSONStringify({
                assets: [
                  {
                    browser_download_url: 'https://example.com/binary',
                    name: 'test-binary',
                  },
                ],
                tag_name: 'v1.0.0',
              }),
            ),
            true,
            200,
          ),
        )
        vi.mocked(httpDownload).mockImplementationOnce(
          async (_url, outputPath) => {
            await fs.writeFile(outputPath, '#!/bin/bash\necho "test"', 'utf8')
            return {
              headers: {},
              ok: true as const,
              path: outputPath,
              size: 22,
              status: 200,
              statusText: 'OK',
            }
          },
        )

        const result = await downloadGitHubRelease({
          assetName: 'test-binary',
          binaryName: 'test-bin',
          downloadDir: testDir,
          owner: 'test-owner',
          platformArch: 'test-arch',
          repo: 'test-repo',
          tag: 'v1.0.0',
          toolName: 'test-tool',
        })

        expect(result).toBe(binaryFile)
        expect(httpDownload).toHaveBeenCalledTimes(1)
        expect(existsSync(binaryFile)).toBe(true)
      } finally {
        await safeDelete(testDir, { force: true }).catch(() => {})
      }
    })

    it('re-downloads when version file tag does not match requested tag', async () => {
      const { downloadGitHubRelease } =
        await import('../../src/releases/github-downloads')
      const { promises: fs } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const nodePath = await import('node:path')

      const testDir = await fs.mkdtemp(
        nodePath.join(tmpdir(), 'test-github-dl-stale-'),
      )
      try {
        // Cache-invalidation path: both files present but .version
        // says a different tag than the caller asked for. Must fall
        // through to re-download.
        const binaryFile = nodePath.join(testDir, 'test-bin')
        const versionFile = nodePath.join(testDir, '.version')
        await fs.writeFile(binaryFile, 'stale-binary', 'utf8')
        await fs.writeFile(versionFile, 'v0.9.0', 'utf8')

        vi.mocked(httpRequest).mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(
              JSONStringify({
                assets: [
                  {
                    browser_download_url: 'https://example.com/binary',
                    name: 'test-binary',
                  },
                ],
                tag_name: 'v1.0.0',
              }),
            ),
            true,
            200,
          ),
        )
        vi.mocked(httpDownload).mockImplementationOnce(
          async (_url, outputPath) => {
            await fs.writeFile(outputPath, 'fresh-binary', 'utf8')
            return {
              headers: {},
              ok: true as const,
              path: outputPath,
              size: 12,
              status: 200,
              statusText: 'OK',
            }
          },
        )

        await downloadGitHubRelease({
          assetName: 'test-binary',
          binaryName: 'test-bin',
          downloadDir: testDir,
          owner: 'test-owner',
          platformArch: 'test-arch',
          repo: 'test-repo',
          tag: 'v1.0.0',
          toolName: 'test-tool',
        })

        expect(httpDownload).toHaveBeenCalledTimes(1)
        // Cache updated to the new tag.
        expect(await fs.readFile(versionFile, 'utf8')).toBe('v1.0.0')
      } finally {
        await safeDelete(testDir, { force: true }).catch(() => {})
      }
    })
  })
})
