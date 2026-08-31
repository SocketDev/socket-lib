/**
 * @file The pure-bytes half of the npm tarball readers, private to this
 *   directory. An npm tarball is a gzipped tar, and only the GUNZIP step needs
 *   a platform primitive - `node:zlib` on Node, `DecompressionStream` in a
 *   browser. Everything after that is reading 512-byte headers out of a
 *   `Uint8Array`, which is identical on both, so it lives here and both twins
 *   import it. The tar reader is hand-written rather than delegated to
 *   `../../archives/tar` because that module extracts a FILE to a DIRECTORY
 *   through `tar-fs`, and a browser has neither. No dependency is added: a
 *   ustar reader is a header walk, and the two extensions npm actually emits -
 *   GNU `L` long names and pax `x` records - are a few dozen lines on top. The
 *   security limits mirror `../../archives/tar` deliberately - entry count,
 *   single-file size, total size, null bytes in names, and link entries are all
 *   rejected here too. A browser caller writing entries into OPFS or a zip is
 *   exposed to the same archive bombs a disk extractor is, so the in-memory
 *   path must not be the soft one.
 */

import {
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_TOTAL_SIZE,
} from '../../../../archives/types.mjs'
import { Uint8ArrayCtor } from '../../../../primordials/array.mjs'
import { ErrorCtor } from '../../../../primordials/error.mjs'
import {
  StringPrototypeIndexOf,
  StringPrototypeReplaceAll,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
  StringPrototypeTrim,
} from '../../../../primordials/string.mjs'

import type { ExtractOptions } from '../../../../archives/types.mjs'

/**
 * A tar block is 512 bytes, header included, and every file's data is padded
 * up to the next multiple of it.
 */
const BLOCK_SIZE = 512

/**
 * The gzip magic bytes, `0x1f 0x8b`. Checked before a decompressor is handed
 * anything so a text-corrupted download is named as such.
 */
const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

/**
 * Every npm tarball roots its files under a single `package/` directory, so
 * one component is stripped by default and the read tree starts at the
 * package's own `package.json`. Pass `strip: 0` to keep the prefix.
 */
export const NPM_TARBALL_STRIP = 1

/**
 * One regular file read out of a tar archive.
 */
export interface NpmTarballEntry {
  /**
   * The file's bytes.
   */
  readonly bytes: Uint8Array
  /**
   * The entry's path with `strip` leading components removed, normalized to
   * forward slashes.
   */
  readonly name: string
}

/**
 * Do these bytes start with the gzip magic `0x1f 0x8b`?
 *
 * Both twins reject a corrupted download on this check BEFORE handing it to a
 * decompressor, whose own error would name a stream problem rather than the
 * text-adapter mistake that actually caused it.
 */
export function isGzipBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1
  )
}

/**
 * Is this block entirely NUL bytes? Two of them in a row terminate the archive.
 */
export function isZeroBlock(block: Uint8Array): boolean {
  for (let i = 0; i < BLOCK_SIZE; i += 1) {
    if (block[i] !== 0) {
      return false
    }
  }
  return true
}

/**
 * The error both twins throw when handed something that is not a gzip archive.
 *
 * Shared so the Node and browser paths cannot drift into describing the same
 * mistake two different ways.
 */
export function newNotGzipError(byteLength: number): Error {
  return new ErrorCtor(
    `expected a gzipped tar, received ${byteLength} byte(s) whose first two are not the gzip magic 0x1f 0x8b. An npm tarball read through a text adapter arrives corrupted, because UTF-8 decoding substitutes every invalid sequence instead of failing. Fetch it with the adapter's bytes method - fetchStagedTarball does.`,
  )
}

/**
 * Decode a tar numeric field.
 *
 * Historically these are octal ASCII. GNU added a base-256 form for sizes that
 * outgrew the field, flagged by the high bit of the first byte, and a tarball
 * carrying a file over 8 GiB would use it.
 */
export function readNumber(
  block: Uint8Array,
  offset: number,
  size: number,
): number {
  if ((block[offset]! & 0x80) !== 0) {
    let value = 0
    for (let i = offset + 1; i < offset + size; i += 1) {
      value = value * 256 + block[i]!
    }
    return value
  }
  const text = StringPrototypeTrim(readString(block, offset, size))
  if (text === '') {
    return 0
  }
  const value = Number.parseInt(text, 8)
  return Number.isFinite(value) ? value : 0
}

/**
 * The `path=` value of a pax extended header record, when it carries one.
 *
 * Each record is `<len> <key>=<value>\n`, where `len` counts its own digits.
 */
export function readPaxPath(bytes: Uint8Array): string | undefined {
  let text = ''
  for (let i = 0, { length } = bytes; i < length; i += 1) {
    text += String.fromCharCode(bytes[i]!)
  }
  let cursor = 0
  while (cursor < text.length) {
    const space = StringPrototypeIndexOf(text, ' ', cursor)
    if (space === -1) {
      break
    }
    const length = Number.parseInt(
      StringPrototypeSlice(text, cursor, space),
      10,
    )
    if (!Number.isFinite(length) || length <= 0) {
      break
    }
    const record = StringPrototypeSlice(text, space + 1, cursor + length - 1)
    if (StringPrototypeStartsWith(record, 'path=')) {
      return StringPrototypeSlice(record, 5)
    }
    cursor += length
  }
  return undefined
}

/**
 * Decode a NUL-terminated ASCII field out of a tar header.
 */
