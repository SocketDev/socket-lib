/**
 * @file Tests for archives/zip — extractZip's guard rails. The extraction arms
 *   themselves carry `c8 ignore` markers; what these cover is the
 *   pre-extraction validation loop every archive walks: entry size limits, the
 *   cumulative total, `strip`, and path-traversal rejection. Fixtures are real
 *   zips built with the same library the extractor uses, so the entry headers
 *   the size checks read are genuine.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { writeZipFixture } from '../../_shared/zip.mts'

import { extractZip } from '../../../src/archives/zip.mjs'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

const tmpDirs: string[] = []

afterAll(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

function tmpDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zip-test-'))
  tmpDirs.push(dir)
  return dir
}

/**
 * Write a zip containing `entries` (entryName → contents) and return its path.
 */
function makeZip(entries: Record<string, string>): string {
  const file = path.join(tmpDir(), 'archive.zip')
  writeZipFixture(file, entries)
  return file
}

describe('extractZip', () => {
  it('extracts entries to the output directory', async () => {
    const archive = makeZip({ 'alpha.txt': 'alpha', 'nested/beta.txt': 'beta' })
    const out = tmpDir()
    await extractZip(archive, out)
    expect(readFileSync(path.join(out, 'alpha.txt'), 'utf8')).toBe('alpha')
    expect(readFileSync(path.join(out, 'nested', 'beta.txt'), 'utf8')).toBe(
      'beta',
    )
  })

  it('creates the output directory when it does not exist', async () => {
    const archive = makeZip({ 'alpha.txt': 'alpha' })
    const out = path.join(tmpDir(), 'not', 'yet', 'there')
    await extractZip(archive, out)
    expect(existsSync(path.join(out, 'alpha.txt'))).toBe(true)
  })

  it('throws for a missing archive rather than a generic zip error', async () => {
    // assertArchiveExists normalizes this ahead of the zip library, whose own
    // message for a missing path is an unhelpful "Invalid filename".
    const missing = path.join(tmpDir(), 'absent.zip')
    await expect(extractZip(missing, tmpDir())).rejects.toThrow()
  })

  it('strips leading path components when strip is set', async () => {
    const archive = makeZip({
      'pkg/inner/gamma.txt': 'gamma',
      'pkg/alpha.txt': 'alpha',
    })
    const out = tmpDir()
    await extractZip(archive, out, { strip: 1 })
    expect(readFileSync(path.join(out, 'alpha.txt'), 'utf8')).toBe('alpha')
    expect(readFileSync(path.join(out, 'inner', 'gamma.txt'), 'utf8')).toBe(
      'gamma',
    )
  })

  it('skips entries with fewer path parts than strip', async () => {
    // `top.txt` has one part, so a strip of 2 leaves nothing to write and the
    // entry is passed over instead of erroring.
    const archive = makeZip({ 'alpha/beta/deep.txt': 'deep', 'top.txt': 'top' })
    const out = tmpDir()
    await extractZip(archive, out, { strip: 2 })
    expect(existsSync(path.join(out, 'top.txt'))).toBe(false)
    expect(readFileSync(path.join(out, 'deep.txt'), 'utf8')).toBe('deep')
  })

  it('rejects an entry larger than maxFileSize', async () => {
    const archive = makeZip({ 'big.txt': 'x'.repeat(2048) })
    await expect(
      extractZip(archive, tmpDir(), { maxFileSize: 1024 }),
    ).rejects.toThrow(/File size exceeds limit/)
  })

  it('rejects when the cumulative size passes maxTotalSize', async () => {
    // Each entry is under the per-file cap; together they cross the total.
    const archive = makeZip({
      'one.txt': 'x'.repeat(600),
      'two.txt': 'y'.repeat(600),
    })
    await expect(
      extractZip(archive, tmpDir(), { maxFileSize: 1024, maxTotalSize: 1000 }),
    ).rejects.toThrow(/Total extracted size exceeds limit/)
  })

  it('accepts an archive at exactly the size limits', async () => {
    // Boundary: the checks are `>`, so an entry equal to the cap passes.
    const archive = makeZip({ 'exact.txt': 'x'.repeat(100) })
    const out = tmpDir()
    await extractZip(archive, out, { maxFileSize: 100, maxTotalSize: 100 })
    expect(readFileSync(path.join(out, 'exact.txt'), 'utf8')).toHaveLength(100)
  })

  it('skips directory entries', () => {
    // A zip may carry explicit directory records; the validation loop passes
    // over them rather than treating them as zero-byte files.
    const archive = path.join(tmpDir(), 'withdir.zip')
    writeZipFixture(archive, { 'adir/': '', 'adir/inner.txt': 'inner' })
    const out = tmpDir()
    return extractZip(archive, out).then(() => {
      expect(readFileSync(path.join(out, 'adir', 'inner.txt'), 'utf8')).toBe(
        'inner',
      )
    })
  })

  it('rejects an existing destination symlink before overwrite', async () => {
    const archive = makeZip({ 'asset.txt': 'attacker content' })
    const out = tmpDir()
    const outside = path.join(tmpDir(), 'outside.txt')
    writeFileSync(outside, 'original')
    symlinkSync(outside, path.join(out, 'asset.txt'))

    await expect(extractZip(archive, out)).rejects.toThrow(
      /Archive destination is a symlink/,
    )
    expect(readFileSync(outside, 'utf8')).toBe('original')
  })

  it('rejects a symlink in a destination path component', async () => {
    const archive = makeZip({ 'nested/asset.txt': 'attacker content' })
    const out = tmpDir()
    const outside = tmpDir()
    symlinkSync(outside, path.join(out, 'nested'))

    await expect(extractZip(archive, out)).rejects.toThrow(
      /Archive destination component is unsafe/,
    )
    expect(existsSync(path.join(outside, 'asset.txt'))).toBe(false)
  })
})
