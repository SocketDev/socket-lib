/**
 * @file Shared fixture builders for the npm tarball tests. Real gzipped tars
 *   are built in memory with `tar-stream` plus the repo's own gzip compressor,
 *   so every case exercises a genuine archive without a network fetch and
 *   without a checked-in binary fixture.
 *   Both twins read these same bytes, which is the point: a fixture that only
 *   one of them could parse would hide exactly the drift these tests exist to
 *   catch.
 */

// @ts-expect-error - no type declarations
import tarStream from 'tar-stream'

import { createGzipCompressor } from '../../../../../../src/compression/gzip.mjs'
import { BufferConcat } from '../../../../../../src/primordials/buffer.mjs'

/**
 * The manifest baked into {@link makePackageTarball}.
 */
export const MANIFEST = { name: '@example/pkg', version: '7.0.0-pre.1' }

/**
 * One entry to write into a fixture archive. `type` and `linkname` are for the
 * cases that need a directory or a rejected symlink.
 */
export interface FixtureEntry {
  body?: string | undefined
  linkname?: string | undefined
  name: string
  type?: string | undefined
}

/**
 * Build a gzipped tar in memory from `entries`.
 */
export async function makeNpmTarball(
  entries: readonly FixtureEntry[],
): Promise<Uint8Array> {
  const pack = tarStream.pack()
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]!
    const header: Record<string, unknown> = { name: entry.name }
    if (entry.type) {
      header['type'] = entry.type
    }
    if (entry.linkname) {
      header['linkname'] = entry.linkname
    }
    pack.entry(header, entry.body ?? '')
  }
  pack.finalize()
  const gzip = createGzipCompressor()
  pack.pipe(gzip)
  const chunks: Buffer[] = []
  for await (const chunk of gzip) {
    chunks.push(chunk as Buffer)
  }
  return new Uint8Array(BufferConcat!(chunks))
}

/**
 * Build a tar in memory and STOP - no gzip layer.
 *
 * The fixture for "a caller handed us a plain tar", which both twins must
 * reject on the magic-byte check rather than by failing to decompress.
 */
export async function makeUncompressedTar(
  entries: readonly FixtureEntry[],
): Promise<Uint8Array> {
  const pack = tarStream.pack()
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]!
    pack.entry({ name: entry.name }, entry.body ?? '')
  }
  pack.finalize()
  const chunks: Buffer[] = []
  for await (const chunk of pack) {
    chunks.push(chunk as Buffer)
  }
  return new Uint8Array(BufferConcat!(chunks))
}

/**
 * The standard fixture: a package tarball with a manifest and one source file,
 * rooted at `package/` the way every npm tarball is.
 */
export async function makePackageTarball(): Promise<Uint8Array> {
  return await makeNpmTarball([
    { body: JSON.stringify(MANIFEST), name: 'package/package.json' },
    { body: 'export const answer = 42\n', name: 'package/index.mjs' },
  ])
}
