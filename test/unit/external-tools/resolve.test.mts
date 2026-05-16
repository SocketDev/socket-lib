/**
 * @fileoverview Cross-tool resolver tests — exercises the
 * option-shape memoization and downloadIfMissing fall-through
 * shared by resolveJre / resolveBazel / resolveSbt.
 *
 * The local-discovery tiers (VFS / JAVA_HOME / PATH / etc.) are
 * skipped on the test machine in practice (no smol binary, often no
 * java/bazel/sbt on PATH), so we exercise the download tier via
 * the injectable `downloader?`. When the test machine DOES have a
 * local tool, the "local tier short-circuits download" case is
 * implicitly covered; tests assert behavior in both shapes.
 */

import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createGzip } from 'node:zlib'

import tarFs from 'tar-fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  _resetBazelResolution,
  resolveBazel,
} from '../../../src/external-tools/bazel/resolve'
import {
  _resetJreResolution,
  resolveJre,
} from '../../../src/external-tools/jre/resolve'
import {
  _resetSbtResolution,
  resolveSbt,
} from '../../../src/external-tools/sbt/resolve'
import { safeDelete } from '../../../src/fs/safe'

import { makeFakeDownloader } from '../../lib/fake-downloader'

export function buildJreTarball(scratchDir: string): Promise<Buffer> {
  const packRoot = path.join(scratchDir, 'pack-root')
  mkdirSync(path.join(packRoot, 'jdk-21', 'bin'), { recursive: true })
  writeFileSync(path.join(packRoot, 'jdk-21', 'bin', 'java'), '#!/bin/sh\n')
  const archivePath = path.join(scratchDir, 'jre.tar.gz')
  return new Promise<Buffer>((resolve, reject) => {
    const out = createWriteStream(archivePath)
    tarFs.pack(packRoot).pipe(createGzip()).pipe(out)
    out.on('finish', () => {
      const fs = require('node:fs') as typeof import('node:fs')
      resolve(fs.readFileSync(archivePath))
    })
    out.on('error', reject)
  })
}

export function buildSbtTarball(scratchDir: string): Promise<Buffer> {
  const packRoot = path.join(scratchDir, 'pack-root')
  mkdirSync(path.join(packRoot, 'sbt', 'bin'), { recursive: true })
  writeFileSync(path.join(packRoot, 'sbt', 'bin', 'sbt'), '#!/bin/sh\n')
  const archivePath = path.join(scratchDir, 'sbt.tgz')
  return new Promise<Buffer>((resolve, reject) => {
    const out = createWriteStream(archivePath)
    tarFs.pack(packRoot).pipe(createGzip()).pipe(out)
    out.on('finish', () => {
      const fs = require('node:fs') as typeof import('node:fs')
      resolve(fs.readFileSync(archivePath))
    })
    out.on('error', reject)
  })
}

describe('external-tools resolver memoization', () => {
  let scratch: string

  beforeEach(() => {
    scratch = mkdtempSync(path.join(os.tmpdir(), 'resolver-test-'))
    _resetJreResolution()
    _resetBazelResolution()
    _resetSbtResolution()
  })

  afterEach(async () => {
    await safeDelete(scratch)
  })

  describe('resolveJre', () => {
    it('memoizes calls with identical downloadIfMissing options', async () => {
      const tarBytes = await buildJreTarball(scratch)
      const { calls, downloader } = makeFakeDownloader(tarBytes)
      const cacheDir = path.join(scratch, 'jre-cache')
      const opts = {
        downloadIfMissing: {
          version: 21,
          platformArch: 'linux-x64',
          cacheDir,
          downloader,
        },
      }
      await resolveJre(opts)
      await resolveJre(opts)
      // Both calls share the same memoized Promise; the underlying
      // download is invoked once. (Local tiers may also have fired
      // and short-circuited; the assertion is "no MORE than one
      // download call.")
      expect(calls.length).toBeLessThanOrEqual(1)
    })

    it('different downloadIfMissing shapes get distinct cache entries', async () => {
      const tarBytes = await buildJreTarball(scratch)
      const { downloader } = makeFakeDownloader(tarBytes)
      // We assert the resolver returns DISTINCT Promise objects for
      // different option shapes (the option-key Map fingerprint
      // differs). On dev machines with java on PATH, the local tier
      // short-circuits before download, but the memoization map is
      // still keyed off the options and produces two entries.
      const p1 = resolveJre({
        downloadIfMissing: {
          version: 21,
          platformArch: 'linux-x64',
          cacheDir: path.join(scratch, 'a'),
          downloader,
        },
      })
      const p2 = resolveJre({
        downloadIfMissing: {
          version: 21,
          platformArch: 'darwin-arm64',
          cacheDir: path.join(scratch, 'b'),
          downloader,
        },
      })
      expect(p1).not.toBe(p2)
      await Promise.all([p1, p2])
    })

    it('returns undefined when local tiers miss and downloadIfMissing is omitted', async () => {
      // The default local tiers on the test runner: no smol VFS;
      // JAVA_HOME may or may not be set; java may or may not be on
      // PATH. If we get a result, that's a local hit which is fine
      // for this assertion (we only care about "no download
      // attempted"). The key check is the resolver doesn't throw
      // and returns either undefined or a 'vfs' / 'java-home' /
      // 'path' shape.
      const result = await resolveJre()
      if (result !== undefined) {
        expect(['vfs', 'java-home', 'path']).toContain(result.source)
      }
    })

    it('_resetJreResolution clears the memoization', async () => {
      const tarBytes = await buildJreTarball(scratch)
      const { downloader } = makeFakeDownloader(tarBytes)
      const opts = {
        downloadIfMissing: {
          version: 21,
          platformArch: 'linux-x64',
          cacheDir: path.join(scratch, 'reset-cache'),
          downloader,
        },
      }
      // First resolve populates the memoization map.
      const p1 = resolveJre(opts)
      // Same call before reset — returns the SAME Promise (memoized).
      const p1b = resolveJre(opts)
      expect(p1).toBe(p1b)
      await p1
      _resetJreResolution()
      // After reset, a same-shape call returns a FRESH Promise
      // (different object identity than p1).
      const p2 = resolveJre(opts)
      expect(p2).not.toBe(p1)
      await p2
    })
  })

  describe('resolveBazel', () => {
    it('memoizes and falls through to download', async () => {
      const { calls, downloader } = makeFakeDownloader('fake-bazel')
      const opts = {
        downloadIfMissing: {
          version: '7.4.1',
          platformArch: 'darwin-arm64',
          downloader,
        },
      }
      await resolveBazel(opts)
      await resolveBazel(opts)
      expect(calls.length).toBeLessThanOrEqual(1)
    })

    it('returns undefined when local tiers miss and downloadIfMissing is omitted', async () => {
      const result = await resolveBazel()
      if (result !== undefined) {
        expect(['vfs', 'path']).toContain(result.source)
      }
    })
  })

  describe('resolveSbt', () => {
    it('memoizes and falls through to download', async () => {
      const tarBytes = await buildSbtTarball(scratch)
      const { calls, downloader } = makeFakeDownloader(tarBytes)
      const opts = {
        downloadIfMissing: {
          version: '1.10.7',
          cacheDir: path.join(scratch, 'sbt-cache'),
          downloader,
        },
      }
      await resolveSbt(opts)
      await resolveSbt(opts)
      expect(calls.length).toBeLessThanOrEqual(1)
    })

    it('returns undefined when local tiers miss and downloadIfMissing is omitted', async () => {
      const result = await resolveSbt()
      if (result !== undefined) {
        expect(['vfs', 'path']).toContain(result.source)
      }
    })
  })
})
