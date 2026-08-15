/**
 * @file Unit tests for the pure `git status --porcelain` parser. Fixtures
 *   cover ordinary worktree-modified lines, staged entries, staged+unstaged
 *   double-status lines, untracked entries, and renames — with the
 *   leading-space status column asserted verbatim, since a trimmed read is
 *   exactly the corruption the parser exists to avoid.
 */

import { describe, expect, it } from 'vitest'

import { parsePorcelain } from '../../../src/git/status.mjs'

describe('parsePorcelain', () => {
  it('parses an ordinary worktree-modified line, preserving the leading space', () => {
    expect(parsePorcelain(' M src/foo.mts\n')).toEqual([
      { status: ' M', path: 'src/foo.mts' },
    ])
  })

  it('parses a staged-only line, preserving the trailing status space', () => {
    expect(parsePorcelain('A  src/new.mts\n')).toEqual([
      { status: 'A ', path: 'src/new.mts' },
    ])
  })

  it('parses a staged+unstaged double-status line', () => {
    expect(parsePorcelain('MM test/unit/spawn/child.test.mts\n')).toEqual([
      { status: 'MM', path: 'test/unit/spawn/child.test.mts' },
    ])
  })

  it('parses an untracked line', () => {
    expect(parsePorcelain('?? scripts/example.mts\n')).toEqual([
      { status: '??', path: 'scripts/example.mts' },
    ])
  })

  it('resolves a rename entry to the NEW path', () => {
    expect(parsePorcelain('R  old.mts -> new.mts\n')).toEqual([
      { status: 'R ', path: 'new.mts' },
    ])
  })

  it('resolves a staged-rename-with-modification (RM) to the new path', () => {
    expect(parsePorcelain('RM lib/old-name.ts -> lib/new-name.ts\n')).toEqual([
      { status: 'RM', path: 'lib/new-name.ts' },
    ])
  })

  it('parses a mixed multi-line status in order', () => {
    const out =
      ' M src/alphalphalpha.ts\n' +
      'M  src/betalphalpha.ts\n' +
      'MM src/gammalphalpha.ts\n' +
      '?? notes.md\n' +
      'R  src/old.ts -> src/new.ts\n'
    expect(parsePorcelain(out)).toEqual([
      { status: ' M', path: 'src/alphalphalpha.ts' },
      { status: 'M ', path: 'src/betalphalpha.ts' },
      { status: 'MM', path: 'src/gammalphalpha.ts' },
      { status: '??', path: 'notes.md' },
      { status: 'R ', path: 'src/new.ts' },
    ])
  })

  it('skips blank lines, including the trailing newline entry', () => {
    expect(parsePorcelain(' M alphalpha.ts\n\n M betalpha.ts\n')).toEqual([
      { status: ' M', path: 'alphalpha.ts' },
      { status: ' M', path: 'betalpha.ts' },
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parsePorcelain(' M alphalpha.ts\r\n?? betalpha.ts\r\n')).toEqual([
      { status: ' M', path: 'alphalpha.ts' },
      { status: '??', path: 'betalpha.ts' },
    ])
  })

  it('returns [] for empty output', () => {
    expect(parsePorcelain('')).toEqual([])
  })

  it('keeps paths containing spaces intact', () => {
    expect(parsePorcelain(' M docs/read me.md\n')).toEqual([
      { status: ' M', path: 'docs/read me.md' },
    ])
  })
})
