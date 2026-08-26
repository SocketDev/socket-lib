/**
 * @file Unit tests for turning npm tarball bytes back into files. Real
 *   gzipped tars are built in memory here with `tar-stream` plus the repo's
 *   own gzip compressor, so the cases exercise the actual archives path
 *   without a network fetch and without a checked-in binary fixture.
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, test } from 'vitest'

import {
  createNpmTarballScratchDir,
  extractNpmTarball,
  fetchAndExtractStagedTarball,
  gunzipBytes,
  readNpmTarballEntries,
  readNpmTarballManifest,
  withNpmTarballFile,
} from '../../../../../src/npm/registry/tarball/node.mjs'
import { readNpmTarballEntries as readEntriesInBrowser } from '../../../../../src/npm/registry/tarball/browser.mjs'
import { safeDelete } from '../../../../../src/fs/safe.mjs'
import { normalizePath } from '../../../../../src/paths/normalize.mjs'

import { runWithTempDir } from '../../../util/temp-file-helper.mjs'
import {
  makeNpmTarball,
  makePackageTarball,
  makeUncompressedTar,
  MANIFEST,
} from './tarball-helpers.mjs'

const AUTH = { token: 'tok' }

const STAGE_ID = '1de6f3db-2ed9-4d72-b3dd-8f0e2b474a2f'

/**
 * An adapter whose `bytes` answers `payload`.
 */
function bytesHttp(payload: Uint8Array) {
  return {
    http: {
      async bytes(): Promise<Uint8Array> {
        return payload
      },
      async json<T>(): Promise<T> {
        throw new Error('bytesHttp: json is not part of this test')
      },
      async text(): Promise<string> {
        throw new Error('bytesHttp: text is not part of this test')
      },
    },
  }
}

/**
 * An adapter whose `bytes` rejects with the given status.
 */
function failingBytesHttp(status?: number | undefined) {
  const error = () =>
    Object.assign(new Error('boom'), status === undefined ? {} : { status })
  return {
    http: {
      async bytes(): Promise<Uint8Array> {
        throw error()
      },
      async json<T>(): Promise<T> {
        throw error()
      },
      async text(): Promise<string> {
        throw error()
      },
    },
  }
}

describe('createNpmTarballScratchDir', () => {
  test('creates a directory that exists, normalized', async () => {
    const scratch = await createNpmTarballScratchDir()
    try {
      assert.equal(existsSync(scratch), true)
      assert.equal(scratch.includes('\\'), false)
    } finally {
      await safeDelete(scratch, { recursive: true })
    }
  })

  test('hands out a different directory each call', async () => {
    const first = await createNpmTarballScratchDir()
    const second = await createNpmTarballScratchDir()
    try {
      assert.notEqual(first, second)
    } finally {
      await safeDelete([first, second], { recursive: true })
    }
  })
})

describe('withNpmTarballFile', () => {
  test('writes the bytes to a .tgz the archives layer can detect', async () => {
    const bytes = await makePackageTarball()
    const seen = await withNpmTarballFile(bytes, async archivePath => {
      assert.equal(path.extname(archivePath), '.tgz')
      assert.equal(existsSync(archivePath), true)
      const onDisk = await readFile(archivePath)
      assert.deepEqual(Array.from(onDisk), Array.from(bytes))
      return archivePath
    })
    assert.equal(existsSync(seen), false)
  })

  test('removes the scratch directory when the callback throws', async () => {
    const bytes = await makePackageTarball()
    let archivePath = ''
    await assert.rejects(
      withNpmTarballFile(bytes, async seen => {
        archivePath = seen
        throw new Error('callback failed')
      }),
      Error,
    )
    assert.notEqual(archivePath, '')
    assert.equal(existsSync(archivePath), false)
  })

  test('rejects bytes that are not gzip before touching disk', async () => {
    await assert.rejects(
      withNpmTarballFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), async () => {
        throw new Error('the callback must never run')
      }),
      Error,
    )
  })

  test('rejects an empty body', async () => {
    await assert.rejects(
      withNpmTarballFile(new Uint8Array(0), async () => undefined),
      Error,
    )
  })

  test('rejects a tar that was never gzipped', async () => {
    const bytes = await makeUncompressedTar([
      { body: JSON.stringify(MANIFEST), name: 'package/package.json' },
    ])
    await assert.rejects(
      withNpmTarballFile(bytes, async () => undefined),
      Error,
    )
  })

  test('accepts a Uint8Array that is a view into a larger buffer', async () => {
    const bytes = await makePackageTarball()
    const padded = new Uint8Array(bytes.byteLength + 8)
    padded.set(bytes, 8)
    const view = new Uint8Array(padded.buffer, 8, bytes.byteLength)
    const ok = await withNpmTarballFile(view, async () => true)
    assert.equal(ok, true)
  })
})

