/**
 * @file Coverage diagnostic orchestration and unchanged gate wiring.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { runCoverageDiagnostics } from '../../scripts/repo/coverage-diagnostics.mts'
import { coverageDiagnosticPaths } from '../../scripts/repo/_shared/paths.mts'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

const scratch: string[] = []

afterEach(() => {
  for (const directory of scratch.splice(0)) {
    safeDeleteSync(directory)
  }
})

function diagnosticFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'coverage-diagnostic-'))
  scratch.push(root)
  const paths = coverageDiagnosticPaths(root)
  mkdirSync(paths.measurement, { recursive: true })
  return { root, paths }
}

function writeMeasurement(
  directory: string,
  options: {
    stale?: boolean | undefined
    extraTest?: boolean | undefined
  } = {},
) {
  const measurement = {
    measurement: true,
    gateEvidence: false,
    complete: true,
    startedAt: options.stale
      ? '2000-01-01T00:00:00.000Z'
      : new Date().toISOString(),
    head: '0'.repeat(40),
  }
  writeFileSync(
    path.join(directory, 'measurement.json'),
    JSON.stringify(measurement),
  )
  for (const tier of ['main', 'isolated']) {
    const report = {
      numTotalTests: 1,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      testResults: [
        {
          name: 'example.test.mts',
          assertionResults: [
            {
              fullName: options.extraTest ? 'changed test' : 'example test',
              status: 'passed',
            },
          ],
        },
      ],
    }
    writeFileSync(
      path.join(directory, `tests.${tier}.json`),
      JSON.stringify(report),
    )
    writeFileSync(path.join(directory, `coverage-final.${tier}.json`), '{}')
  }
}

describe('runCoverageDiagnostics', () => {
  test('alternates workers with bounded teardown and preserves each full snapshot', async () => {
    const { root, paths } = diagnosticFixture()
    const execute = vi.fn(async () => {
      writeMeasurement(paths.measurement)
      return { exitCode: 0, stdout: 'complete', stderr: '' }
    })
    expect(
      await runCoverageDiagnostics({
        repoRoot: root,
        execute,
        context: () => ({ workload: 'fixture' }),
      }),
    ).toBe(0)
    expect(execute.mock.calls).toEqual(
      [4, 8, 4, 8].map(workers => [
        [
          'run',
          'cover',
          '--measure',
          '--lane',
          'fast',
          `--maxWorkers=${workers}`,
        ],
        expect.objectContaining({ cwd: root, timeoutMs: 120_000 }),
      ]),
    )
    const result = JSON.parse(readFileSync(paths.comparison, 'utf8'))
    expect(result).toMatchObject({ diagnostic: true, gateEvidence: false })
    expect(result.runs).toHaveLength(4)
    for (const run of result.runs) {
      expect(
        readFileSync(path.join(run.directory, 'command.log'), 'utf8'),
      ).toBe('complete')
      expect(run.before).toEqual({ workload: 'fixture' })
      expect(run.after).toEqual({ workload: 'fixture' })
    }
  })

  test('does not reuse a previous invocation tier when a fresh tier is missing', async () => {
    const { root, paths } = diagnosticFixture()
    let missing = false
    const execute = vi.fn(async () => {
      writeMeasurement(paths.measurement)
      if (missing) {
        safeDeleteSync(
          path.join(paths.measurement, 'coverage-final.isolated.json'),
        )
      }
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const options = { repoRoot: root, execute, context: () => undefined }
    expect(await runCoverageDiagnostics(options)).toBe(0)
    missing = true
    expect(await runCoverageDiagnostics(options)).toBe(1)
  })

  test('retains over-budget completion as a failing diagnostic', async () => {
    const { root, paths } = diagnosticFixture()
    const execute = vi.fn(async () => {
      writeMeasurement(paths.measurement)
      return { exitCode: 1, stdout: '', stderr: 'over budget' }
    })
    expect(
      await runCoverageDiagnostics({
        repoRoot: root,
        execute,
        context: () => undefined,
      }),
    ).toBe(1)
    expect(execute).toHaveBeenCalledTimes(4)
  })

  test.each(['stale', 'changed', 'missing'] as const)(
    'fails closed on %s reports',
    async scenario => {
      const { root, paths } = diagnosticFixture()
      let invocation = 0
      const execute = vi.fn(async () => {
        if (scenario !== 'missing') {
          writeMeasurement(paths.measurement, {
            stale: scenario === 'stale',
            extraTest: scenario === 'changed' && invocation > 0,
          })
        }
        invocation += 1
        return { exitCode: 0, stdout: '', stderr: '' }
      })
      expect(
        await runCoverageDiagnostics({
          repoRoot: root,
          execute,
          context: () => undefined,
        }),
      ).toBe(1)
      const result = JSON.parse(readFileSync(paths.comparison, 'utf8'))
      expect(
        result.runs.some((run: { error?: string | undefined }) => run.error),
      ).toBe(true)
    },
  )
})

test('keeps the ordinary coverage gate before the Linux diagnostic', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  )
  expect(workflow).toContain('main-script: pnpm run cover\n')
  expect(workflow.indexOf('main-script: pnpm run cover\n')).toBeLessThan(
    workflow.indexOf('run: pnpm run cover:diagnose'),
  )
  expect(workflow).not.toContain('CANONICAL_COMMIT:')
  expect(workflow).toContain(
    "if: failure() && steps.coverage.outcome == 'failure'",
  )
})
