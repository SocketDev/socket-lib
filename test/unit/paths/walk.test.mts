/**
 * @file Tests for paths/walk — the walkUp ancestor generator.
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { normalizeWalkDir, walkUp } from '../../../src/paths/walk'

describe('normalizeWalkDir', () => {
  it('preserves the root slash on a bare Windows drive letter', () => {
    expect(normalizeWalkDir('D:\\')).toBe('D:/')
    expect(normalizeWalkDir('C:\\')).toBe('C:/')
  })

  it('normalizes backslashes and leaves non-root paths slash-free', () => {
    expect(normalizeWalkDir('C:\\a\\b')).toBe('C:/a/b')
    expect(normalizeWalkDir('/a/b/c')).toBe('/a/b/c')
  })

  it('leaves a posix root unchanged', () => {
    expect(normalizeWalkDir('/')).toBe('/')
  })
})

// On Windows, `path.resolve('/a/b/c')` returns `D:\a\b\c` (current drive).
// walkUp yields the normalized form `D:/a/b/c`. Strip the drive prefix on
// Windows so the assertion compares the path tail, not the drive letter.
const DRIVE_PREFIX =
  process.platform === 'win32'
    ? path.parse(path.resolve('/')).root.replace(/\\/g, '/').replace(/\/$/, '')
    : ''
const withDrive = (p: string): string => `${DRIVE_PREFIX}${p}`

describe('walkUp', () => {
  it('yields the start dir then each ancestor up to root', () => {
    const start = path.resolve('/a/b/c')
    const got = [...walkUp(start)]
    // First entry is the start dir; last is the filesystem root.
    expect(got[0]).toBe(withDrive('/a/b/c'))
    expect(got).toContain(withDrive('/a/b'))
    expect(got).toContain(withDrive('/a'))
    expect(got.at(-1)).toBe(path.parse(start).root.replace(/\\/g, '/'))
  })

  it('stops (inclusive) at stopAt', () => {
    const got = [...walkUp('/a/b/c', { stopAt: '/a' })]
    expect(got).toStrictEqual([
      withDrive('/a/b/c'),
      withDrive('/a/b'),
      withDrive('/a'),
    ])
  })

  it('resolves a relative from against cwd', () => {
    const got = [...walkUp('b/c', { cwd: '/a' })]
    expect(got[0]).toBe(withDrive('/a/b/c'))
    expect(got).toContain(withDrive('/a/b'))
    expect(got).toContain(withDrive('/a'))
  })

  it('terminates at root even with no stopAt', () => {
    const got = [...walkUp('/x')]
    expect(got.at(-1)).toBe(
      path.parse(path.resolve('/x')).root.replace(/\\/g, '/'),
    )
    // No duplicate root at the tail.
    expect(got.filter(d => d === got.at(-1))).toHaveLength(1)
  })

  it('a start AT the stopAt yields just that one dir', () => {
    expect([...walkUp('/a', { stopAt: '/a' })]).toStrictEqual(['/a'])
  })

  it('is lazy — can break early without computing the whole chain', () => {
    let count = 0
    for (const _dir of walkUp('/a/b/c/d/e')) {
      count += 1
      if (count === 2) {
        break
      }
    }
    expect(count).toBe(2)
  })
})
