/**
 * @fileoverview Unit tests for GitHub release archive download + extraction.
 *
 * Mocks the network (downloadReleaseAsset) and the archive extractor
 * (extractArchive). Each test writes a fake archive at the path the SUT
 * picked, runs through success or failure branches, and asserts on
 * filesystem state + thrown error wrapping.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  downloadAndExtractArchive,
  downloadAndExtractZip,
} from '../../src/releases/github-archives'

import { extractArchive } from '../../src/archives/extract'
import { safeDeleteSync } from '../../src/fs/safe'
import { downloadReleaseAsset } from '../../src/releases/github-downloads'

// Mock at the resolved path the SUT imports (relative within src/).
vi.mock('../../src/releases/github-downloads', () => ({
  downloadReleaseAsset: vi.fn(
    async (
      _tag: string,
      _pattern: unknown,
      outputPath: string,
      _repo: unknown,
      _options?: unknown,
    ) => {
      // Write a placeholder so the SUT's cleanup branch has a real
      // file to delete; tests asserting non-cleanup also rely on this.
      writeFileSync(outputPath, 'fake-archive-bytes')
    },
  ),
}))

vi.mock('../../src/archives/extract', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/archives/extract')>()
  return {
    ...original,
    extractArchive: vi.fn(async () => {}),
  }
})

const REPO = { __proto__: null, owner: 'SocketDev', repo: 'socket-btm' } as {
  owner: string
  repo: string
}

describe.sequential('releases/github-archives', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `socket-lib-archives-test-${randomUUID()}`)
    mkdirSync(testDir, { recursive: true })
    vi.mocked(downloadReleaseAsset).mockClear()
    vi.mocked(extractArchive).mockClear()
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      safeDeleteSync(testDir, { force: true })
    }
  })

  describe('downloadAndExtractArchive', () => {
    it('downloads + extracts and returns the output dir on success', async () => {
      const out = join(testDir, 'extract')
      const result = await downloadAndExtractArchive(
        'v1.0.0',
        'data-v1.0.0.tar.gz',
        out,
        REPO,
        { quiet: true },
      )
      expect(result).toBe(out)
      expect(downloadReleaseAsset).toHaveBeenCalledOnce()
      expect(extractArchive).toHaveBeenCalledOnce()
    })

    it('honors explicit format option for extension picking (zip)', async () => {
      const out = join(testDir, 'fmt-zip')
      await downloadAndExtractArchive('v1', 'asset', out, REPO, {
        format: 'zip',
        quiet: true,
      })
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect((args[2] as string).endsWith('.zip')).toBe(true)
    })

    it('honors tar.gz format option (suffix kept literal)', async () => {
      const out = join(testDir, 'fmt-targz')
      await downloadAndExtractArchive('v1', 'asset', out, REPO, {
        format: 'tar.gz',
        quiet: true,
      })
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect((args[2] as string).endsWith('.tar.gz')).toBe(true)
    })

    it('detects tar.gz from a string asset pattern', async () => {
      const out = join(testDir, 'fmt-detect')
      await downloadAndExtractArchive('v1', 'thing-v1.tar.gz', out, REPO, {
        quiet: true,
      })
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect((args[2] as string).endsWith('.tar.gz')).toBe(true)
    })

    it('falls back to .archive when format and pattern give no signal', async () => {
      const out = join(testDir, 'fmt-fallback')
      // AssetPattern object — detectArchiveFormat only inspects strings.
      await downloadAndExtractArchive(
        'v1',
        { __proto__: null, prefix: 'asset-', suffix: '' } as {
          prefix: string
          suffix: string
        },
        out,
        REPO,
        { quiet: true },
      )
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect((args[2] as string).endsWith('.archive')).toBe(true)
    })

    it('wraps extraction errors with cause', async () => {
      vi.mocked(extractArchive).mockImplementationOnce(async () => {
        throw new Error('bad-archive')
      })
      const out = join(testDir, 'extract-fail')
      await expect(
        downloadAndExtractArchive('v1', 'a.tar.gz', out, REPO, { quiet: true }),
      ).rejects.toThrow(/Failed to extract archive/)
    })

    it('cleans up the temp archive file after extraction', async () => {
      const out = join(testDir, 'cleanup-on')
      await downloadAndExtractArchive('v1', 'a.zip', out, REPO, {
        quiet: true,
      })
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect(existsSync(args[2] as string)).toBe(false)
    })

    it('keeps the temp archive when cleanup:false', async () => {
      const out = join(testDir, 'cleanup-off')
      await downloadAndExtractArchive('v1', 'a.zip', out, REPO, {
        cleanup: false,
        quiet: true,
      })
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect(existsSync(args[2] as string)).toBe(true)
    })

    it('runs the non-quiet log path without throwing', async () => {
      const out = join(testDir, 'verbose')
      await expect(
        downloadAndExtractArchive('v1', 'a.tar', out, REPO, { quiet: false }),
      ).resolves.toBe(out)
    })

    it('uses default options when called with no options object', async () => {
      const out = join(testDir, 'no-opts')
      await expect(
        downloadAndExtractArchive('v1', 'a.zip', out, REPO),
      ).resolves.toBe(out)
    })
  })

  describe('downloadAndExtractZip', () => {
    it('downloads + extracts and returns the output dir', async () => {
      const out = join(testDir, 'zip-ok')
      const result = await downloadAndExtractZip('v1', 'a.zip', out, REPO, {
        quiet: true,
      })
      expect(result).toBe(out)
    })

    it('writes to a __temp_download__.zip file', async () => {
      const out = join(testDir, 'zip-tempname')
      await downloadAndExtractZip('v1', 'a.zip', out, REPO, { quiet: true })
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect((args[2] as string).endsWith('__temp_download__.zip')).toBe(true)
    })

    it('wraps extraction errors with cause', async () => {
      vi.mocked(extractArchive).mockImplementationOnce(async () => {
        throw new Error('bad-zip')
      })
      const out = join(testDir, 'zip-fail')
      await expect(
        downloadAndExtractZip('v1', 'a.zip', out, REPO, { quiet: true }),
      ).rejects.toThrow(/Failed to extract zip file/)
    })

    it('cleans up the temp zip file by default', async () => {
      const out = join(testDir, 'zip-cleanup')
      await downloadAndExtractZip('v1', 'a.zip', out, REPO, { quiet: true })
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect(existsSync(args[2] as string)).toBe(false)
    })

    it('keeps the temp zip file when cleanup:false', async () => {
      const out = join(testDir, 'zip-keep')
      await downloadAndExtractZip('v1', 'a.zip', out, REPO, {
        cleanup: false,
        quiet: true,
      })
      const args = vi.mocked(downloadReleaseAsset).mock.calls[0]!
      expect(existsSync(args[2] as string)).toBe(true)
    })

    it('runs the non-quiet log path without throwing', async () => {
      const out = join(testDir, 'zip-verbose')
      await expect(
        downloadAndExtractZip('v1', 'a.zip', out, REPO),
      ).resolves.toBe(out)
    })
  })
})
