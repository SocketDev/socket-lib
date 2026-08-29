/**
 * @file SpawnWithRetry, the async retry path.
 *   It exists apart from `spawn` because a retry replaces the child, which
 *   would leave `spawn`'s live `process` and `stdin` accessors naming the
 *   wrong one. These specs pin the same three ordering rules the sync path
 *   keeps, plus the one rule unique to the async surface: a throwing caller
 *   gets the error built from the last result, never from an extra run.
 */

import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { spawnWithRetry } from '../../src/process/spawn/with-retry.mjs'

describe('spawnWithRetry', () => {
  it('resolves a successful command', async () => {
    const result = await spawnWithRetry(process.execPath, [
      '-e',
      'process.stdout.write("ok")',
    ])
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('ok')
  })

  it('makes one attempt by default', async () => {
    let asked = 0
    const isRetryable = () => {
      asked += 1
      return true
    }
    await expect(
      spawnWithRetry(process.execPath, ['-e', 'process.exit(3)'], {
        isRetryable,
      }),
    ).rejects.toBeDefined()
    expect(asked).toBe(0)
  })

  it('does not retry a clean non-zero exit', async () => {
    const result = await spawnWithRetry(
      process.execPath,
      ['-e', 'process.exit(3)'],
      { retries: 2, retryDelayMs: 1, throws: false },
    )
    expect(result.code).toBe(3)
  })

  it('runs again when the caller calls the failure transient', async () => {
    let asked = 0
    const isRetryable = () => {
      asked += 1
      return true
    }
    const result = await spawnWithRetry(
      process.execPath,
      ['-e', 'process.exit(4)'],
      { isRetryable, retries: 2, retryDelayMs: 1, throws: false },
    )
    expect(result.code).toBe(4)
    // Three attempts, so the predicate answers after the first two.
    expect(asked).toBe(2)
  })

  it('stops as soon as an attempt succeeds', async () => {
    let asked = 0
    const isRetryable = () => {
      asked += 1
      return true
    }
    const result = await spawnWithRetry(process.execPath, ['-e', ''], {
      isRetryable,
      retries: 3,
      retryDelayMs: 1,
    })
    expect(result.code).toBe(0)
    expect(asked).toBe(0)
  })

  it('throws from the final result rather than running the command again', async () => {
    // The command appends a line per run. A throwing caller must not cause an
    // extra execution, because that is the double-apply the module warns of.
    const script =
      'const fs=require("node:fs");fs.appendFileSync(process.env["TALLY"],"x");process.exit(7)'
    const os = await import('node:os')
    const path = await import('node:path')
    const fs = await import('node:fs')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-retry-tally-'))
    const tally = path.join(dir, 'runs.txt')
    fs.writeFileSync(tally, '')
    await expect(
      spawnWithRetry(process.execPath, ['-e', script], {
        env: { ...process.env, TALLY: tally },
      }),
    ).rejects.toBeDefined()
    expect(fs.readFileSync(tally, 'utf8')).toBe('x')
  })
})
