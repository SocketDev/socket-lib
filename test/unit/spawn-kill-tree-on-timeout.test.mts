/**
 * @file Spec for `killTreeOnTimeout`, the opt-in that makes a timed-out spawn
 *   clean up its DESCENDANTS.
 *   Node's `timeout` option signals only the direct child. Measured: a
 *   three-level tree timed out, the middle process took SIGTERM, and the
 *   grandchild survived reparented to `ppid 1`. That is how a spawned tool
 *   that spawns its own children leaks a whole subtree on every timeout — and
 *   nothing reports it, because the spawn itself failed exactly as expected.
 */

import process from 'node:process'

import { describe, expect } from 'vitest'

import { tolerantSleep } from '../_shared/fleet/lib/timing.mts'

// `tolerantSleep` returns a platform-adjusted BUDGET in ms, not a promise, so
// awaiting it directly resolves on the next tick and the delay never happens.
function sleepFor(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, tolerantSleep(ms))
  })
}

import { spawn } from '../../src/process/spawn/child.mjs'
import { isProcessAlive } from '../../src/process/spawn/kill-tree.mjs'

import { itUnixOnly } from './util/skip-helpers.mjs'

// Print the background pid, then outlive the timeout so it always fires.
const TREE_SCRIPT = 'sleep 30 & echo $!; wait'

async function waitForDeath(pid: number): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline && isProcessAlive(pid)) {
    // eslint-disable-next-line no-await-in-loop -- serial liveness poll
    await sleepFor(50)
  }
}

describe('killTreeOnTimeout', () => {
  itUnixOnly('reaps the grandchild a bare timeout would orphan', async () => {
    let grandchildPid = 0
    const spawnPromise = spawn('sh', ['-c', TREE_SCRIPT], {
      killTreeOnTimeout: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 400,
    })
    const childStdout = spawnPromise.process.stdout
    childStdout?.once('data', (d: Buffer) => {
      grandchildPid = Number(String(d).trim())
    })
    // The spawn is expected to fail: the timeout is the point.
    await spawnPromise.catch(() => undefined)

    expect(grandchildPid).toBeGreaterThan(1)
    await waitForDeath(grandchildPid)
    expect(isProcessAlive(grandchildPid)).toBe(false)
  })

  itUnixOnly('leaves the grandchild alive without the opt-in', async () => {
    // Pins the DEFAULT, so the opt-in stays opt-in. If this ever starts
    // passing, the default changed and every consumer's teardown changed with
    // it — which is exactly the kind of silent behavior shift a shared library
    // must not ship unannounced.
    let grandchildPid = 0
    const spawnPromise = spawn('sh', ['-c', TREE_SCRIPT], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 400,
    })
    const bareStdout = spawnPromise.process.stdout
    bareStdout?.once('data', (d: Buffer) => {
      grandchildPid = Number(String(d).trim())
    })
    // Deliberately NOT awaited. The orphan inherits the stdout pipe and holds
    // it open, so without the opt-in this promise does not settle until the
    // orphan exits on its own — 30s here. That hang is itself part of the cost
    // of leaking the subtree, and awaiting it would make this test take it.
    void spawnPromise.catch(() => undefined)
    // Comfortably past the 400ms timeout, far short of the orphan's lifetime.
    await sleepFor(1500)

    expect(grandchildPid).toBeGreaterThan(1)
    expect(isProcessAlive(grandchildPid)).toBe(true)
    // Do not leak the orphan out of the test.
    try {
      process.kill(grandchildPid, 'SIGKILL')
    } catch {
      // Already gone; nothing to clean up.
    }
  })
})
