/**
 * @file Tests for paths/walk — the walkUp ancestor generator.
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { normalizePath } from '@socketsecurity/lib/paths/normalize'

import { walkUp } from '../../../src/paths/walk'

// On Windows, `path.resolve('/project/src/lib')` returns `D:\project\src\lib` on the current drive.
// walkUp yields the normalized form `D:/project/src/lib`. Strip the drive prefix on
// Windows so the assertion compares the path tail, not the drive letter.
const DRIVE_PREFIX =
  process.platform === 'win32'
    ? normalizePath(path.parse(path.resolve('/')).root).replace(/\/$/, '')
    : ''
const withDrive = (p: string): string => `${DRIVE_PREFIX}${p}`

describe('walkUp', () => {
  it('yields the start dir then each ancestor up to root', () => {
    const start = path.resolve('/project/src/lib')
    const got = [...walkUp(start)]
    // First entry is the start dir; last is the filesystem root.
    expect(got[0]).toBe(withDrive('/project/src/lib'))
    expect(got).toContain(withDrive('/project/src'))
    expect(got).toContain(withDrive('/project'))
    expect(got.at(-1)).toBe(normalizePath(path.parse(start).root))
  })

  it('stops (inclusive) at stopAt', () => {
    const got = [...walkUp('/project/src/lib', { stopAt: '/project' })]
    expect(got).toStrictEqual([
      withDrive('/project/src/lib'),
      withDrive('/project/src'),
      withDrive('/project'),
    ])
  })

  it('resolves a relative from against cwd', () => {
    const got = [...walkUp('src/lib', { cwd: '/project' })]
    expect(got[0]).toBe(withDrive('/project/src/lib'))
    expect(got).toContain(withDrive('/project/src'))
    expect(got).toContain(withDrive('/project'))
  })

  it('terminates at root even with no stopAt', () => {
    const got = [...walkUp('/x')]
    expect(got.at(-1)).toBe(normalizePath(path.parse(path.resolve('/x')).root))
    // No duplicate root at the tail.
    expect(got.filter(d => d === got.at(-1))).toHaveLength(1)
  })

  it('a start AT the stopAt yields just that one dir', () => {
    expect([...walkUp('/project', { stopAt: '/project' })]).toStrictEqual([
      withDrive('/project'),
    ])
  })

  it('is lazy — can break early without computing the whole chain', () => {
    let count = 0
    for (const dir of walkUp('/project/src/lib/nested/deep')) {
      void dir
      count += 1
      if (count === 2) {
        break
      }
    }
    expect(count).toBe(2)
  })
})
