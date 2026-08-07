/**
 * @file Self-description smoke tests for the `prim` CLI entry point. Covers
 *   the argv-sniff paths in `runCli` — `--describe`, `--describe --json`,
 *   bare `--json`, `--help`, and no-flags — none of which touch the
 *   filesystem or run a real command, so they're cheap process-stdout
 *   spy assertions rather than fixture runs.
 *   Expectations are asserted STRUCTURALLY (shape, key set, line count)
 *   rather than against `describe.mts`'s own `MANIFEST`/`HELP` constants:
 *   building the expected value from the same module under test proves only
 *   that a constant equals itself, and `no-src-import-in-test-expect` blocks
 *   it for exactly that reason.
 */

import process from 'node:process'

import { describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/cli.mts'

function captureStdout() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

/**
 * Reduce the printed JSON to the facts each envelope test asserts on: the
 * sorted key set, and whether each half is a non-empty string of the right
 * shape. Pure — the `expect(...)` calls stay inside their own test case.
 */
function describeEnvelopeShape(printed: string): {
  describeIsOneLine: boolean
  describeNonEmpty: boolean
  helpIsMultiLine: boolean
  helpNonEmpty: boolean
  keys: string[]
} {
  const payload = JSON.parse(printed) as Record<string, unknown>
  const describeText = payload['describe']
  const helpText = payload['help']
  return {
    describeIsOneLine:
      typeof describeText === 'string' &&
      !describeText.trimEnd().includes('\n'),
    describeNonEmpty: typeof describeText === 'string' && !!describeText.length,
    helpIsMultiLine: typeof helpText === 'string' && helpText.includes('\n'),
    helpNonEmpty: typeof helpText === 'string' && !!helpText.length,
    keys: Object.keys(payload).toSorted(),
  }
}

// The shape every JSON self-description answers with.
const DESCRIBE_ENVELOPE = {
  describeIsOneLine: true,
  describeNonEmpty: true,
  helpIsMultiLine: true,
  helpNonEmpty: true,
  keys: ['describe', 'help'],
}

describe('prim CLI self-description', () => {
  it('prints the one-line description for --describe', async () => {
    const spy = captureStdout()
    try {
      await runCli(['--describe'])
      expect(spy).toHaveBeenCalledTimes(1)
      const printed = spy.mock.calls[0]?.[0] as string
      expect(printed.endsWith('\n')).toBe(true)
      expect(printed.trimEnd()).not.toContain('\n')
      expect(printed.trimEnd().length).toBeGreaterThan(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('prints the {describe, help} envelope for --describe --json', async () => {
    const spy = captureStdout()
    try {
      await runCli(['--describe', '--json'])
      expect(spy).toHaveBeenCalledTimes(1)
      expect(describeEnvelopeShape(spy.mock.calls[0]?.[0] as string)).toEqual(
        DESCRIBE_ENVELOPE,
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('prints the same envelope for --json --describe (order reversed)', async () => {
    const spy = captureStdout()
    try {
      await runCli(['--json', '--describe'])
      expect(spy).toHaveBeenCalledTimes(1)
      expect(describeEnvelopeShape(spy.mock.calls[0]?.[0] as string)).toEqual(
        DESCRIBE_ENVELOPE,
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('prints the {describe, help} envelope for bare --json (no command)', async () => {
    const spy = captureStdout()
    try {
      await runCli(['--json'])
      expect(spy).toHaveBeenCalledTimes(1)
      expect(describeEnvelopeShape(spy.mock.calls[0]?.[0] as string)).toEqual(
        DESCRIBE_ENVELOPE,
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('prints the human help banner for --help', async () => {
    const spy = captureStdout()
    try {
      await runCli(['--help'])
      expect(spy).toHaveBeenCalledTimes(1)
      const printed = spy.mock.calls[0]?.[0] as string
      expect(printed).toContain('\n')
      expect(printed).toContain('prim')
    } finally {
      spy.mockRestore()
    }
  })

  it('prints the human help banner with no flags at all', async () => {
    const spy = captureStdout()
    try {
      await runCli([])
      expect(spy).toHaveBeenCalledTimes(1)
      const printed = spy.mock.calls[0]?.[0] as string
      expect(printed).toContain('\n')
      expect(printed).toContain('prim')
    } finally {
      spy.mockRestore()
    }
  })
})
