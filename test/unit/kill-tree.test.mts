/**
 * @file Unit tests for the cross-platform process-tree killers in
 *   `src/process/spawn/kill-tree.ts`:
 *
 *   - `killProcessTree(target, options?)` — kills a pid/ChildProcess and its
 *     descendants (POSIX process group via negative pid; Windows taskkill /T).
 *     Best-effort: returns false for an invalid/already-exited target, never
 *     throws.
 *   - `isProcessAlive(pid)` — signal-0 liveness probe; false for pid <= 1. The
 *     POSIX test spawns a detached `sh` that forks a long-lived grandchild and
 *     asserts the whole group dies — the orphan-prevention contract.
 */

// oxlint-disable-next-line socket/prefer-async-spawn -- this test verifies OS process-group semantics: it needs a synchronously-spawned detached child with an immediate pid + group-signalling, which the async lib wrapper doesn't surface.
import { spawn } from 'node:child_process'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { tolerantSleep } from '../_shared/fleet/lib/timing.mts'

import {
  isProcessAlive,
  killProcessTree,
} from '../../src/process/spawn/kill-tree'

import { itUnixOnly } from './util/skip-helpers'

// Build a ChildProcess-shaped stub. Callers pass `undefined` for "not set";
// we convert to the `null` Node actually uses for exitCode/signalCode here,
// so the prefer-undefined-over-null exception lives in exactly one place.
function settledChildStub(fields: {
  pid: number | undefined
  exitCode: number | undefined
  signalCode: NodeJS.Signals | undefined
}): never {
  return {
    pid: fields.pid,
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node ChildProcess.exitCode is `number | null`
    exitCode: fields.exitCode ?? null,
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- Node ChildProcess.signalCode is `NodeJS.Signals | null`
    signalCode: fields.signalCode ?? null,
  } as never
}

describe('isProcessAlive', () => {
  it('returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true)
  })

  it('returns false for pid <= 1 (kernel/init)', () => {
    expect(isProcessAlive(0)).toBe(false)
    expect(isProcessAlive(1)).toBe(false)
  })

  it('returns false for a non-integer pid', () => {
    expect(isProcessAlive(Number.NaN)).toBe(false)
    expect(isProcessAlive(1.5)).toBe(false)
  })

  it('returns false for a pid that does not exist', () => {
    // 999999 is above the typical max pid on test hosts; treat as gone.
    expect(isProcessAlive(999_999)).toBe(false)
  })
})

describe('killProcessTree', () => {
  it('returns false for an invalid pid', () => {
    expect(killProcessTree(0)).toBe(false)
    expect(killProcessTree(1)).toBe(false)
    expect(killProcessTree(Number.NaN)).toBe(false)
  })

  it('returns false for an already-exited ChildProcess', () => {
    const fake = settledChildStub({
      pid: 4242,
      exitCode: 0,
      signalCode: undefined,
    })
    expect(killProcessTree(fake)).toBe(false)
  })

  it('returns false for a signal-terminated ChildProcess', () => {
    const fake = settledChildStub({
      pid: 4242,
      exitCode: undefined,
      signalCode: 'SIGKILL',
    })
    expect(killProcessTree(fake)).toBe(false)
  })

  it('returns false for a ChildProcess with no pid (spawn failed)', () => {
    const fake = settledChildStub({
      pid: undefined,
      exitCode: undefined,
      signalCode: undefined,
    })
    expect(killProcessTree(fake)).toBe(false)
  })

  it('swallows kill errors for a non-existent process group', () => {
    // A live-looking target whose pid maps to no real process. On POSIX
    // this calls process.kill(-pid) which throws ESRCH; the helper must
    // swallow it and report false.
    expect(killProcessTree(999_999)).toBe(false)
  })

  itUnixOnly('kills the detached child process group', async () => {
    // Detached sh leads its own group and forks a grandchild that
    // outlives the foreground sleep, so the group has >1 member.
    const child = spawn('sh', ['-c', 'sleep 30 & sleep 30'], {
      detached: true,
      stdio: 'ignore',
    })
    await new Promise(resolve => {
      setTimeout(resolve, tolerantSleep(100))
    })
    const { pid } = child
    expect(typeof pid).toBe('number')
    // Group is alive (signal 0 to the negative pid succeeds).
    expect(() => process.kill(-(pid as number), 0)).not.toThrow()

    const attempted = killProcessTree(child, { signal: 'SIGKILL' })
    expect(attempted).toBe(true)

    await new Promise(resolve => {
      setTimeout(resolve, tolerantSleep(200))
    })
    // Whole group gone — signalling it now throws ESRCH.
    expect(() => process.kill(-(pid as number), 0)).toThrow()
  })
})
