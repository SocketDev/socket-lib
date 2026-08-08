/**
 * @file Unit tests for the script-style run lanes. Children are real `node -e`
 *   processes so the exit-code, capture, and tee paths are exercised
 *   end-to-end. `runInheritTee`'s forwarding is observed through injected
 *   sinks, never the real parent streams. A non-zero exit resolves in every
 *   lane — only a launch failure rejects.
 */

import { realpathSync } from 'node:fs'
import os from 'node:os'

import { describe, expect, it } from 'vitest'

import {
  runCapture,
  runInherit,
  runInheritTee,
  waitForStdioFlush,
} from '../../../src/process/spawn/run'

describe('runInherit', () => {
  it('resolves 0 for a clean exit', async () => {
    expect(await runInherit('node', ['-e', ''])).toBe(0)
  })

  it('resolves the non-zero exit code instead of rejecting', async () => {
    expect(await runInherit('node', ['-e', 'process.exit(7)'])).toBe(7)
  })

  it('rejects when the command never launches', async () => {
    await expect(runInherit('nonexistent-command-12345', [])).rejects.toThrow()
  })
})

describe('runCapture', () => {
  it('captures stdout with the exit code', async () => {
    const { code, stdout } = await runCapture('node', [
      '-e',
      'console.log("hello capture")',
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('hello capture')
  })

  it('keeps the capture byte-faithful — no trim', async () => {
    const { stdout } = await runCapture('node', [
      '-e',
      'process.stdout.write(" M lib/a.ts\\n")',
    ])
    expect(stdout).toBe(' M lib/a.ts\n')
  })

  it('resolves partial stdout beside a non-zero exit', async () => {
    const { code, stdout } = await runCapture('node', [
      '-e',
      'process.stdout.write("partial"); process.exit(4)',
    ])
    expect(code).toBe(4)
    expect(stdout).toBe('partial')
  })

  it('runs in the given cwd', async () => {
    const tmp = realpathSync(os.tmpdir())
    const { code, stdout } = await runCapture(
      'node',
      ['-e', 'process.stdout.write(process.cwd())'],
      { cwd: tmp },
    )
    expect(code).toBe(0)
    expect(realpathSync(stdout)).toBe(tmp)
  })

  it('passes env entries through to the child', async () => {
    const { stdout } = await runCapture(
      'node',
      ['-e', 'process.stdout.write(String(process.env.RUN_CAPTURE_PROBE))'],
      { env: { RUN_CAPTURE_PROBE: 'probe-value' } },
    )
    expect(stdout).toBe('probe-value')
  })

  it('rejects when the command never launches', async () => {
    await expect(runCapture('nonexistent-command-12345', [])).rejects.toThrow()
  })
})

describe('runInheritTee', () => {
  const BOTH_STREAMS =
    'process.stdout.write("out-one "); ' +
    'process.stderr.write("err-one "); ' +
    'process.stdout.write("out-two")'

  it('captures both streams while forwarding each to its sink', async () => {
    const forwardedOut: string[] = []
    const forwardedErr: string[] = []
    const { code, output } = await runInheritTee('node', ['-e', BOTH_STREAMS], {
      onStderr: chunk => {
        forwardedErr.push(chunk.toString('utf8'))
      },
      onStdout: chunk => {
        forwardedOut.push(chunk.toString('utf8'))
      },
    })
    expect(code).toBe(0)
    // The kept copy has everything the child wrote, both streams.
    expect(output).toContain('out-one')
    expect(output).toContain('err-one')
    expect(output).toContain('out-two')
    // The live forwarding saw the same bytes, routed per stream.
    expect(forwardedOut.join('')).toBe('out-one out-two')
    expect(forwardedErr.join('')).toBe('err-one ')
  })

  it('resolves the non-zero exit code with the accumulated output', async () => {
    const { code, output } = await runInheritTee(
      'node',
      ['-e', 'process.stderr.write("boom detail"); process.exit(3)'],
      { onStderr: () => {}, onStdout: () => {} },
    )
    expect(code).toBe(3)
    expect(output).toContain('boom detail')
  })

  it('rejects when the command never launches', async () => {
    await expect(
      runInheritTee('nonexistent-command-12345', [], {
        onStderr: () => {},
        onStdout: () => {},
      }),
    ).rejects.toThrow()
  })
})

describe('waitForStdioFlush', () => {
  it('resolves once no stdio handle has pending writes', async () => {
    const start = Date.now()
    await waitForStdioFlush()
    // With nothing pending it returns on the first poll, far under the
    // 1000ms default budget.
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('honors a custom timeout budget', async () => {
    await expect(waitForStdioFlush(50)).resolves.toBe(undefined)
  })

  it('returns immediately when the budget is zero', async () => {
    await expect(waitForStdioFlush(0)).resolves.toBe(undefined)
  })

  it('drains after a burst of inherit-stdio children', async () => {
    await Promise.all([
      runInherit('node', ['-e', 'process.stdout.write("a")']),
      runInherit('node', ['-e', 'process.stdout.write("b")']),
    ])
    await expect(waitForStdioFlush()).resolves.toBe(undefined)
  })
})
