/**
 * @file Integration tests for src/external-tools/from-download.ts. Exercises
 *   the chain end-to-end with the `downloader?` injection point — no network,
 *   no real Adoptium fetch. The fake downloader writes a pre-built tar archive
 *   to disk and returns the dlx-shape `{binaryPath, downloaded, integrity}` so
 *   `downloadAndExtractTool` can hand the archive to `extractArchive`.
 */

import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import tarFs from 'tar-fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  downloadAndExtractTool,
  downloadToolArchive,
} from '../../../src/external-tools/from-download'
import { safeDelete } from '../../../src/fs/safe'

import {
  FAKE_INTEGRITY_VALUE as FAKE_INTEGRITY,
  makeFakeDownloader,
} from '../../lib/fake-downloader'

// Sequential, not concurrent — the `scratch` mkdtemp is shared by
// closure into the describe-scoped `let`. Local vitest config has
// `sequence.concurrent: true`, which would interleave beforeEach calls.
describe.sequential('external-tools/from-download', () => {
  let scratch: string
  beforeEach(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'from-download-test-'))
  })
  afterEach(async () => {
    await safeDelete(scratch)
  })

  describe('downloadToolArchive', () => {
    it('passes url + name + integrity through to the downloader', async () => {
      const { calls, downloader } = makeFakeDownloader('fake-archive-bytes')
      const result = await downloadToolArchive({
        url: 'https://example.com/tool.tgz',
        name: 'tool-1.2.3',
        integrity: FAKE_INTEGRITY,
        downloader,
      })
      expect(calls).toEqual([
        { url: 'https://example.com/tool.tgz', name: 'tool-1.2.3' },
      ])
      expect(result.source).toBe('download')
      expect(result.integrity).toBe(FAKE_INTEGRITY)
      expect(result.archivePath.endsWith('tool-1.2.3')).toBe(true)
    })

    it('returns downloaded: true and the computed integrity', async () => {
      const { downloader } = makeFakeDownloader('payload')
      const result = await downloadToolArchive({
        url: 'https://example.com/x',
        name: 'x',
        downloader,
      })
      expect(result.downloaded).toBe(true)
      expect(result.integrity).toBe(FAKE_INTEGRITY)
    })
  })

  describe('downloadAndExtractTool', () => {
    /**
     * Build a real tar archive containing `source/hello.txt`. Packs the parent
     * dir so the entry name is `source/hello.txt` (with the `source/` wrapper),
     * which mirrors how Adoptium / Bazel / SBT archives are shaped.
     *
     * Returns the tar bytes directly. Round-tripping through the FS
     * (createWriteStream + readFileSync) raced under vitest's vm-context.
     */
    function buildTarFixture(scratchDir: string): Promise<Buffer> {
      const fs = require('node:fs') as typeof import('node:fs')
      const packRoot = path.join(scratchDir, 'pack-root')
      fs.mkdirSync(path.join(packRoot, 'source'), { recursive: true })
      fs.writeFileSync(path.join(packRoot, 'source', 'hello.txt'), 'world')
      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        const pack = tarFs.pack(packRoot)
        pack.on('error', reject)
        pack.on('data', chunk => chunks.push(chunk as Buffer))
        pack.on('end', () => resolve(Buffer.concat(chunks)))
      })
    }

    it('extracts a tar archive into the target dir on first call', async () => {
      const tarBytes = await buildTarFixture(scratch)
      const { downloader } = makeFakeDownloader(tarBytes)
      const extractedDir = path.join(scratch, 'extracted')

      const result = await downloadAndExtractTool({
        url: 'https://example.com/fixture.tar',
        name: 'fixture-1.0.0.tar',
        extractedDir,
        downloader,
      })

      expect(result.extracted).toBe(true)
      expect(result.extractedDir).toBe(extractedDir)
      expect(existsSync(path.join(extractedDir, 'source', 'hello.txt'))).toBe(
        true,
      )
    })

    it('is idempotent: re-running with a populated target dir skips extraction', async () => {
      const tarBytes = await buildTarFixture(scratch)
      const { downloader } = makeFakeDownloader(tarBytes)
      const extractedDir = path.join(scratch, 'extracted')

      const first = await downloadAndExtractTool({
        url: 'https://example.com/fixture.tar',
        name: 'fixture-1.0.0.tar',
        extractedDir,
        downloader,
      })
      expect(first.extracted).toBe(true)

      const second = await downloadAndExtractTool({
        url: 'https://example.com/fixture.tar',
        name: 'fixture-1.0.0.tar',
        extractedDir,
        downloader,
      })
      expect(second.extracted).toBe(false)
      // The tree from the first call should still be present.
      expect(readdirSync(extractedDir).length).toBeGreaterThan(0)
    })

    it('forwards extractOptions.strip to extractArchive', async () => {
      // Build a tar wrapping `top/inner.txt`. With strip: 1, the
      // extracted tree should contain `inner.txt` directly.
      const fs = require('node:fs') as typeof import('node:fs')
      const packRoot = path.join(scratch, 'strip-pack')
      fs.mkdirSync(path.join(packRoot, 'top'), { recursive: true })
      fs.writeFileSync(path.join(packRoot, 'top', 'inner.txt'), 'hi')
      const tarBytes = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        const pack = tarFs.pack(packRoot)
        pack.on('error', reject)
        pack.on('data', chunk => chunks.push(chunk as Buffer))
        pack.on('end', () => resolve(Buffer.concat(chunks)))
      })
      const { downloader } = makeFakeDownloader(tarBytes)
      const extractedDir = path.join(scratch, 'extracted')

      await downloadAndExtractTool({
        url: 'https://example.com/wrap.tar',
        name: 'wrap-1.0.0.tar',
        extractedDir,
        extractOptions: { strip: 1 },
        downloader,
      })

      expect(existsSync(path.join(extractedDir, 'inner.txt'))).toBe(true)
      expect(existsSync(path.join(extractedDir, 'top'))).toBe(false)
    })
  })
})
