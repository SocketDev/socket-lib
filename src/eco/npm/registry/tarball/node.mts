/**
 * @file Turning npm tarball BYTES back into files, on Node.
 *   `../stage-tarball` downloads a staged version's archive and stops
 *   at the bytes, because it has to stay browser-safe. This module is the Node
 *   half: it takes those bytes and unpacks or inspects them.
 *   This twin is a SUPERSET of `./browser`, not a mirror of it. The in-memory
 *   readers - `readNpmTarballEntries`, `readNpmTarballManifest` - behave
 *   identically on both, because both delegate the header walk to `./shared`.
 *   The disk half - `extractNpmTarball`, `withNpmTarballFile`,
 *   `fetchAndExtractStagedTarball`, `createNpmTarballScratchDir` - has no
 *   browser meaning and exists only here.
 *   That asymmetry is why `./npm/registry/tarball` resolves HERE for every
 *   bundler and carries no `browser` condition. A condition that quietly
 *   swapped in the browser twin would drop four exports in browser builds only,
 *   turning a missing filesystem into a `TypeError` at call time. A browser
 *   consumer imports `@socketsecurity/lib/npm/registry/tarball/browser` and
 *   gets a compile-time answer instead.
 *   The disk path delegates to primitives the repo already owns.
 *   `extractTarGz` from `../../archives/tar` unpacks the archive, bringing the
 *   entry-count, file-size, total-size, null-byte, and symlink defenses with
 *   it, and `node:zlib` does the gunzip inside that path.
 *   `extractArchive` from `../../archives/extract` would work too, and it is
 *   the dispatcher a caller reaches for when the format is unknown. It is
 *   deliberately NOT used: it can also open zips, so importing it pulls
 *   `../../archives/zip` and adm-zip into the require graph of every consumer.
 *   An npm tarball is always a gzipped tar, already proven so before anything
 *   touches disk, and there is nothing left for a format detector to decide.
 *   Cross-platform: nothing shells out to a `tar` binary, every path is built
 *   with `node:path` and run through `normalizePath`, and the scratch directory
 *   comes from the OS temp dir. Windows included.
 *   Why bytes have to reach disk at all: the archives extractors read a FILE.
 *   So the bytes are written to a scratch `.tgz`, extracted, and the scratch
 *   directory is removed in a `finally` whether the extraction succeeded or
 *   threw.
 */

import { extractTarGz } from '../../../../archives/tar.mjs'
import { decompressGzip } from '../../../../compression/gzip.mjs'
import { safeDelete } from '../../../../fs/safe.mjs'
import { getNodeFsPromises } from '../../../../node/fs-promises.mjs'
import { getNodePath } from '../../../../node/path.mjs'
import { normalizePath } from '../../../../paths/normalize.mjs'
import { getOsTmpDir } from '../../../../paths/socket.mjs'
import { BufferFrom } from '../../../../primordials/buffer.mjs'
import { JSONParse } from '../../../../primordials/json.mjs'
import { fetchStagedTarball } from '../stage-tarball.mjs'

import {
  isGzipBytes,
  newNotGzipError,
  NPM_TARBALL_STRIP,
  readTarEntries,
} from './shared.mjs'

import type { ExtractOptions } from '../../../../archives/types.mjs'
import type { NpmAuthOptions, NpmRegistryHttpOptions } from '../client.mjs'
import type { NpmTarballEntry } from './shared.mjs'

export type { NpmTarballEntry } from './shared.mjs'

/**
 * The result of downloading a staged tarball and unpacking it.
 */
export interface NpmStagedTarballExtraction {
  /**
   * Where the archive was unpacked. Absent on a reachable 404, and absent
   * whenever `reachable` is false.
   */
  readonly outputDir?: string | undefined
  /**
   * False when the registry could not be asked, carried straight through from
   * {@link fetchStagedTarball}. Distinct from a reachable read with no
   * `outputDir`, which means npm answered 404.
   */
  readonly reachable: boolean
}

/**
 * Create a private scratch directory under the OS temp dir.
 *
 * `mkdtemp` picks the random suffix, so two concurrent extractions never share
 * a directory and neither can clobber the other's archive.
 */
export async function createNpmTarballScratchDir(): Promise<string> {
  const fsPromises = getNodeFsPromises()
  const path = getNodePath()
  return normalizePath(
    await fsPromises.mkdtemp(path.join(getOsTmpDir(), 'socket-npm-tarball-')),
  )
}

/**
 * Unpack npm tarball bytes into a directory.
 *
 * `bytes` is a gzipped tar exactly as the registry sent it. The security
 * limits of `extractTarGz` apply: entry count, single-file size, total size,
 * null bytes in names, and symlink or hardlink entries are all rejected. The
 * defaults come from `../../archives/shared` and any of them can be overridden
 * through `options`.
 *
 * Returns the normalized output directory.
 *
 * @throws {Error} When `bytes` is not a gzip archive, or the extractor trips
 *   one of its limits.
 */
