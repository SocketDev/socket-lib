/**
 * @fileoverview Tests for src/external-tools/jre/from-download.ts —
 * Adoptium URL construction, default cache layout, archive-extension
 * dispatch (.tar.gz vs .zip), strip:1 unwrap, and the macOS
 * `Contents/Home/` javaHome quirk.
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createGzip } from 'node:zlib'

import tarFs from 'tar-fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { jreFromDownload } from '../../../../src/external-tools/jre/from-download'
import { safeDelete } from '../../../../src/fs/safe'

import { makeFakeDownloader } from '../_fake-downloader.mts'

/**
 * Build a JRE-shape tarball: top-level `jdk-21/bin/java`. After
 * strip:1 the extracted dir contains `bin/java` directly.
 */
export async function buildJreTarball(scratchDir: string): Promise<Buffer> {
  const packRoot = path.join(scratchDir, 'pack-root')
  mkdirSync(path.join(packRoot, 'jdk-21', 'bin'), { recursive: true })
  writeFileSync(path.join(packRoot, 'jdk-21', 'bin', 'java'), '#!/bin/sh\n')
  const archivePath = path.join(scratchDir, 'jre.tar.gz')
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(archivePath)
    tarFs.pack(packRoot).pipe(createGzip()).pipe(out)
    out.on('finish', () => resolve())
    out.on('error', reject)
  })
  const fs = require('node:fs') as typeof import('node:fs')
  return fs.readFileSync(archivePath)
}

describe('external-tools/jre/from-download', () => {
  let scratch: string
  beforeEach(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'jre-from-download-test-'))
  })
  afterEach(async () => {
    await safeDelete(scratch)
  })

  it('constructs the Adoptium v3/binary/latest URL', async () => {
    const tarBytes = await buildJreTarball(scratch)
    const { calls, downloader } = makeFakeDownloader(tarBytes)
    const cacheDir = path.join(scratch, 'jre-cache')
    await jreFromDownload({
      version: 21,
      platformArch: 'linux-x64',
      cacheDir,
      downloader,
    })
    expect(calls[0]!.url).toBe(
      'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse',
    )
  })

  it('returns undefined for unmapped platform-archs', async () => {
    const { calls, downloader } = makeFakeDownloader('fake')
    const result = await jreFromDownload({
      version: 21,
      platformArch: 'totally-fake-arch',
      cacheDir: path.join(scratch, 'unused'),
      downloader,
    })
    expect(result).toBeUndefined()
    expect(calls).toHaveLength(0)
  })

  it('cache name uses .tar.gz on non-Windows platforms', async () => {
    const tarBytes = await buildJreTarball(scratch)
    const { calls, downloader } = makeFakeDownloader(tarBytes)
    await jreFromDownload({
      version: 21,
      platformArch: 'linux-x64',
      cacheDir: path.join(scratch, 'jre-cache'),
      downloader,
    })
    expect(calls[0]!.name).toBe('adoptium-jre-21-linux-x64.tar.gz')
  })

  it('cache name uses .zip on Windows', async () => {
    const tarBytes = await buildJreTarball(scratch)
    const { calls, downloader } = makeFakeDownloader(tarBytes)
    // Even though the underlying payload is tar, the fake doesn't
    // care — we're only asserting how jreFromDownload spells the
    // name. extractArchive would later fail on real win-x64 (since
    // the file content wouldn't be zip) but that's not what this
    // test exercises.
    try {
      await jreFromDownload({
        version: 21,
        platformArch: 'win-x64',
        cacheDir: path.join(scratch, 'jre-cache-win'),
        downloader,
      })
    } catch {
      // Extraction will throw (content is tar, name says zip); we
      // only care about the recorded call.
    }
    expect(calls[0]!.name).toBe('adoptium-jre-21-win-x64.zip')
  })

  it('extracts with strip:1 and returns javaPath under bin/', async () => {
    const tarBytes = await buildJreTarball(scratch)
    const { downloader } = makeFakeDownloader(tarBytes)
    const cacheDir = path.join(scratch, 'jre-cache')
    const result = await jreFromDownload({
      version: 21,
      platformArch: 'linux-x64',
      cacheDir,
      downloader,
    })
    // strip:1 should unwrap `jdk-21/` so `bin/java` lands at the
    // top of cacheDir.
    expect(existsSync(path.join(cacheDir, 'bin', 'java'))).toBe(true)
    expect(result?.source).toBe('download')
    // On macOS the javaHome adds Contents/Home; on linux it's
    // cacheDir directly.
    if (process.platform === 'darwin') {
      expect(result?.javaHome).toBe(path.join(cacheDir, 'Contents', 'Home'))
    } else {
      expect(result?.javaHome).toBe(cacheDir)
      expect(result?.javaPath).toBe(path.join(cacheDir, 'bin', 'java'))
    }
  })
})
