/**
 * @fileoverview Smoke tests for the top-level `socket-lib` CLI dispatcher.
 *
 * The dispatcher's job is to route the first argv slot — print help when
 * empty / --help, hand off to runCheck when 'check', error out otherwise.
 * Tests call the exported `main` function directly so coverage attributes
 * to src/bin/socket-lib.ts; the require.main === module entry guard is a
 * no-op when imported.
 */

import { describe, expect, it } from 'vitest'

import { main, printHelp } from '../../../src/bin/socket-lib'

describe('socket-lib CLI dispatcher', () => {
  it('prints help and exits 0 with no args', async () => {
    const code = await main([])
    expect(code).toBe(0)
  })

  it('prints help and exits 0 with --help', async () => {
    const code = await main(['--help'])
    expect(code).toBe(0)
  })

  it('prints help and exits 0 with -h', async () => {
    const code = await main(['-h'])
    expect(code).toBe(0)
  })

  it('exits 1 on an unknown command', async () => {
    const code = await main(['this-is-not-a-real-command'])
    expect(code).toBe(1)
  })

  it('routes `check` to the check dispatcher (returns 0 on `check --help`)', async () => {
    // `check --help` is the cleanest signal: the check subcommand prints
    // its own help and exits 0. Confirms dispatch wired up correctly.
    const code = await main(['check', '--help'])
    expect(code).toBe(0)
  })

  it('routes `check <unknown>` through the check dispatcher (exits 1)', async () => {
    const code = await main(['check', 'definitely-not-a-check'])
    expect(code).toBe(1)
  })

  it('falls back to process.argv.slice(2) when called with no args', async () => {
    // Default-arg path: no `args` passed, so it reads process.argv.
    // Stub argv to a clean state where main returns 0 (help path).
    const original = process.argv
    process.argv = ['node', 'socket-lib', '--help']
    try {
      const code = await main()
      expect(code).toBe(0)
    } finally {
      process.argv = original
    }
  })

  describe('printHelp', () => {
    it('runs to completion without throwing', () => {
      // The default logger is bound to a private Console instance with
      // a captured stdout reference, so spying on process.stdout.write
      // after import won't intercept output. The exit-0 paths above
      // already exercise this function; this just confirms the direct
      // call path executes its full body (10 logger.log calls).
      expect(() => printHelp()).not.toThrow()
    })
  })
})
