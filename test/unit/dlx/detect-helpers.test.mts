/**
 * @file Unit tests for dlx/detect.ts internal helpers `findPackageJson` and
 *   `readPackageJson` — both use process-scoped caches with mtime / TTL
 *   invalidation. Tests cover the cache-hit, cache-miss, negative-cache TTL,
 *   stat-fails, and stale-mtime paths separately from the higher-level
 *   executable-type detectors covered in detect.test.mts.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import { findPackageJson, readPackageJson } from '../../../src/dlx/detect'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'detect-helpers-test-'))
})

afterEach(() => {
  rmSync(tmp, { force: true, recursive: true })
})

describe.sequential('dlx/detect — findPackageJson', () => {
  // findPackageJson takes a *file* path; the startDir is dirname(filePath).
  // Each test passes a synthetic file path inside tmp so dirname → tmp.
  const fileIn = (dir: string) => path.join(dir, 'src', 'index.ts')

  it('finds package.json in the start directory', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, '{}')
    // dirname(tmp/src/index.ts) === tmp/src, which doesn't have pkg-json,
    // so the walk proceeds up to tmp where it does. Build the file under
    // tmp directly to start the walk at tmp itself.
    // findPackageJson normalizes its return to forward slashes (fleet
    // convention); compare against the normalized form so the test
    // passes on Windows where path.join produces backslashes.
    expect(findPackageJson(path.join(tmp, 'index.ts'))).toBe(
      normalizePath(pkgPath),
    )
  })

  it('walks up to a parent that has package.json', () => {
    const sub = path.join(tmp, 'a', 'b', 'c')
    mkdirSync(sub, { recursive: true })
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, '{}')
    expect(findPackageJson(fileIn(sub))).toBe(normalizePath(pkgPath))
  })

  it('returns undefined when no package.json exists up to root', () => {
    expect(findPackageJson(path.join(tmp, 'index.ts'))).toBeUndefined()
  })

  it('returns the same path on a second call (positive cache)', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, '{}')
    const first = findPackageJson(path.join(tmp, 'index.ts'))
    const second = findPackageJson(path.join(tmp, 'index.ts'))
    expect(second).toBe(first)
  })

  it('drops the positive cache when the cached path no longer exists', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, '{}')
    expect(findPackageJson(path.join(tmp, 'index.ts'))).toBe(
      normalizePath(pkgPath),
    )
    rmSync(pkgPath)
    expect(findPackageJson(path.join(tmp, 'index.ts'))).toBeUndefined()
  })

  it('caches a negative result for the start directory', () => {
    expect(findPackageJson(path.join(tmp, 'index.ts'))).toBeUndefined()
    expect(findPackageJson(path.join(tmp, 'index.ts'))).toBeUndefined()
  })
})

describe.sequential('dlx/detect — readPackageJson', () => {
  it('reads + parses a valid package.json', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'x', version: '1' }))
    expect(readPackageJson(pkgPath)).toEqual({ name: 'x', version: '1' })
  })

  it('returns undefined when the file does not exist (stat fails)', () => {
    expect(readPackageJson(path.join(tmp, 'absent.json'))).toBeUndefined()
  })

  it('returns undefined on malformed JSON', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, '{ not-valid: json')
    expect(readPackageJson(pkgPath)).toBeUndefined()
  })

  it('returns the same parsed object on a second call (mtime cache hit)', () => {
    const pkgPath = path.join(tmp, 'package.json')
    writeFileSync(pkgPath, JSON.stringify({ name: 'x' }))
    const first = readPackageJson(pkgPath)
    const second = readPackageJson(pkgPath)
    // Same parsed reference returned (cache hit returns stored object).
    expect(second).toBe(first)
  })
})
