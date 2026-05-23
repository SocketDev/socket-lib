/**
 * @file Unit tests for packages/isolation.ts — pure-ish helpers
 *   `mergePackageJson` and `resolveRealPath`. The orchestrator `isolatePackage`
 *   spawns npm and is covered by integration tests; these helpers don't.
 */

import { mkdtempSync, promises as fsp, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  mergePackageJson,
  resolveRealPath,
} from '../../../src/packages/isolation'
import { safeDelete } from '../../../src/fs/safe'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'isolation-test-'))
})

afterEach(async () => {
  await safeDelete(tmp)
})

describe('packages/isolation — mergePackageJson', () => {
  it('returns the parsed pkgJson as-is when originalPkgJson is undefined', async () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'a', version: '1' }))
    const result = await mergePackageJson(pkgPath, undefined)
    expect(result).toEqual({ name: 'a', version: '1' })
  })

  it('merges original on top of parsed pkgJson (parsed wins on conflict)', async () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'parsed', version: '2.0.0' }))
    const original = {
      name: 'original',
      description: 'kept',
    }
    const result = await mergePackageJson(pkgPath, original)
    // Parsed file value wins for `name`/`version`; `description` from
    // original is preserved.
    expect(result.name).toBe('parsed')
    expect(result.version).toBe('2.0.0')
    expect(result.description).toBe('kept')
  })

  it('throws a contextual error when the file is missing', async () => {
    const pkgPath = path.join(tmp, 'absent.json')
    await expect(mergePackageJson(pkgPath, undefined)).rejects.toThrow(
      /Failed to parse/,
    )
  })

  it('throws a contextual error on malformed JSON', async () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, 'not-json{{{')
    await expect(mergePackageJson(pkgPath, undefined)).rejects.toThrow(
      /Failed to parse/,
    )
  })
})

describe('packages/isolation — resolveRealPath', () => {
  it('returns the realpath of an existing file', async () => {
    const filePath = path.join(tmp, 'file.txt')
    writeFileSync(filePath, 'hi')
    const resolved = await resolveRealPath(filePath)
    // realpath canonicalizes the OS tmpdir; assert it ends with the
    // tail component to avoid /private/var/folders vs /var/folders
    // platform divergence.
    expect(resolved.endsWith('file.txt')).toBe(true)
  })

  it('falls back to path.resolve when the target does not exist', async () => {
    const absent = path.join(tmp, 'does-not-exist.txt')
    const resolved = await resolveRealPath(absent)
    // No realpath available; fallback returns an absolute path.
    expect(path.isAbsolute(resolved)).toBe(true)
    expect(resolved.endsWith('does-not-exist.txt')).toBe(true)
  })

  it('returns realpath for a symlink target (POSIX)', async () => {
    if (process.platform === 'win32') {
      return
    }
    const target = path.join(tmp, 'real.txt')
    writeFileSync(target, 'x')
    const link = path.join(tmp, 'link.txt')
    await fsp.symlink(target, link)
    const resolved = await resolveRealPath(link)
    // realpath follows the symlink → resolved tail is `real.txt`, not link.txt.
    expect(resolved.endsWith('real.txt')).toBe(true)
  })
})