export function readString(
  block: Uint8Array,
  offset: number,
  size: number,
): string {
  let end = offset
  const limit = offset + size
  while (end < limit && block[end] !== 0) {
    end += 1
  }
  let out = ''
  for (let i = offset; i < end; i += 1) {
    out += String.fromCharCode(block[i]!)
  }
  return out
}

/**
 * Read the regular files out of an UNCOMPRESSED tar image.
 *
 * `bytes` is the gunzipped image; gunzipping is the caller's job because it is
 * the one step that differs per platform. Directories and the metadata entries
 * that carry long names are consumed but never returned - only regular files
 * come back.
 *
 * The limits from `options` are enforced as the walk proceeds, so an archive
 * bomb is rejected on the entry that trips the limit rather than after the
 * whole thing has been materialized.
 *
 * @throws {Error} When an entry count, file size, or total size limit is
 *   exceeded, when an entry name contains a null byte, or when the archive
 *   holds a symlink or hardlink entry.
 */
export function readTarEntries(
  bytes: Uint8Array,
  options?: ExtractOptions | undefined,
): NpmTarballEntry[] {
  const {
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    strip = 0,
  } = { __proto__: null, ...options } as ExtractOptions
  const entries: NpmTarballEntry[] = []
  let offset = 0
  let entryCount = 0
  let totalSize = 0
  let zeroBlocks = 0
  // Set by a GNU `L` block or a pax `x` record, and consumed by the very next
  // file header, whose own name field is then ignored.
  let pendingName: string | undefined
  while (offset + BLOCK_SIZE <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK_SIZE)
    offset += BLOCK_SIZE
    if (isZeroBlock(header)) {
      zeroBlocks += 1
      if (zeroBlocks === 2) {
        break
      }
      continue
    }
    zeroBlocks = 0
    const size = readNumber(header, 124, 12)
    const dataBlocks = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
    const typeFlag = readString(header, 156, 1)
    // GNU long name: this block's DATA is the next entry's path.
    if (typeFlag === 'L') {
      pendingName = readString(bytes, offset, size)
      offset += dataBlocks
      continue
    }
    // pax extended header: a `path=` record overrides the next entry's path.
    if (typeFlag === 'X' || typeFlag === 'x') {
      pendingName = readPaxPath(bytes.subarray(offset, offset + size))
      offset += dataBlocks
      continue
    }
    // A pax GLOBAL header applies to the whole archive, not the next entry, so
    // it must not be read as a pending name.
    if (typeFlag === 'g') {
      offset += dataBlocks
      continue
    }
    const prefix = readString(header, 345, 155)
    const base = readString(header, 0, 100)
    const rawName = pendingName ?? (prefix === '' ? base : `${prefix}/${base}`)
    pendingName = undefined
    if (StringPrototypeIndexOf(rawName, '\0') !== -1) {
      throw new ErrorCtor(`Invalid null byte in archive entry name: ${rawName}`)
    }
    if (typeFlag === '1' || typeFlag === '2') {
      throw new ErrorCtor(
        `Symlink or hardlink entries are not allowed: ${rawName}`,
      )
    }
    // Directories and other non-regular types carry no bytes worth returning.
    // ustar spells a regular file '0', and older archives leave the field NUL.
    if (typeFlag !== '' && typeFlag !== '0') {
      offset += dataBlocks
      continue
    }
    entryCount += 1
    if (entryCount > maxEntries) {
      throw new ErrorCtor(
        `Archive has too many entries: exceeded limit of ${maxEntries}`,
      )
    }
    if (size > maxFileSize) {
      throw new ErrorCtor(
        `File size exceeds limit: ${rawName} (${size} bytes > ${maxFileSize} bytes)`,
      )
    }
    totalSize += size
    if (totalSize > maxTotalSize) {
      throw new ErrorCtor(
        `Total extracted size exceeds limit: ${totalSize} bytes > ${maxTotalSize} bytes`,
      )
    }
    const stripped = stripComponents(toForwardSlashes(rawName), strip)
    if (stripped !== undefined) {
      // Copy rather than subarray so a returned entry does not pin the whole
      // decompressed image alive once the caller drops it.
      entries.push({
        bytes: new Uint8ArrayCtor(bytes.subarray(offset, offset + size)),
        name: stripped,
      })
    }
    offset += dataBlocks
  }
  return entries
}

/**
 * Drop `count` leading path components, the way `tar --strip-components` does.
 * An entry with fewer components than that is skipped by returning undefined.
 */
export function stripComponents(
  name: string,
  count: number,
): string | undefined {
  if (count <= 0) {
    return name
  }
  let cursor = 0
  for (let i = 0; i < count; i += 1) {
    const slash = StringPrototypeIndexOf(name, '/', cursor)
    if (slash === -1) {
      return undefined
    }
    cursor = slash + 1
  }
  const rest = StringPrototypeSlice(name, cursor)
  return rest === '' ? undefined : rest
}

/**
 * Force an entry path to forward slashes.
 *
 * `paths/normalize` does this too, but it reaches `constants/platform` and so
 * `node:fs`, which no browser path may touch. Tar names are POSIX by spec
 * anyway, so this only matters for a malformed or hostile archive that smuggles
 * a backslash past a Windows caller splitting on separators.
 */
export function toForwardSlashes(name: string): string {
  return StringPrototypeReplaceAll(name, '\\', '/')
}
