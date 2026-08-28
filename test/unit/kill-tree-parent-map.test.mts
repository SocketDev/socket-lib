/**
 * @file Unit specs for `readParentMap`'s failure and parsing paths.
 *   Kept apart from `kill-tree.test.mts` because these mock `ps`, and that
 *   file's specs need the real process table.
 *   The failure path matters more than it looks. `readParentMap` feeds the
 *   descendant walk, so an unreadable table must degrade to "no descendants
 *   found" — which signals the single pid, exactly the old behavior. The
 *   alternative, throwing, would escape from inside a `setTimeout` callback
 *   where no caller can catch it, turning a best-effort cleanup into a crash.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const psState = vi.hoisted(() => ({
  status: 0,
  stdout: '' as string | undefined,
}))

vi.mock(import('../../src/node/child-process.mjs'), () => ({
  // Only `spawnSync` is consulted by readParentMap; the rest of the
  // child_process surface is irrelevant to these specs.
  getNodeChildProcess: (() => ({
    spawnSync: () => ({ status: psState.status, stdout: psState.stdout }),
  })) as never,
}))

import { readParentMap } from '../../src/process/spawn/kill-tree.mjs'

beforeEach(() => {
  psState.status = 0
  psState.stdout = ''
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('readParentMap', () => {
  it('parses a ps table and skips the header row', () => {
    psState.stdout =
      '  PID  PPID COMMAND\n    1     0 /sbin/launchd\n  349     1 /usr/libexec/logd\n 1024   349 node example.mjs\n'
    const parents = readParentMap()
    expect(parents.get(1)).toBe(0)
    expect(parents.get(349)).toBe(1)
    expect(parents.get(1024)).toBe(349)
    // Header contributed nothing.
    expect(parents.size).toBe(3)
  })

  it('parses CRLF output', () => {
    // Belt and braces, deliberately: the row pattern ends `\s*$`, which already
    // absorbs a stray \r, AND the split is \r?\n. Either alone is sufficient,
    // so this spec pins the OUTCOME rather than one mechanism — mutating
    // either one back does not break it, and that is the honest position.
    psState.stdout =
      '  PID  PPID COMMAND\r\n  100    50 node parent.mjs\r\n  200   100 node child.mjs\r\n'
    const parents = readParentMap()
    expect(parents.get(100)).toBe(50)
    expect(parents.get(200)).toBe(100)
  })

  it('returns an empty map when ps exits non-zero', () => {
    // The stdout here is deliberately WELL-FORMED. An earlier version of this
    // spec used unparseable text, so the map came back empty whether or not
    // the status was checked at all — it passed against a build with the check
    // removed. Parseable rows are what make the assertion mean something.
    psState.status = 1
    psState.stdout =
      '  PID  PPID COMMAND\n  100    50 node parent.mjs\n  200   100 node child.mjs\n'
    expect(readParentMap().size).toBe(0)
  })

  it('returns an empty map when ps produces no string output', () => {
    psState.stdout = undefined
    expect(readParentMap().size).toBe(0)
  })

  it('ignores malformed rows rather than throwing', () => {
    // A best-effort cleanup path must never throw: it runs inside a timer
    // callback where nothing can catch it.
    psState.stdout = 'garbage line\n  100    50 node example.mjs\n\n   noise\n'
    const parents = readParentMap()
    expect(parents.get(100)).toBe(50)
    expect(parents.size).toBe(1)
  })
})
