/**
 * @file Unit tests for prim's source-text mechanics. Every rewrite the codemod
 *   plans is a byte range, so these are the functions that decide where an edit
 *   starts and stops: a closing-paren scan that must refuse rather than guess,
 *   a byte-to-char map that keeps offsets honest once a file contains anything
 *   outside ASCII, an end-position repair that works around the parser, and an
 *   atomic write that exists because a half-flushed file once broke CI.
 */

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import {
  atomicWrite,
  buildByteToCharMap,
  findClosingParen,
  repairEndPositions,
  walkAst,
} from '../src/source-text.mts'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

function tmpRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-source-text-'))
  tmpDirs.push(root)
  return root
}

describe('findClosingParen', () => {
  it('returns the index just past the paren', () => {
    expect(findClosingParen('fn(a)', 4)).toBe(5)
  })

  it('steps over spaces, tabs and newlines', () => {
    expect(findClosingParen('fn(a \t\r\n )', 4)).toBe(10)
  })

  it('steps over a trailing comma', () => {
    expect(findClosingParen('fn(a, )', 4)).toBe(7)
  })

  it('steps over a line comment', () => {
    expect(findClosingParen('fn(a // why\n)', 4)).toBe(13)
  })

  it('steps over a block comment', () => {
    expect(findClosingParen('fn(a /* why */)', 4)).toBe(15)
  })

  it('survives an unterminated block comment instead of looping', () => {
    expect(findClosingParen('fn(a /* never closed', 4)).toBe(-1)
  })

  it('refuses when real code sits before the paren', () => {
    // A wrong last-argument end lands here, and guessing would splice over
    // live source.
    expect(findClosingParen('fn(a + b)', 4)).toBe(-1)
  })

  it('refuses when the source ends first', () => {
    expect(findClosingParen('fn(a  ', 4)).toBe(-1)
  })
})

describe('buildByteToCharMap', () => {
  it('answers undefined for pure ASCII, so the caller can skip translation', () => {
    expect(buildByteToCharMap('const a = 1')).toBe(undefined)
  })

  it('maps a two-byte codepoint to one char index', () => {
    // `é` is two UTF-8 bytes; both must point at the same char.
    const map = buildByteToCharMap('aéb')!
    expect(map[0]).toBe(0)
    expect(map[1]).toBe(1)
    expect(map[2]).toBe(1)
    expect(map[3]).toBe(2)
  })

  it('maps a three-byte codepoint', () => {
    const map = buildByteToCharMap('a→b')!
    expect(map.slice(0, 6)).toEqual([0, 1, 1, 1, 2, 3])
  })

  it('counts a surrogate pair as two chars over four bytes', () => {
    // An emoji is one codepoint but two JavaScript chars, and getting this
    // wrong shifts every offset after it.
    const map = buildByteToCharMap('a😀b')!
    expect(map.slice(0, 7)).toEqual([0, 1, 1, 1, 1, 3, 4])
  })

  it('stamps a sentinel for the end-of-source position', () => {
    const src = 'aé'
    const map = buildByteToCharMap(src)!
    expect(map[Buffer.byteLength(src, 'utf8')]).toBe(src.length)
  })
})