describe('extractNpmTarball', () => {
  test('strips the package/ prefix by default', async () => {
    const bytes = await makePackageTarball()
    await runWithTempDir(async tempDir => {
      const outputDir = await extractNpmTarball(
        bytes,
        path.join(tempDir, 'out'),
      )
      assert.equal(existsSync(path.join(outputDir, 'package.json')), true)
      assert.equal(existsSync(path.join(outputDir, 'index.mjs')), true)
    })
  })

  test('keeps the package/ prefix when strip is 0', async () => {
    const bytes = await makePackageTarball()
    await runWithTempDir(async tempDir => {
      const outputDir = await extractNpmTarball(
        bytes,
        path.join(tempDir, 'out'),
        { strip: 0 },
      )
      assert.equal(
        existsSync(path.join(outputDir, 'package', 'package.json')),
        true,
      )
    })
  })

  test('returns a normalized output directory', async () => {
    const bytes = await makePackageTarball()
    await runWithTempDir(async tempDir => {
      const requested = `${tempDir}${path.sep}out${path.sep}`
      const outputDir = await extractNpmTarball(bytes, requested)
      assert.equal(outputDir, normalizePath(requested))
      assert.equal(existsSync(path.join(outputDir, 'package.json')), true)
    })
  })

  test('writes the file contents through intact', async () => {
    const bytes = await makePackageTarball()
    await runWithTempDir(async tempDir => {
      const outputDir = await extractNpmTarball(
        bytes,
        path.join(tempDir, 'out'),
      )
      const source = await readFile(path.join(outputDir, 'index.mjs'), 'utf8')
      assert.equal(source, 'export const answer = 42\n')
    })
  })

  test('rejects bytes that are not gzip', async () => {
    await runWithTempDir(async tempDir => {
      await assert.rejects(
        extractNpmTarball(
          new Uint8Array([0x00, 0x01, 0x02]),
          path.join(tempDir, 'out'),
        ),
        Error,
      )
    })
  })

  test('extracts a deep entry path without losing its directories', async () => {
    const bytes = await makeNpmTarball([
      { body: JSON.stringify(MANIFEST), name: 'package/package.json' },
      { body: 'nested\n', name: 'package/lib/deep/nested.txt' },
    ])
    await runWithTempDir(async tempDir => {
      const outputDir = await extractNpmTarball(
        bytes,
        path.join(tempDir, 'out'),
      )
      assert.equal(
        existsSync(path.join(outputDir, 'lib', 'deep', 'nested.txt')),
        true,
      )
    })
  })
})

describe('gunzipBytes', () => {
  test('round-trips a gzipped archive back to a tar image', async () => {
    const image = await gunzipBytes(await makePackageTarball())
    // A tar image is a whole number of 512-byte blocks and carries the ustar
    // magic in its first header.
    assert.equal(image.byteLength % 512, 0)
    assert.equal(new TextDecoder().decode(image.subarray(257, 262)), 'ustar')
  })

  test('rejects bytes that are not a gzip stream', async () => {
    await assert.rejects(gunzipBytes(new Uint8Array([0x1f, 0x8b, 0x08, 0x00])))
  })
})

