/**
 * @file Unit tests for the BROWSER npm tarball reader. The fixtures are the
 *   same gzipped tars the Node twin is tested against, so a divergence between
 *   the two shows up here rather than in a downstream browser bundle.
 *   `DecompressionStream` is a web standard that Node 18+ also implements, so
 *   these run for real on the test runner - the gunzip is not stubbed.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  gunzipBytes,
  readNpmTarballEntries,
  readNpmTarballManifest,
} from '../../../../../../src/eco/npm/registry/tarball/browser.mjs'
import { readNpmTarballManifest as readManifestOnNode } from '../../../../../../src/eco/npm/registry/tarball/node.mjs'

import { makeNpmTarball, makePackageTarball, MANIFEST } from './util.mjs'

/**
 * Decode an entry's bytes for comparison against the fixture's source text.
 */
function textOf(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

describe('gunzipBytes', () => {
  test('round-trips a gzipped archive back to a tar image', async () => {
    const bytes = await makePackageTarball()
    const image = await gunzipBytes(bytes)
    // A tar image is a whole number of 512-byte blocks and carries the ustar
    // magic in the first header.
    assert.equal(image.byteLength % 512, 0)
    assert.equal(textOf(image.subarray(257, 262)), 'ustar')
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
      textOf(entries.find(e => e.name === 'index.mjs')!.bytes),
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

  test('reads nested paths', async () => {
    const bytes = await makeNpmTarball([
      { body: 'deep\n', name: 'package/lib/nested/deep.txt' },
    ])
    const entries = await readNpmTarballEntries(bytes)
    assert.deepEqual(
      entries.map(e => e.name),
      ['lib/nested/deep.txt'],
    )
  })

  test('reads a name too long for the 100-byte header field', async () => {
    const long = `${'d'.repeat(120)}.txt`
    const bytes = await makeNpmTarball([
      { body: 'long\n', name: `package/${long}` },
    ])
    const entries = await readNpmTarballEntries(bytes)
    assert.deepEqual(
      entries.map(e => e.name),
      [long],
    )
  })

  test('skips directory entries', async () => {
    const bytes = await makeNpmTarball([
      { name: 'package/lib', type: 'directory' },
      { body: 'body\n', name: 'package/lib/example.js' },
    ])
    const entries = await readNpmTarballEntries(bytes)
    assert.deepEqual(
      entries.map(e => e.name),
      ['lib/example.js'],
    )
  })

  test('skips an entry with fewer components than the strip count', async () => {
    const bytes = await makeNpmTarball([
      { body: 'root\n', name: 'toplevel.txt' },
      { body: 'kept\n', name: 'package/kept.txt' },
    ])
    const entries = await readNpmTarballEntries(bytes)
    assert.deepEqual(
      entries.map(e => e.name),
      ['kept.txt'],
    )
  })

  test('rejects bytes that are not gzip', async () => {
    await assert.rejects(
      readNpmTarballEntries(new Uint8Array([0x7b, 0x7d])),
      /gzip magic/,
    )
  })

  test('rejects an empty input', async () => {
    await assert.rejects(readNpmTarballEntries(new Uint8Array()), /gzip magic/)
  })

  test('rejects a symlink entry', async () => {
    const bytes = await makeNpmTarball([
      { linkname: 'package.json', name: 'package/link', type: 'symlink' },
    ])
    await assert.rejects(readNpmTarballEntries(bytes), /Symlink or hardlink/)
  })

  test('enforces the entry-count limit', async () => {
    const bytes = await makeNpmTarball([
      { body: 'first\n', name: 'package/first.txt' },
      { body: 'second\n', name: 'package/second.txt' },
    ])
    await assert.rejects(
      readNpmTarballEntries(bytes, { maxEntries: 1 }),
      /too many entries/,
    )
  })

  test('enforces the single-file size limit', async () => {
    const bytes = await makeNpmTarball([
      { body: 'x'.repeat(64), name: 'package/big.txt' },
    ])
    await assert.rejects(
      readNpmTarballEntries(bytes, { maxFileSize: 8 }),
      /File size exceeds limit/,
    )
  })

  test('enforces the total-size limit', async () => {
    const bytes = await makeNpmTarball([
      { body: 'x'.repeat(32), name: 'package/first.txt' },
      { body: 'y'.repeat(32), name: 'package/second.txt' },
    ])
    await assert.rejects(
      readNpmTarballEntries(bytes, { maxTotalSize: 40 }),
      /Total extracted size exceeds limit/,
    )
  })
})

describe('readNpmTarballManifest', () => {
  test('reads the manifest out of the archive', async () => {
    const manifest = await readNpmTarballManifest(await makePackageTarball())
    assert.equal(manifest!['name'], MANIFEST.name)
    assert.equal(manifest!['version'], MANIFEST.version)
  })

  test('agrees with the Node twin on the same bytes', async () => {
    const bytes = await makePackageTarball()
    assert.deepEqual(
      await readNpmTarballManifest(bytes),
      await readManifestOnNode(bytes),
    )
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

  test('returns undefined when package.json is JSON but not an object', async () => {
    const bytes = await makeNpmTarball([
      { body: '"just a string"', name: 'package/package.json' },
    ])
    assert.equal(await readNpmTarballManifest(bytes), undefined)
  })

  test('rejects bytes that are not gzip', async () => {
    await assert.rejects(
      readNpmTarballManifest(new Uint8Array([0x7b, 0x7d])),
      /gzip magic/,
    )
  })
})
