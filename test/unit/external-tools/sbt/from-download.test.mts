/**
 * @file Tests for src/external-tools/sbt/from-download.ts — URL construction,
 *   default cache layout, strip:1 unwrap of the top-level sbt/ directory, and
 *   the ResolvedSbt return shape.
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
import { createGzip } from 'node:zlib'

import tarFs from 'tar-fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sbtFromDownload } from '../../../../src/external-tools/sbt/from-download'
import { safeDelete } from '../../../../src/fs/safe'

import { makeFakeDownloader } from '../../../lib/fake-downloader'

/**
 * Build an SBT-shape tarball: top-level `sbt/bin/sbt` script. After extraction
 * with strip:1, the extracted dir should contain `bin/sbt` directly.
 */
export async function buildSbtTarball(scratchDir: string): Promise<Buffer> {
  const packRoot = path.join(scratchDir, 'pack-root')
  mkdirSync(path.join(packRoot, 'sbt', 'bin'), { recursive: true })
  writeFileSync(path.join(packRoot, 'sbt', 'bin', 'sbt'), '#!/bin/sh\n')
  const archivePath = path.join(scratchDir, 'sbt.tgz')
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(archivePath)
    tarFs.pack(packRoot).pipe(createGzip()).pipe(out)
    out.on('finish', () => resolve())
    out.on('error', reject)
  })
  const fs = require('node:fs') as typeof import('node:fs')
  return fs.readFileSync(archivePath)
}

describe.sequential('external-tools/sbt/from-download', () => {
  let scratch: string
  beforeEach(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'sbt-from-download-test-'))
  })
  afterEach(async () => {
    await safeDelete(scratch)
  })

  it('constructs the GitHub release URL with a v-prefixed tag', async () => {
    const tarBytes = await buildSbtTarball(scratch)
    const { calls, downloader } = makeFakeDownloader(tarBytes)
    const cacheDir = path.join(scratch, 'sbt-cache')
    await sbtFromDownload({
      version: '1.10.7',
      cacheDir,
      downloader,
    })
    expect(calls[0]!.url).toBe(
      'https://github.com/sbt/sbt/releases/download/v1.10.7/sbt-1.10.7.tgz',
    )
    expect(calls[0]!.name).toBe('sbt-1.10.7.tgz')
  })

  it('extracts with strip:1 so bin/sbt lands directly under cacheDir', async () => {
    const tarBytes = await buildSbtTarball(scratch)
    const { downloader } = makeFakeDownloader(tarBytes)
    const cacheDir = path.join(scratch, 'sbt-cache')
    await sbtFromDownload({
      version: '1.10.7',
      cacheDir,
      downloader,
    })
    expect(existsSync(path.join(cacheDir, 'bin', 'sbt'))).toBe(true)
    expect(existsSync(path.join(cacheDir, 'sbt'))).toBe(false)
  })

  it('returns ResolvedSbt with isJar: false and the bin/sbt path', async () => {
    const tarBytes = await buildSbtTarball(scratch)
    const { downloader } = makeFakeDownloader(tarBytes)
    const cacheDir = path.join(scratch, 'sbt-cache')
    const result = await sbtFromDownload({
      version: '1.10.7',
      cacheDir,
      downloader,
    })
    expect(result).toMatchObject({
      isJar: false,
      source: 'download',
      path: path.join(cacheDir, 'bin', 'sbt'),
    })
  })

  it('falls back to socket dlx dir when cacheDir is omitted', async () => {
    const tarBytes = await buildSbtTarball(scratch)
    const { downloader } = makeFakeDownloader(tarBytes)
    const result = await sbtFromDownload({
      version: '1.10.7',
      downloader,
    })
    expect(result?.source).toBe('download')
    expect(result?.path).toMatch(/sbt[/\\]1\.10\.7[/\\]bin[/\\]sbt$/)
  })
})
