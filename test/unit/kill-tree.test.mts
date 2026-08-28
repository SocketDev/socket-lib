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

// This test verifies OS process-group semantics: it needs a synchronously-
// spawned detached child with an immediate pid + group-signalling, which the
// async lib wrapper doesn't surface.
// oxlint-disable-next-line socket/prefer-async-spawn -- process-group test
import { spawn } from 'node:child_process'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { tolerantSleep } from '../_shared/fleet/lib/timing.mts'

// `tolerantSleep` returns a platform-adjusted BUDGET in ms, not a promise, so
// awaiting it directly resolves on the next tick and the delay never happens.
function sleepFor(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, tolerantSleep(ms))
  })
}

import {
  collectDescendantPids,
  isProcessAlive,
  killProcessTree,
  readParentMap,
} from '../../src/process/spawn/kill-tree.mjs'

import { itUnixOnly } from './util/skip-helpers.mjs'

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

describe('collectDescendantPids', () => {
  it('walks a multi-level tree from a pid -> ppid snapshot', () => {
    // 10 -> 20 -> 30, plus an unrelated 40. Only the subtree comes back.
    const parents = new Map([
      [20, 10],
      [30, 20],
      [40, 99],
    ])
    expect(collectDescendantPids(10, parents).toSorted()).toEqual([20, 30])
  })

  it('returns nothing for a leaf', () => {
    expect(collectDescendantPids(30, new Map([[30, 20]]))).toEqual([])
  })

  it('terminates on a cyclic table rather than hanging cleanup', () => {
    // A corrupt/racing table must not hang a best-effort kill path.
    const parents = new Map([
      [10, 20],
      [20, 10],
    ])
    expect(collectDescendantPids(10, parents)).toEqual([20])
  })
})

describe('readParentMap', () => {
  itUnixOnly('includes this process and its real parent', () => {
    const parents = readParentMap()
    expect(parents.get(process.pid)).toBe(process.ppid)
  })
})

describe('killProcessTree non-detached tree walk', () => {
  itUnixOnly(
    'kills a grandchild that Node\u2019s own timeout would orphan',
    async () => {
      // The regression this fallback exists for, reproduced exactly: Node's
      // `timeout` option SIGTERMs only the direct child, so the grandchild
      // survives and reparents to init. Verified before the fix — the
      // grandchild was still alive at ppid 1.
      const child = spawn(
        'sh',
        ['-c', 'sleep 30 & echo $!; wait'],
        // NOT detached: the case with no process group to signal.
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )
      const grandchildPid = await new Promise<number>(resolve => {
        // Raw node:child_process handle, not the lib's spawn wrapper — this
        // test needs the ChildProcess itself to exercise process-tree kills.
        // oxlint-disable-next-line socket/no-bare-spawn-childproc-access -- raw ChildProcess
        child.stdout!.once('data', (d: Buffer) =>
          resolve(Number(String(d).trim())),
        )
      })
      expect(isProcessAlive(grandchildPid)).toBe(true)

      const exited = new Promise<void>(resolve => {
        // oxlint-disable-next-line socket/no-bare-spawn-childproc-access -- raw ChildProcess
        child.once('exit', () => resolve())
      })
      expect(killProcessTree(child, { detached: false })).toBe(true)

      // Wait on the EVENT, not a liveness probe: a signalled direct child
      // becomes a zombie until libuv reaps it, and signal 0 reports a zombie
      // as alive. Only the exit event means actually gone.
      await exited

      // Poll the grandchild: nothing owns its reaping, so delivery timing is
      // the scheduler's. A fixed sleep either flakes under load or pads runs.
      const deadline = Date.now() + 5000
      while (Date.now() < deadline && isProcessAlive(grandchildPid)) {
        // eslint-disable-next-line no-await-in-loop -- serial liveness poll
        await sleepFor(50)
      }

      // Without the ppid walk this stays true: orphaned, reparented to init.
      expect(isProcessAlive(grandchildPid)).toBe(false)
    },
  )
})
