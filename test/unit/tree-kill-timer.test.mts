/**
 * @file Unit specs for `maybeArmTreeKill` — the `killTreeOnTimeout` timer.
 *   The end-to-end specs in `spawn-kill-tree-on-timeout.test.mts` prove the
 *   feature works against real processes, but they only ever reach the ARMED
 *   path. Every guard that decides NOT to arm is invisible to them, and those
 *   guards are where the damage would be: arming when the caller did not opt
 *   in kills a tree nobody asked to kill, and arming without a process or a
 *   timeout throws inside a `setTimeout` where nothing can catch it.
 *   These run on fake timers with `killProcessTree` mocked, so each branch is
 *   exercised without spawning anything.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const killState = vi.hoisted(() => ({
  calls: [] as Array<{ target: unknown; options: unknown }>,
}))

vi.mock(import('../../src/process/spawn/kill-tree.mjs'), () => ({
  killProcessTree: ((target: unknown, options: unknown) => {
    killState.calls.push({ options, target })
    return true
  }) as never,
}))

import {
  maybeArmTreeKill,
  TREE_KILL_LEAD_MS,
} from '../../src/process/spawn/tree-kill-timer.mjs'

// A spawn-promise stand-in: a real thenable plus the `process` handle the
// helper reads. Settling is controlled by the test.
function fakeSpawnPromise(child: unknown): {
  promise: { process?: unknown | undefined } & PromiseLike<unknown>
  resolve: () => void
  reject: (reason?: unknown | undefined) => void
} {
  let resolve!: () => void
  let reject!: (reason?: unknown | undefined) => void
  const base = new Promise<unknown>((res, rej) => {
    resolve = () => res(undefined)
    reject = rej
  })
  // Swallow rejection on the base so an unsettled test never trips the
  // unhandled-rejection detector; the helper attaches its own handlers.
  base.catch(() => undefined)
  const promise = base as {
    process?: unknown | undefined
  } & PromiseLike<unknown>
  promise.process = child
  return { promise, reject, resolve }
}

const CHILD = { pid: 4242 }

beforeEach(() => {
  vi.useFakeTimers()
  killState.calls.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('maybeArmTreeKill guards', () => {
  it('does not arm without the opt-in', () => {
    // The default must stay inert. Arming here would change teardown for every
    // existing caller of spawn(), none of whom asked for it.
    const { promise } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, { timeout: 100 })
    vi.advanceTimersByTime(10_000)
    expect(killState.calls).toHaveLength(0)
  })

  it('does not arm when killTreeOnTimeout is not exactly true', () => {
    // Guards against a truthy-but-not-true value (a parsed "false" string, an
    // options bag built from CLI input) silently enabling process killing.
    const { promise } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, {
      killTreeOnTimeout: 'yes' as unknown as boolean,
      timeout: 100,
    })
    vi.advanceTimersByTime(10_000)
    expect(killState.calls).toHaveLength(0)
  })

  it('does not arm without a timeout', () => {
    // No deadline means no timeout to pre-empt; a timer here would fire on a
    // process that is still legitimately running.
    const { promise } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, { killTreeOnTimeout: true })
    vi.advanceTimersByTime(10_000)
    expect(killState.calls).toHaveLength(0)
  })

  it('does not arm for a non-positive timeout', () => {
    const { promise } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, { killTreeOnTimeout: true, timeout: 0 })
    vi.advanceTimersByTime(10_000)
    expect(killState.calls).toHaveLength(0)
  })

  it('does not arm when the spawn produced no process', () => {
    // A failed launch (ENOENT) leaves no process. Arming would hand
    // killProcessTree an undefined target inside a timer callback.
    const { promise } = fakeSpawnPromise(undefined)
    maybeArmTreeKill(promise, { killTreeOnTimeout: true, timeout: 100 })
    vi.advanceTimersByTime(10_000)
    expect(killState.calls).toHaveLength(0)
  })
})

describe('maybeArmTreeKill arming', () => {
  it('kills the tree non-detached when the timer fires', () => {
    // `detached: false` is what selects the process-table walk. Passing true
    // here would group-kill a child that leads no group, i.e. do nothing.
    const { promise } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, { killTreeOnTimeout: true, timeout: 1000 })
    vi.advanceTimersByTime(1000)
    expect(killState.calls).toHaveLength(1)
    expect(killState.calls[0]!.target).toBe(CHILD)
    expect(killState.calls[0]!.options).toEqual({ detached: false })
  })

  it('fires BEFORE the spawn timeout, by the lead', () => {
    // The ordering the whole feature depends on: once Node's timeout kills the
    // direct child, the descendants reparent to init and the table can no
    // longer prove they belonged to this tree.
    const timeout = 1000
    const { promise } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, { killTreeOnTimeout: true, timeout })
    vi.advanceTimersByTime(timeout - TREE_KILL_LEAD_MS - 1)
    expect(killState.calls).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(killState.calls).toHaveLength(1)
  })

  it('floors the delay at 1ms for a timeout shorter than the lead', () => {
    // A 5ms timeout would otherwise compute a negative delay.
    const { promise } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, { killTreeOnTimeout: true, timeout: 5 })
    vi.advanceTimersByTime(1)
    expect(killState.calls).toHaveLength(1)
  })

  it('does not kill after the spawn resolves first', async () => {
    // The normal case: the process finished well inside its budget. A timer
    // left armed would kill whatever pid got recycled into that slot.
    const { promise, resolve } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, { killTreeOnTimeout: true, timeout: 1000 })
    resolve()
    await vi.advanceTimersByTimeAsync(0)
    vi.advanceTimersByTime(10_000)
    expect(killState.calls).toHaveLength(0)
  })

  it('does not kill after the spawn rejects first', async () => {
    // A launch failure must disarm too, and must not surface an unhandled
    // rejection from the helper's own bookkeeping handlers.
    const { promise, reject } = fakeSpawnPromise(CHILD)
    maybeArmTreeKill(promise, { killTreeOnTimeout: true, timeout: 1000 })
    reject(new Error('example spawn failure'))
    await vi.advanceTimersByTimeAsync(0)
    vi.advanceTimersByTime(10_000)
    expect(killState.calls).toHaveLength(0)
  })

  it('unrefs the timer so it cannot hold the event loop open', () => {
    // A ref'd timer would keep a short-lived CLI alive for the whole timeout.
    let unrefCalls = 0
    const realSetTimeout = globalThis.setTimeout
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms: number,
    ) => {
      const handle = realSetTimeout(fn, ms)
      return {
        ...(handle as object),
        unref: () => {
          unrefCalls += 1
          return handle
        },
      }
    }) as never)
    try {
      const { promise } = fakeSpawnPromise(CHILD)
      maybeArmTreeKill(promise, { killTreeOnTimeout: true, timeout: 1000 })
      expect(unrefCalls).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})