describe('repairEndPositions', () => {
  it('raises an end that the parser under-reported', () => {
    const node = {
      end: 0,
      start: 0,
      argument: { end: 12, start: 4, type: 'Identifier' },
      type: 'ReturnStatement',
    }
    expect(repairEndPositions(node)).toBe(12)
    expect(node.end).toBe(12)
  })

  it('leaves a sane end alone', () => {
    const node = {
      end: 20,
      start: 0,
      argument: { end: 12, start: 4, type: 'Identifier' },
      type: 'ReturnStatement',
    }
    expect(repairEndPositions(node)).toBe(20)
    expect(node.end).toBe(20)
  })

  it('falls back to the node start when it has no children', () => {
    const node = { end: 0, start: 7, type: 'Identifier' }
    expect(repairEndPositions(node)).toBe(7)
  })

  it('folds the maximum end across an array of children', () => {
    const node = {
      end: 0,
      start: 0,
      body: [
        { end: 5, start: 0, type: 'ExpressionStatement' },
        { end: 40, start: 6, type: 'ExpressionStatement' },
      ],
      type: 'Program',
    }
    expect(repairEndPositions(node)).toBe(40)
  })

  it('descends through a plain object that is not an AST node', () => {
    const node = { extra: { inner: { end: 9, start: 0, type: 'Identifier' } } }
    expect(repairEndPositions(node)).toBe(9)
  })

  it('ignores loc, range and underscore-prefixed keys', () => {
    // These carry positions of their own and folding them in would inflate
    // the repaired end past the real source.
    const node = {
      _private: { end: 999, start: 0, type: 'Identifier' },
      end: 0,
      loc: { end: { end: 999, start: 0, type: 'Identifier' } },
      range: { end: 999, start: 0, type: 'Identifier' },
      start: 3,
      type: 'Identifier',
    }
    expect(repairEndPositions(node)).toBe(3)
  })

  it('answers zero for a non-object', () => {
    expect(repairEndPositions(undefined)).toBe(0)
    expect(repairEndPositions('not a node')).toBe(0)
  })
})

describe('walkAst', () => {
  it('visits every typed node depth-first', () => {
    const seen: string[] = []
    walkAst(
      {
        body: [
          {
            expression: { name: 'a', type: 'Identifier' },
            type: 'ExpressionStatement',
          },
        ],
        type: 'Program',
      },
      node => seen.push(node.type),
    )
    expect(seen).toEqual(['Program', 'ExpressionStatement', 'Identifier'])
  })

  it('descends through untyped containers to reach nodes below them', () => {
    const seen: string[] = []
    walkAst({ holder: { inner: { type: 'Identifier' } } }, node =>
      seen.push(node.type),
    )
    expect(seen).toEqual(['Identifier'])
  })

  it('skips loc, range and underscore-prefixed keys', () => {
    const seen: string[] = []
    walkAst(
      {
        _cached: { type: 'ShouldNotVisit' },
        loc: { type: 'ShouldNotVisit' },
        range: { type: 'ShouldNotVisit' },
        type: 'Program',
      },
      node => seen.push(node.type),
    )
    expect(seen).toEqual(['Program'])
  })

  it('does nothing for a non-object', () => {
    const seen: string[] = []
    walkAst(undefined, node => seen.push(node.type))
    walkAst(42, node => seen.push(node.type))
    expect(seen).toEqual([])
  })
})

describe('atomicWrite', () => {
  it('writes the content through', () => {
    const root = tmpRoot()
    const file = path.join(root, 'example.mts')
    atomicWrite(file, 'const a = 1\n')
    expect(readFileSync(file, 'utf8')).toBe('const a = 1\n')
  })

  it('replaces existing content whole', () => {
    const root = tmpRoot()
    const file = path.join(root, 'example.mts')
    writeFileSync(file, 'old\n', 'utf8')
    atomicWrite(file, 'new\n')
    expect(readFileSync(file, 'utf8')).toBe('new\n')
  })

  it('leaves no temp file behind on success', () => {
    // A stray `.tmp-<pid>` in a source tree is the codemod littering.
    const root = tmpRoot()
    atomicWrite(path.join(root, 'example.mts'), 'const a = 1\n')
    expect(readdirSync(root)).toEqual(['example.mts'])
  })

  it('throws and cleans up when the temp file cannot be opened', () => {
    // The caller must learn the write failed; swallowing it would report a
    // successful codemod over an unchanged tree.
    const root = tmpRoot()
    const missingDir = path.join(root, 'absent')
    expect(() =>
      atomicWrite(path.join(missingDir, 'example.mts'), 'x'),
    ).toThrow()
    expect(readdirSync(root)).toEqual([])
  })
})
