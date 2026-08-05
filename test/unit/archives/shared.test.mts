/**
 * @file Tests for archives/shared — the shared archive guard rails.
 *   `validatePathWithinBase` is the unit that actually enforces the traversal
 *   guarantee for both the zip and tar extractors, so it is tested here
 *   directly. Driving it through a zip fixture is not possible: adm-zip strips
 *   `../` when an entry is added, so such a test passes because the fixture is
 *   harmless, not because the guard fired.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  assertArchiveExists,
  getAdmZip,
  getTarFs,
  validatePathWithinBase,
} from '../../../src/archives/shared.ts'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

const tmpDirs: string[] = []

afterAll(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir, { force: true })
  }
})

function tmpDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'archives-internal-'))
  tmpDirs.push(dir)
  return dir
}

describe('assertArchiveExists', () => {
  it('returns quietly for a file that exists', () => {
    const file = path.join(tmpDir(), 'archive.zip')
    writeFileSync(file, 'not really a zip')
    expect(() => assertArchiveExists(file)).not.toThrow()
  })

  it('throws an ENOENT-shaped error carrying the path', () => {
    // The extractors depend on this shape: callers branch on `code`, and the
    // zip library's own message for a missing file is an unhelpful
    // "Invalid filename".
    const missing = path.join(tmpDir(), 'absent.zip')
    let caught:
      | (Error & { code?: string | undefined; path?: string | undefined })
      | undefined
    try {
      assertArchiveExists(missing)
    } catch (e) {
      caught = e as Error & {
        code?: string | undefined
        path?: string | undefined
      }
    }
    expect(caught?.code).toBe('ENOENT')
    expect(caught?.path).toBe(missing)
    expect(caught?.message).toContain(missing)
  })
})

describe('validatePathWithinBase', () => {
  it('accepts a path nested inside the base', () => {
    const base = tmpDir()
    expect(() =>
      validatePathWithinBase(path.join(base, 'a', 'b.txt'), base, 'a/b.txt'),
    ).not.toThrow()
  })

  it('accepts the base directory itself', () => {
    // Equal-to-base is explicitly allowed; only escaping is rejected.
    const base = tmpDir()
    expect(() => validatePathWithinBase(base, base, '.')).not.toThrow()
  })

  it('rejects a path that climbs out of the base', () => {
    const base = tmpDir()
    expect(() =>
      validatePathWithinBase(
        path.join(base, '..', 'escaped.txt'),
        base,
        '../escaped.txt',
      ),
    ).toThrow(/Path traversal attempt detected/)
  })

  it('rejects a sibling directory sharing the base as a prefix', () => {
    // The `/base/dir` vs `/base/dir-evil` case: a bare startsWith without the
    // separator would let the sibling through.
    const base = path.join(tmpDir(), 'dir')
    expect(() =>
      validatePathWithinBase(`${base}-evil/file.txt`, base, 'file.txt'),
    ).toThrow(/Path traversal attempt detected/)
  })

  it('names the entry and both resolved paths in the error', () => {
    // The message is the operator's only clue about which entry was hostile.
    const base = tmpDir()
    expect(() =>
      validatePathWithinBase(
        path.join(base, '..', 'escaped.txt'),
        base,
        'evil-entry.txt',
      ),
    ).toThrow(/evil-entry\.txt/)
  })

  it('resolves relative inputs before comparing', () => {
    // Both arguments go through path.resolve, so a relative base still works.
    expect(() =>
      validatePathWithinBase('sub/file.txt', 'sub', 'file.txt'),
    ).not.toThrow()
    expect(() =>
      validatePathWithinBase('../outside.txt', 'sub', 'outside.txt'),
    ).toThrow(/Path traversal attempt detected/)
  })
})

describe('lazy library loaders', () => {
  it('getAdmZip returns the library and memoizes it', () => {
    // Lazy so importing the archives surface does not pull the bundled zip
    // library into every consumer's graph; memoized so repeated extracts do
    // not re-require it.
    const first = getAdmZip()
    expect(first).toBeDefined()
    expect(getAdmZip()).toBe(first)
  })

  it('getTarFs returns the library and memoizes it', () => {
    const first = getTarFs()
    expect(first).toBeDefined()
    expect(getTarFs()).toBe(first)
  })
})