describe('readNpmTarballEntries', () => {
  test('returns the regular files with the package/ prefix stripped', async () => {
    const entries = await readNpmTarballEntries(await makePackageTarball())
    assert.deepEqual(entries.map(e => e.name).toSorted(), [
      'index.mjs',
      'package.json',
    ])
    assert.equal(
      new TextDecoder().decode(
        entries.find(e => e.name === 'index.mjs')!.bytes,
      ),
      'export const answer = 42\n',
    )
  })

  test('strip: 0 keeps the package/ prefix', async () => {
    const entries = await readNpmTarballEntries(await makePackageTarball(), {
      strip: 0,
    })
    assert.deepEqual(entries.map(e => e.name).toSorted(), [
      'package/index.mjs',
      'package/package.json',
    ])
  })

  test('rejects bytes that are not gzip', async () => {
    await assert.rejects(
      readNpmTarballEntries(new Uint8Array([0x7b, 0x7d])),
      /gzip magic/,
    )
  })

  test('rejects a tar that was never gzipped', async () => {
    const bytes = await makeUncompressedTar([
      { body: JSON.stringify(MANIFEST), name: 'package/package.json' },
    ])
    await assert.rejects(readNpmTarballEntries(bytes), /gzip magic/)
  })

  test('enforces the entry-count limit', async () => {
    const bytes = await makeNpmTarball([
      { body: 'a\n', name: 'package/a.txt' },
      { body: 'b\n', name: 'package/b.txt' },
    ])
    await assert.rejects(
      readNpmTarballEntries(bytes, { maxEntries: 1 }),
      /too many entries/,
    )
  })

  test('agrees with the browser twin on the same bytes', async () => {
    const bytes = await makePackageTarball()
    assert.deepEqual(
      (await readNpmTarballEntries(bytes)).map(e => e.name).toSorted(),
      (await readEntriesInBrowser(bytes)).map(e => e.name).toSorted(),
    )
  })
})

describe('readNpmTarballManifest', () => {
  test('reads the manifest out of the archive', async () => {
    const bytes = await makePackageTarball()
    const manifest = await readNpmTarballManifest(bytes)
    assert.equal(manifest!['name'], '@example/pkg')
    assert.equal(manifest!['version'], '7.0.0-pre.1')
  })

  test('returns undefined when the archive holds no package.json', async () => {
    const bytes = await makeNpmTarball([
      { body: '# nothing useful\n', name: 'package/README.md' },
    ])
    assert.equal(await readNpmTarballManifest(bytes), undefined)
  })

  test('returns undefined when package.json is not valid JSON', async () => {
    const bytes = await makeNpmTarball([
      { body: 'not json at all', name: 'package/package.json' },
    ])
    assert.equal(await readNpmTarballManifest(bytes), undefined)
  })

  test('rejects bytes that are not gzip', async () => {
    await assert.rejects(
      readNpmTarballManifest(new Uint8Array([0x7b, 0x7d])),
      Error,
    )
  })
})

describe('fetchAndExtractStagedTarball', () => {
  test('downloads and unpacks in one step', async () => {
    const bytes = await makePackageTarball()
    await runWithTempDir(async tempDir => {
      const result = await fetchAndExtractStagedTarball(
        STAGE_ID,
        path.join(tempDir, 'out'),
        { ...bytesHttp(bytes), ...AUTH },
      )
      assert.equal(result.reachable, true)
      assert.equal(
        existsSync(path.join(result.outputDir!, 'package.json')),
        true,
      )
    })
  })

  test('passes extraction options through', async () => {
    const bytes = await makePackageTarball()
    await runWithTempDir(async tempDir => {
      const result = await fetchAndExtractStagedTarball(
        STAGE_ID,
        path.join(tempDir, 'out'),
        { ...bytesHttp(bytes), ...AUTH, strip: 0 },
      )
      assert.equal(
        existsSync(path.join(result.outputDir!, 'package', 'package.json')),
        true,
      )
    })
  })

  test('reports a 404 as reachable with no output directory', async () => {
    await runWithTempDir(async tempDir => {
      const result = await fetchAndExtractStagedTarball(
        STAGE_ID,
        path.join(tempDir, 'out'),
        { ...failingBytesHttp(404), ...AUTH },
      )
      assert.deepEqual(result, { outputDir: undefined, reachable: true })
      assert.equal(existsSync(path.join(tempDir, 'out')), false)
    })
  })

  test('reports an unreachable registry without creating the output dir', async () => {
    await runWithTempDir(async tempDir => {
      const result = await fetchAndExtractStagedTarball(
        STAGE_ID,
        path.join(tempDir, 'out'),
        { ...failingBytesHttp(), ...AUTH },
      )
      assert.deepEqual(result, { reachable: false })
      assert.equal(existsSync(path.join(tempDir, 'out')), false)
    })
  })

  test('throws when the registry answered but the bytes are unusable', async () => {
    await runWithTempDir(async tempDir => {
      await assert.rejects(
        fetchAndExtractStagedTarball(STAGE_ID, path.join(tempDir, 'out'), {
          ...bytesHttp(new Uint8Array([0x6e, 0x6f, 0x70, 0x65])),
          ...AUTH,
        }),
        Error,
      )
    })
  })
})
