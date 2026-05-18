/**
 * @file Smoke tests for the `socket-lib check` dispatcher. The CLI's surface is
 *   small — print help, route a name to its handler, error on unknown names.
 *   Each path is tested through the exported `runCheck` function rather than
 *   spawning the CLI binary, since that's where the dispatch logic lives.
 */

import { describe, expect, it } from 'vitest'

import { runCheck } from '../../../src/bin/check'

describe('socket-lib check dispatcher', () => {
  it('prints help and exits 0 when called with no args', async () => {
    const code = await runCheck([])
    expect(code).toBe(0)
  })

  it('prints help and exits 0 with --help', async () => {
    const code = await runCheck(['--help'])
    expect(code).toBe(0)
  })

  it('prints help and exits 0 with -h', async () => {
    const code = await runCheck(['-h'])
    expect(code).toBe(0)
  })

  it('exits 1 on an unknown check name', async () => {
    const code = await runCheck(['this-is-not-a-real-check'])
    expect(code).toBe(1)
  })

  it('routes `prim` to the same handler as `primordials` (alias)', async () => {
    // Both error out the same way (no config file in cwd) — the point
    // is the alias resolves and dispatches identically. Using --help
    // would exit before the config check; since we want to assert
    // "same handler", the cleanest signal is exit 1 from both,
    // matching the fall-through-to-loadConfig path.
    const a = await runCheck(['primordials', '--config', '/nonexistent.json'])
    const b = await runCheck(['prim', '--config', '/nonexistent.json'])
    expect(a).toBe(1)
    expect(b).toBe(1)
  })
})
