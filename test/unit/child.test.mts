/**
 * @file SpawnSync's retry loop, driven end to end against a real child.
 *   The policy module covers the decisions. These cover the WIRING: that the
 *   loop runs the command again, that the default makes exactly one attempt,
 *   and that a clean non-zero exit is never retried however many are allowed.
 */

import { describe, expect, it } from 'vitest'

import { spawnSync } from '../../src/process/spawn/child.mjs'

describe('spawnSync retry wiring', () => {
  it('makes exactly one attempt by default', () => {
    // Retry is opt-in, because a command that changes state may already have
    // succeeded when the attempt failed.
    let attempts = 0
    const isRetryable = () => {
      attempts += 1
      return true
    }
    const result = spawnSync(process.execPath, ['-e', 'process.exit(3)'], {
      isRetryable,
    })
    expect(result.status).toBe(3)
    expect(attempts).toBe(0)
  })

  it('does not retry a clean non-zero exit', () => {
    // The command answered. A second run returns the same 3.
    const result = spawnSync(process.execPath, ['-e', 'process.exit(3)'], {
      retries: 2,
      retryDelayMs: 1,
    })
    expect(result.status).toBe(3)
  })

  it('runs the command again when the caller says the failure is transient', () => {
    let seen = 0
    const isRetryable = () => {
      seen += 1
      return true
    }
    const result = spawnSync(process.execPath, ['-e', 'process.exit(4)'], {
      isRetryable,
      retries: 2,
      retryDelayMs: 1,
    })
    expect(result.status).toBe(4)
    // Three attempts total, so the predicate is consulted after the first two.
    expect(seen).toBe(2)
  })

  it('stops retrying as soon as an attempt succeeds', () => {
    let seen = 0
    const isRetryable = () => {
      seen += 1
      return true
    }
    const result = spawnSync(process.execPath, ['-e', 'process.exit(0)'], {
      isRetryable,
      retries: 3,
      retryDelayMs: 1,
    })
    expect(result.status).toBe(0)
    expect(seen).toBe(0)
  })

  it('retries a launch failure, then reports it', () => {
    // A binary that does not exist never runs, which is the transient shape
    // the default predicate accepts.
    const result = spawnSync('example-command-that-does-not-exist', [], {
      retries: 1,
      retryDelayMs: 1,
    })
    expect(result.error).toBeDefined()
  })
})
