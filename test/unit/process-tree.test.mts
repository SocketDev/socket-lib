/**
 * @file Unit specs for the process-tree reader and the self-nesting check.
 *   The recursion case is the reason this module exists: every link in a
 *   self-nested chain has a LIVE parent, so orphan and idle heuristics all
 *   miss it. These specs pin the shapes that must and must not trip it.
 */

import { describe, expect, it, vi } from 'vitest'

const psState = vi.hoisted(() => ({
  status: 0,
  stdout: '' as string | undefined,
}))

vi.mock(import('../../src/node/child-process.mjs'), () => ({
  // Only `spawnSync` is consulted by readProcessTree; the rest of the
  // child_process surface is irrelevant to these specs.
  getNodeChildProcess: (() => ({
    spawnSync: () => ({ status: psState.status, stdout: psState.stdout }),
  })) as never,
}))

import {
  findSelfNestedProcesses,
  isSelfNestedProcess,
  readProcessTree,
  SELF_NEST_DEPTH,
} from '../../src/process/tree.mjs'

type Row = { command: string; pid: number; ppid: number }

const WRAPPER = '/opt/example/bin/wrapper'

function row(pid: number, ppid: number, command: string): Row {
  return { command, pid, ppid }
}

function wrapperRow(pid: number, ppid: number): Row {
  return row(pid, ppid, `${WRAPPER} install --frozen-lockfile`)
}

function labelOf(candidate: Row): string | undefined {
  return candidate.command.startsWith(WRAPPER) ? 'wrapper' : undefined
}

describe('readProcessTree', () => {
  it('parses right-aligned ps output and skips the header', () => {
    psState.status = 0
    psState.stdout = [
      '  PID  PPID COMMAND',
      '   10     1 /sbin/launchd',
      '  200    10 /opt/example/bin/wrapper install',
    ].join('\n')
    expect(readProcessTree()).toStrictEqual([
      { command: '/sbin/launchd', pid: 10, ppid: 1 },
      { command: '/opt/example/bin/wrapper install', pid: 200, ppid: 10 },
    ])
  })

  it('returns an empty table when ps fails', () => {
    psState.status = 1
    psState.stdout = 'irrelevant'
    expect(readProcessTree()).toStrictEqual([])
  })

  it('returns an empty table when ps writes nothing', () => {
    psState.status = 0
    psState.stdout = undefined
    expect(readProcessTree()).toStrictEqual([])
  })
})

describe('isSelfNestedProcess', () => {
  it('flags a wrapper three deep in its own label', () => {
    const rows = [wrapperRow(10, 1), wrapperRow(20, 10), wrapperRow(30, 20)]
    expect(isSelfNestedProcess(rows, rows[2]!, labelOf)).toBe(true)
  })

  it('spares a shim spawning the real binary behind it', () => {
    const rows = [wrapperRow(10, 1), wrapperRow(20, 10)]
    expect(isSelfNestedProcess(rows, rows[1]!, labelOf)).toBe(false)
    expect(isSelfNestedProcess(rows, rows[0]!, labelOf)).toBe(false)
  })

  it('spares a chain broken by a different program', () => {
    const rows = [
      wrapperRow(10, 1),
      row(20, 10, '/usr/local/bin/pnpm install'),
      wrapperRow(30, 20),
    ]
    expect(isSelfNestedProcess(rows, rows[2]!, labelOf)).toBe(false)
  })

  it('ignores a row the classifier does not label', () => {
    const rows = [row(10, 1, '/bin/zsh'), row(20, 10, '/bin/zsh')]
    expect(isSelfNestedProcess(rows, rows[1]!, labelOf)).toBe(false)
  })

  it('stops at a parent missing from the table', () => {
    const rows = [wrapperRow(30, 20)]
    expect(isSelfNestedProcess(rows, rows[0]!, labelOf)).toBe(false)
  })

  it('survives a row that parents itself', () => {
    const rows = [wrapperRow(30, 30)]
    expect(isSelfNestedProcess(rows, rows[0]!, labelOf)).toBe(false)
  })

  it('honors an explicit depth', () => {
    const rows = [wrapperRow(10, 1), wrapperRow(20, 10)]
    expect(isSelfNestedProcess(rows, rows[1]!, labelOf, 2)).toBe(true)
    expect(SELF_NEST_DEPTH).toBe(3)
  })
})

describe('findSelfNestedProcesses', () => {
  it('returns the deepest link first', () => {
    const rows = [
      wrapperRow(10, 1),
      wrapperRow(20, 10),
      wrapperRow(30, 20),
      wrapperRow(40, 30),
    ]
    expect(
      findSelfNestedProcesses(rows, labelOf).map(r => r.pid),
    ).toStrictEqual([40, 30])
  })

  it('returns nothing for a table with no recursion', () => {
    const rows = [wrapperRow(10, 1), row(20, 10, '/bin/zsh')]
    expect(findSelfNestedProcesses(rows, labelOf)).toStrictEqual([])
  })
})
