/**
 * @file The tar-format decoders both tarball twins share. The fixtures here are
 *   hand-built 512-byte blocks rather than archives from a packer, because the
 *   arms worth covering are the ones a packer does not emit on request: a GNU
 *   long-name block, a pax extended header, a pax GLOBAL header that must not
 *   be mistaken for one, a base-256 numeric field, and an entry name carrying a
 *   null byte. The sibling node and browser specs cover the real-archive path.
 */

import { describe, expect, it } from 'vitest'

import {
  readNumber,
  readPaxPath,
  readTarEntries,
  stripComponents,
  toForwardSlashes,
} from '../../../../../../src/eco/npm/registry/tarball/shared.mjs'

const BLOCK_SIZE = 512

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0, { length } = text; i < length; i += 1) {
    target[offset + i] = text.charCodeAt(i)
  }
}

// A tar numeric field: octal digits, zero-padded, NUL-terminated.
function octalField(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, '0')}\0`
}

interface HeaderFields {
  name?: string | undefined
  prefix?: string | undefined
  size?: number | undefined
  typeFlag?: string | undefined
}

// One 512-byte tar header. The checksum field is left zero because the reader
// under test does not verify it.
function tarHeader({
  name = '',
  prefix = '',
  size = 0,
  typeFlag = '0',
}: HeaderFields): Uint8Array {
  const header = new Uint8Array(BLOCK_SIZE)
  writeAscii(header, 0, name)
  writeAscii(header, 124, octalField(size, 12))
  writeAscii(header, 156, typeFlag)
  writeAscii(header, 345, prefix)
  return header
}

// The data blocks for `text`, padded out to the block size.
function tarData(text: string): Uint8Array {
  const blocks = Math.ceil(text.length / BLOCK_SIZE) * BLOCK_SIZE
  const data = new Uint8Array(blocks)
  writeAscii(data, 0, text)
  return data
}

// Concatenate blocks and close the archive with the two zero blocks tar ends
// on, so the reader stops where it should.
function tarImage(...parts: Uint8Array[]): Uint8Array {
  const trailer = new Uint8Array(BLOCK_SIZE * 2)
  const all = [...parts, trailer]
  let total = 0
  for (let i = 0, { length } = all; i < length; i += 1) {
    total += all[i]!.length
  }
  const image = new Uint8Array(total)
  let cursor = 0
  for (let i = 0, { length } = all; i < length; i += 1) {
    image.set(all[i]!, cursor)
    cursor += all[i]!.length
  }
  return image
}

// A pax record is `<len> <key>=<value>\n`, where len counts its own digits.
function paxRecord(body: string): string {
  const withoutLength = ` ${body}\n`
  let length = withoutLength.length + 1
  // The length digits are part of the count, so adding one can push it over a
  // digit boundary and change the count again.
  while (String(length).length + withoutLength.length !== length) {
    length = String(length).length + withoutLength.length
  }
  return `${length}${withoutLength}`
}

// A regular file entry, header plus data.
function fileEntry(fields: HeaderFields, body: string): Uint8Array[] {
  return [tarHeader({ ...fields, size: body.length }), tarData(body)]
}

describe('readNumber', () => {
  it('reads an octal field', () => {
    const block = new Uint8Array(12)
    writeAscii(block, 0, octalField(0o644, 12))

    expect(readNumber(block, 0, 12)).toBe(0o644)
  })

  it('reads the base-256 form GNU uses for large sizes', () => {
    // The high bit of the first byte flags the form; the rest is big-endian.
    const block = new Uint8Array(4)
    block[0] = 0x80
    block[1] = 0x00
    block[2] = 0x01
    block[3] = 0x00

    expect(readNumber(block, 0, 4)).toBe(256)
  })

  it('reads an all-spaces field as zero', () => {
    const block = new Uint8Array(12)
    writeAscii(block, 0, '           \0')

    expect(readNumber(block, 0, 12)).toBe(0)
  })

  it('reads a field that is not octal at all as zero', () => {
    const block = new Uint8Array(12)
    writeAscii(block, 0, 'not-a-number')

    expect(readNumber(block, 0, 12)).toBe(0)
  })
})

describe('readPaxPath', () => {
  function bytesOf(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length)
    writeAscii(bytes, 0, text)
    return bytes
  }

  it('reads the path record', () => {
    const record = paxRecord('path=deeply/nested/example.js')

    expect(readPaxPath(bytesOf(record))).toBe('deeply/nested/example.js')
  })

  it('walks past records that are not the path', () => {
    const records = `${paxRecord('mtime=1700000000')}${paxRecord('path=example.js')}`

    expect(readPaxPath(bytesOf(records))).toBe('example.js')
  })

  it('reports nothing when no record has a length separator', () => {
    expect(readPaxPath(bytesOf('path=example.js'))).toBeUndefined()
  })

  it('reports nothing when the length is not a positive number', () => {
    expect(readPaxPath(bytesOf('0 path=example.js\n'))).toBeUndefined()
  })

  it('reports nothing for an empty block', () => {
    expect(readPaxPath(new Uint8Array(0))).toBeUndefined()
  })
})

describe('readTarEntries', () => {
  it('takes the name from a GNU long-name block', () => {
    const longName = `${'nested/'.repeat(20)}example.js`
    const image = tarImage(
      tarHeader({
        name: '././@LongLink',
        size: longName.length,
        typeFlag: 'L',
      }),
      tarData(longName),
      ...fileEntry({ name: 'truncated-name' }, 'contents'),
    )

    const entries = readTarEntries(image)

    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe(longName)
  })

  it('takes the name from a pax extended header', () => {
    const record = paxRecord('path=pax/example.js')
    const image = tarImage(
      tarHeader({ name: 'PaxHeader', size: record.length, typeFlag: 'x' }),
      tarData(record),
      ...fileEntry({ name: 'ignored-name' }, 'contents'),
    )

    const entries = readTarEntries(image)

    expect(entries[0]!.name).toBe('pax/example.js')
  })

  it('leaves the next entry alone after a pax GLOBAL header', () => {
    // A global header applies to the archive, so reading it as a pending name
    // would rename the entry that follows it.
    const record = paxRecord('path=not-an-entry-name')
    const image = tarImage(
      tarHeader({ name: 'GlobalHead', size: record.length, typeFlag: 'g' }),
      tarData(record),
      ...fileEntry({ name: 'example.js' }, 'contents'),
    )

    const entries = readTarEntries(image)

    expect(entries[0]!.name).toBe('example.js')
  })

  it('joins the prefix field onto the name for a long ustar path', () => {
    const image = tarImage(
      ...fileEntry({ name: 'example.js', prefix: 'package/lib' }, 'contents'),
    )

    const entries = readTarEntries(image)

    expect(entries[0]!.name).toBe('package/lib/example.js')
  })

  it('refuses an entry name carrying a null byte', () => {
    // A pax record is read byte for byte, so it is the one way a null reaches
    // the name — the fixed header fields stop at the first one.
    const record = paxRecord('path=example\0.js')
    const image = tarImage(
      tarHeader({ name: 'PaxHeader', size: record.length, typeFlag: 'x' }),
      tarData(record),
      ...fileEntry({ name: 'ignored-name' }, 'contents'),
    )

    expect(() => readTarEntries(image)).toThrow(/null byte/)
  })
})

describe('stripComponents', () => {
  it('keeps the name when nothing is stripped', () => {
    expect(stripComponents('package/lib/example.js', 0)).toBe(
      'package/lib/example.js',
    )
  })

  it('drops the leading components', () => {
    expect(stripComponents('package/lib/example.js', 2)).toBe('example.js')
  })

  it('skips a name with fewer components than asked for', () => {
    expect(stripComponents('example.js', 1)).toBeUndefined()
  })

  it('skips a name that strips down to nothing', () => {
    // A directory entry ends in a separator, so stripping its one component
    // leaves an empty string rather than a path.
    expect(stripComponents('package/', 1)).toBeUndefined()
  })
})

describe('toForwardSlashes', () => {
  it('rewrites a smuggled backslash', () => {
    expect(toForwardSlashes('package\\lib\\example.js')).toBe(
      'package/lib/example.js',
    )
  })
})
