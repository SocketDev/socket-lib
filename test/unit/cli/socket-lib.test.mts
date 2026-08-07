/**
 * @file Smoke tests for the top-level `socket-lib` CLI dispatcher. The
 *   dispatcher's job is to route the first argv slot — print help when empty /
 *   --help, hand off to runCheck when 'check', error out otherwise. Tests call
 *   the exported `main` function directly so coverage attributes to
 *   src/cli/socket-lib.ts; the require.main === module entry guard is a no-op
 *   when imported.
 */

import { describe, expect, it, vi } from 'vitest'

import { main, printHelp } from '../../../src/cli/socket-lib'

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

  it('prints a one-line description and exits 0 with --describe, running nothing else', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      const code = await main(['--describe'])
      expect(code).toBe(0)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toBe('Socket-wide static-analysis CLI\n')
    } finally {
      spy.mockRestore()
    }
  })

  it('prints the machine-readable manifest and exits 0 with --describe --json', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      const code = await main(['--describe', '--json'])
      expect(code).toBe(0)
      expect(spy).toHaveBeenCalledTimes(1)
      const printed = spy.mock.calls[0]?.[0] as string
      const manifest = JSON.parse(printed)
      expect(manifest.name).toBe('socket-lib')
      expect(manifest.description).toBe('Socket-wide static-analysis CLI')
    } finally {
      spy.mockRestore()
    }
  })

  it('reports an unknown command and exits 1 for bare --json (no top-level JSON mode)', async () => {
    // `--json` is a per-check flag (`socket-lib check <name> --json`), not a
    // top-level mode — the dispatcher only recognizes a command name as
    // args[0], so a bare `--json` here is exactly the same as any other
    // unrecognized command name.
    const code = await main(['--json'])
    expect(code).toBe(1)
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
    // Stub argv to a clean state where the help path makes main return 0.
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
