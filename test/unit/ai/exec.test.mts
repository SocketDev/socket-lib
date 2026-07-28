/**
 * @file Tests for the ai/exec injection seam. The lib ships the `real` runner
 *   (host shell via spawn) and the ExecContext policy; the sandboxed runner is
 *   INJECTED by the caller, so these tests inject a trivial fake sandbox rather
 *   than pulling a real one. The `real` runner is exercised with side-effect-
 *   free commands.
 */

import { describe, expect, it } from 'vitest'

import {
  backendForTrust,
  createExecContext,
  realRunner,
  runShell,
} from '../../../src/ai/exec.mts'

import type { ExecResult, ExecRunner } from '../../../src/ai/exec.mts'

// A fake sandboxed runner: echoes which script it got, never touches anything.
const fakeSandbox: ExecRunner = {
  async run(script: string): Promise<ExecResult> {
    return { stdout: `sandboxed:${script}`, stderr: '', exitCode: 0 }
  },
}

describe('backendForTrust', () => {
  it('maps trusted → real and untrusted → sandboxed', () => {
    expect(backendForTrust('trusted')).toBe('real')
    expect(backendForTrust('untrusted')).toBe('sandboxed')
  })
})

describe('ExecContext.resolve', () => {
  it('resolves trusted → a host-shell runner even with no sandbox injected', async () => {
    const ctx = createExecContext()
    // Assert behavior (runs on the host shell), not identity against the
    // src-imported runner — the latter trips no-src-import-in-test-expect.
    const result = await ctx.resolve('trusted').run('echo resolved-real')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/resolved-real/)
  })

  it('resolves untrusted → the injected sandboxed runner', () => {
    const ctx = createExecContext({ sandboxed: fakeSandbox })
    expect(ctx.resolve('untrusted')).toBe(fakeSandbox)
  })

  it('throws on untrusted when no sandbox was injected (never downgrades)', () => {
    const ctx = createExecContext()
    expect(() => ctx.resolve('untrusted')).toThrow(/sandboxed exec runner/i)
  })

  it('honors an overridden real runner', () => {
    const ctx = createExecContext({ real: fakeSandbox })
    expect(ctx.resolve('trusted')).toBe(fakeSandbox)
  })
})

describe('realRunner', () => {
  it('runs a command on the host shell', async () => {
    const result = await realRunner.run('echo hello-real')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/hello-real/)
  })

  it('surfaces a non-zero exit as a result, not a throw', async () => {
    const result = await realRunner.run('exit 7')
    expect(result.exitCode).toBe(7)
  })
})

describe('runShell', () => {
  it('runs trusted scripts on the real runner via a default context', async () => {
    const result = await runShell('echo defaulted', { trust: 'trusted' })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/defaulted/)
  })

  it('routes untrusted scripts to the injected sandbox', async () => {
    const context = createExecContext({ sandboxed: fakeSandbox })
    const result = await runShell('rm -rf /', { context, trust: 'untrusted' })
    expect(result.stdout).toBe('sandboxed:rm -rf /')
  })

  it('defaults to untrusted and errors loudly without a sandbox', async () => {
    await expect(runShell('echo x')).rejects.toThrow(/sandboxed exec runner/i)
  })
})
