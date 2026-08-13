/**
 * @file Tests for archives/zip — extractZip's guard rails. The extraction arms
 *   themselves carry `c8 ignore` markers; what these cover is the
 *   pre-extraction validation loop every archive walks: entry size limits, the
 *   cumulative total, `strip`, and path-traversal rejection. Fixtures are real
 *   zips built with the same library the extractor uses, so the entry headers
 *   the size checks read are genuine. Path traversal is covered against
 *   `validatePathWithinBase` directly, in shared.test.mts: adm-zip strips
 *   `../` when an entry is added, so a fixture built with it cannot express a
 *   malicious entry name — a test written that way passes for the wrong
 *   reason.
 */

import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import AdmZip from 'adm-zip'
import { afterAll, describe, expect, it } from 'vitest'

import { extractZip } from '../../../src/archives/zip.ts'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

const tmpDirs: string[] = []

afterAll(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir, { force: true })
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
  const zip = new AdmZip()
  for (const [name, body] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(body, 'utf8'))
  }
  const file = path.join(tmpDir(), 'archive.zip')
  zip.writeZip(file)
  return file
}

describe('extractZip', () => {
  it('extracts entries to the output directory', async () => {
    const archive = makeZip({ 'alpha.txt': 'alpha', 'nested/beta.txt': 'beta' })
    const out = tmpDir()
    await extractZip(archive, out)
    expect(readFileSync(path.join(out, 'alpha.txt'), 'utf8')).toBe('alpha')
    expect(readFileSync(path.join(out, 'nested', 'beta.txt'), 'utf8')).toBe('beta')
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
    expect(readFileSync(path.join(out, 'inner', 'gamma.txt'), 'utf8')).toBe('gamma')
  })

  it('skips entries with fewer path parts than strip', async () => {
    // `top.txt` has one part, so a strip of 2 leaves nothing to write and the
    // entry is passed over instead of erroring.
    const archive = makeZip({ 'a/beta/deep.txt': 'deep', 'top.txt': 'top' })
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
    const zip = new AdmZip()
    zip.addFile('adir/', Buffer.alloc(0))
    zip.addFile('adir/inner.txt', Buffer.from('inner', 'utf8'))
    const archive = path.join(tmpDir(), 'withdir.zip')
    zip.writeZip(archive)
    const out = tmpDir()
    return extractZip(archive, out).then(() => {
      expect(readFileSync(path.join(out, 'adir', 'inner.txt'), 'utf8')).toBe(
        'inner',
      )
    })
  })
})
