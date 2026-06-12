/**
 * @file Tests for the ai/exec seam — the real-vs-sandboxed shell backend.
 *   Sandboxed (just-bash) runs entirely in-process against a virtual FS, so
 *   these assertions never touch the host filesystem; the real backend is
 *   exercised with trivial, side-effect-free commands.
 */

import { describe, expect, it } from 'vitest'

import { resolveExecBackend, runShell } from '../../../src/ai/exec.mts'

describe('resolveExecBackend', () => {
  it('maps trusted → real and untrusted → sandboxed', () => {
    expect(resolveExecBackend('trusted')).toBe('real')
    expect(resolveExecBackend('untrusted')).toBe('sandboxed')
  })
})

describe('runShell — sandboxed backend', () => {
  it('defaults to the sandbox when no backend is given (fail-safe)', async () => {
    const result = await runShell('echo defaulted')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/defaulted/)
  })

  it('seeds files into the virtual FS and reads them back', async () => {
    const result = await runShell('cat /data/x.txt', {
      backend: 'sandboxed',
      files: { '/data/x.txt': 'hello-sandbox' },
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/hello-sandbox/)
  })

  it('propagates a non-zero exit code', async () => {
    const result = await runShell('exit 3', { backend: 'sandboxed' })
    expect(result.exitCode).toBe(3)
  })

  it('forwards stdin to the script', async () => {
    const result = await runShell('cat', {
      backend: 'sandboxed',
      stdin: 'piped-in',
    })
    expect(result.stdout).toMatch(/piped-in/)
  })
})

describe('runShell — real backend', () => {
  it('runs a command on the host shell', async () => {
    const result = await runShell('echo hello-real', { backend: 'real' })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/hello-real/)
  })

  it('propagates a non-zero exit code', async () => {
    const result = await runShell('exit 7', { backend: 'real' })
    expect(result.exitCode).toBe(7)
  })
})