export async function extractNpmTarball(
  bytes: Uint8Array,
  outputDir: string,
  options?: ExtractOptions | undefined,
): Promise<string> {
  const opts = {
    __proto__: null,
    strip: NPM_TARBALL_STRIP,
    ...options,
  } as ExtractOptions
  const normalizedOutputDir = normalizePath(outputDir)
  await withNpmTarballFile(bytes, async archivePath => {
    await extractTarGz(archivePath, normalizedOutputDir, opts)
  })
  return normalizedOutputDir
}

/**
 * Download a staged version's tarball and unpack it in one step.
 *
 * The convenience a maintainer reviewing a staged release actually wants: go
 * from a stage id to the files on disk without handling bytes in between.
 *
 * The registry read stays FAIL-OPEN. An unreachable registry answers
 * `reachable: false` and nothing is written, so an empty output directory can
 * never be mistaken for a package that happens to contain nothing. Extraction
 * failures are different and THROW: the registry was reached and answered, so
 * the archive being unusable is a fact worth raising, not a reachability
 * question.
 */
export async function fetchAndExtractStagedTarball(
  stageId: string,
  outputDir: string,
  options: NpmRegistryHttpOptions & NpmAuthOptions & ExtractOptions,
): Promise<NpmStagedTarballExtraction> {
  const opts = { __proto__: null, ...options } as typeof options
  const read = await fetchStagedTarball(stageId, opts)
  if (!read.reachable) {
    return { reachable: false }
  }
  if (!read.bytes) {
    return { outputDir: undefined, reachable: true }
  }
  return {
    outputDir: await extractNpmTarball(read.bytes, outputDir, opts),
    reachable: true,
  }
}

/**
 * Gunzip bytes with `node:zlib`.
 *
 * The Node counterpart of the browser twin's `DecompressionStream` path. Both
 * return the decompressed image as a `Uint8Array` so `./shared` can walk it
 * without caring which one produced it.
 *
 * @throws {Error} When the bytes are not a valid gzip stream.
 */
export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await decompressGzip(
      BufferFrom!(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ),
  )
}

/**
 * Read the regular files out of npm tarball bytes, in memory.
 *
 * Nothing touches disk. One leading path component is stripped by default,
 * because every npm tarball roots its files under `package/`; pass `strip: 0`
 * to keep it.
 *
 * The security limits of `./shared` apply: entry count, single-file size,
 * total size, null bytes in names, and symlink or hardlink entries are all
 * rejected.
 *
 * @throws {Error} When `bytes` is not a gzip archive, or the reader trips one
 *   of its limits.
 */
export async function readNpmTarballEntries(
  bytes: Uint8Array,
  options?: ExtractOptions | undefined,
): Promise<NpmTarballEntry[]> {
  if (!isGzipBytes(bytes)) {
    throw newNotGzipError(bytes.byteLength)
  }
  const opts = {
    __proto__: null,
    strip: NPM_TARBALL_STRIP,
    ...options,
  } as ExtractOptions
  return readTarEntries(await gunzipBytes(bytes), opts)
}

/**
 * Read the `package.json` out of npm tarball bytes.
 *
 * The cheapest useful inspection of a staged artifact: confirm the name and
 * version inside the archive match the ones the staging record claims. Nothing
 * reaches disk - the archive is walked in memory - so the caller is left with
 * the manifest and nothing else.
 *
 * Returns `undefined` when the archive holds no `package.json`, and when the
 * one it holds is not valid JSON or does not decode to an object. That is an
 * answer about bytes the caller already has, not about a registry that could
 * not be reached, so there is nothing ambiguous to report.
 *
 * @throws {Error} When `bytes` is not a gzip archive, or the reader trips one
 *   of its limits.
 */
export async function readNpmTarballManifest(
  bytes: Uint8Array,
  options?: ExtractOptions | undefined,
): Promise<Record<string, unknown> | undefined> {
  const entries = await readNpmTarballEntries(bytes, options)
  const manifest = entries.find(entry => entry.name === 'package.json')
  if (!manifest) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSONParse(new TextDecoder('utf-8').decode(manifest.bytes))
  } catch {
    return undefined
  }
  return parsed === null || typeof parsed !== 'object'
    ? undefined
    : (parsed as Record<string, unknown>)
}

/**
 * Write tarball bytes to a scratch `.tgz`, run `fn` against that path, then
 * remove the scratch directory.
 *
 * The archives extractors read a file, so the bytes have to land somewhere.
 * The gzip magic is checked FIRST, before any directory is created: a caller
 * that decoded the download as text arrives here with substituted bytes, and
 * naming that is far more useful than letting the extractor fail on a stream
 * it cannot parse.
 *
 * @throws {Error} When `bytes` is not a gzip archive.
 */
export async function withNpmTarballFile<T>(
  bytes: Uint8Array,
  fn: (archivePath: string) => Promise<T>,
): Promise<T> {
  if (!isGzipBytes(bytes)) {
    throw newNotGzipError(bytes.byteLength)
  }
  const fsPromises = getNodeFsPromises()
  const path = getNodePath()
  const scratch = await createNpmTarballScratchDir()
  const archivePath = normalizePath(path.join(scratch, 'package.tgz'))
  try {
    await fsPromises.writeFile(archivePath, bytes)
    return await fn(archivePath)
  } finally {
    await safeDelete(scratch, { recursive: true })
  }
}
