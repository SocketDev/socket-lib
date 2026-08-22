/**
 * @file Run composed test scripts in child processes.
 *   Each test runs in its own process because a test262 test may leave the
 *   realm dirty on purpose. The shim prelude is written once per feature and
 *   preloaded with `--import`, so the test body itself stays an untouched
 *   script passed to `-e`.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'

import { composeScript } from './harness.mts'

import type { RunResult, TestCase } from './types.mts'

/**
 * Write a feature's prelude to a scratch file and return its path. The prelude
 * has to be a real file rather than inline text: `--import` takes a specifier.
 */
export function writePrelude(prelude: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'socket-test262-'))
  const file = path.join(dir, 'prelude.mjs')
  writeFileSync(file, prelude)
  return file
}

/**
 * True when the run matched what the test's frontmatter expected. A negative
 * test has to fail, and has to fail with the error type it names.
 */
/**
 * What doneprintHandle.js prints when an async test finishes cleanly. Anything
 * else, including a silent clean exit, is a failure: an async test that never
 * reached its `$DONE` exits zero having asserted nothing.
 */
export const ASYNC_PASS_MARKER = 'Test262:AsyncTestComplete'

export function judgeRun(
  testCase: TestCase,
  exitCode: number,
  output: string,
): boolean {
  if (testCase.meta.async) {
    return exitCode === 0 && output.includes(ASYNC_PASS_MARKER)
  }
  if (!testCase.meta.negative) {
    return exitCode === 0
  }
  if (exitCode === 0) {
    return false
  }
  const { negativeType } = testCase.meta
  return negativeType === undefined || output.includes(negativeType)
}

/**
 * Run one composed test in a child process.
 */
export async function runCase(
  root: string,
  preludePath: string,
  testCase: TestCase,
): Promise<RunResult> {
  const script = composeScript(root, testCase)
  // A failing test is the NORMAL case here, so the non-zero exit is read from
  // either shape: a newer lib resolves with the code, while the published
  // lib-stable rejects with it. Catching covers both rather than depending on
  // which one this install has, and is why `throws: false` is not passed - the
  // published SpawnOptions has no such field.
  let code = 0
  let output = ''
  try {
    const result = await spawn(
      process.execPath,
      ['--import', preludePath, '-e', script],
      { stdioString: true },
    )
    code = result.code ?? 0
    output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  } catch (e) {
    const failure = e as {
      code?: number | undefined
      stderr?: string | undefined
      stdout?: string | undefined
    }
    code = failure.code ?? 1
    output = `${failure.stdout ?? ''}${failure.stderr ?? ''}` || String(e)
  }
  const passed = judgeRun(testCase, code, output)
  return { id: testCase.id, output: passed ? '' : output, passed }
}

/**
 * Run every case for one feature, bounded so a large subtree does not open
 * hundreds of processes at once.
 */
export async function runCases(
  root: string,
  preludePath: string,
  cases: readonly TestCase[],
  concurrency: number,
): Promise<RunResult[]> {
  const results: RunResult[] = []
  for (let i = 0, { length } = cases; i < length; i += concurrency) {
    const batch = cases.slice(i, i + concurrency)
    const settled = await Promise.all(
      batch.map(testCase => runCase(root, preludePath, testCase)),
    )
    results.push(...settled)
  }
  return results
}
