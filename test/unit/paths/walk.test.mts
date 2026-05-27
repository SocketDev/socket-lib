/**
 * @file Tests for paths/walk — the walkUp ancestor generator.
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { walkUp } from '../../../src/paths/walk'

describe('walkUp', () => {
  it('yields the start dir then each ancestor up to root', () => {
    const start = path.resolve('/a/b/c')
    const got = [...walkUp(start)]
    // First entry is the start dir; last is the filesystem root.
    expect(got[0]).toBe('/a/b/c')
    expect(got).toContain('/a/b')
    expect(got).toContain('/a')
    expect(got.at(-1)).toBe(path.parse(start).root.replace(/\\/g, '/'))
  })

  it('stops (inclusive) at stopAt', () => {
    const got = [...walkUp('/a/b/c', { stopAt: '/a' })]
    expect(got).toStrictEqual(['/a/b/c', '/a/b', '/a'])
  })

  it('resolves a relative from against cwd', () => {
    const got = [...walkUp('b/c', { cwd: '/a' })]
    expect(got[0]).toBe('/a/b/c')
    expect(got).toContain('/a/b')
    expect(got).toContain('/a')
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
