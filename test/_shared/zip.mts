import { writeFileSync } from 'node:fs'

import { strToU8, zipSync } from 'fflate'

export function makeZipBytes(
  entries: Readonly<Record<string, string>>,
): Buffer {
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([name, contents]) => [
          name,
          strToU8(contents),
        ]),
      ),
    ),
  )
}

export function writeZipFixture(
  filePath: string,
  entries: Readonly<Record<string, string>>,
): Buffer {
  const bytes = makeZipBytes(entries)
  writeFileSync(filePath, bytes)
  return bytes
}

export function setZipDeclaredSize(
  archive: Buffer,
  entryName: string,
  size: number,
): void {
  const name = Buffer.from(entryName)
  for (let offset = 0; offset <= archive.length - 46; offset += 1) {
    if (archive.readUInt32LE(offset) !== 0x02_01_4b_50) {
      continue
    }
    const nameLength = archive.readUInt16LE(offset + 28)
    if (archive.subarray(offset + 46, offset + 46 + nameLength).equals(name)) {
      archive.writeUInt32LE(size, offset + 24)
      return
    }
  }
  throw new Error(`ZIP fixture entry not found: ${entryName}`)
}
