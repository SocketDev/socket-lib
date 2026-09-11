/**
 * @file Coverage diagnostic orchestration and unchanged gate wiring.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { parseDocument } from 'yaml'

import { runCoverageDiagnostics } from '../../scripts/repo/coverage-diagnostics.mts'
import { coverageDiagnosticPaths } from '../../scripts/repo/_shared/paths.mts'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

const profileFiles = [
  'test/unit/normalize.test.mts',
  'test/unit/polyfills/set.test.mts',
  'test/unit/packages/provenance-trust-status.test.mts',
  'test/unit/packages/tarball-errors.test.mts',
  'test/unit/dlx/lockfile.test.mts',
  'test/unit/iterate.test.mts',
  'test/unit/cacache/shared.test.mts',
  'test/unit/external-tools/uv/from-vfs.test.mts',
]

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
    files?: string[] | undefined
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
  const files = options.files ?? ['example.test.mts']
  for (const tier of ['main', 'isolated']) {
    const report = {
      numTotalTests: files.length,
      numPassedTests: files.length,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      testResults: files.map(name => ({
        name,
        assertionResults: [
          {
            fullName: options.extraTest ? 'changed test' : 'example test',
            status: 'passed',
          },
        ],
      })),
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

  test('profiles only the selected files with bounded execution and native worker capture', async () => {
    const { root, paths } = diagnosticFixture()
    const execute = vi.fn(async () => {
      writeMeasurement(paths.measurement, {
        files: profileFiles.map(file => path.join(root, file)),
      })
      return { exitCode: 0, stdout: 'profile complete', stderr: '' }
    })
    expect(
      await runCoverageDiagnostics({
        repoRoot: root,
        profile: true,
        execute,
        context: () => ({ workload: 'profile fixture' }),
      }),
    ).toBe(0)
    expect(execute).toHaveBeenCalledOnce()
    const { 0: args, 1: config } = execute.mock.calls[0] as unknown as [
      string[],
      {
        cwd: string
        timeoutMs: number
        env: Record<string, string | undefined>
      },
    ]
    expect(args.slice(0, 4)).toEqual(['run', 'test:profile', '--cwd', root])
    expect(args).toContain('--vitest-workers')
    const command = JSON.parse(args[args.indexOf('--command') + 1]!)
    expect(command).toEqual([
      'pnpm',
      'run',
      'cover',
      '--measure',
      '--lane',
      'fast',
      '--maxWorkers=4',
      '--experimental.importDurations.print=true',
      '--reporter=default',
      ...profileFiles,
    ])
    expect(config).toMatchObject({
      cwd: root,
      timeoutMs: 120_000,
      env: { DEBUG: expect.stringContaining('vitest:coverage') },
    })
    const summary = JSON.parse(readFileSync(paths.comparison, 'utf8'))
    expect(summary).toMatchObject({ diagnostic: true, gateEvidence: false })
    expect(summary.runs).toHaveLength(1)
    expect(args[args.indexOf('--output-dir') + 1]).toBe(
      summary.runs[0].directory,
    )
  })

  test('rejects a completed profile that omits a requested test module', async () => {
    const { root, paths } = diagnosticFixture()
    const execute = vi.fn(async () => {
      writeMeasurement(paths.measurement, {
        files: profileFiles.slice(1).map(file => path.join(root, file)),
      })
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    expect(
      await runCoverageDiagnostics({
        repoRoot: root,
        profile: true,
        execute,
        context: () => undefined,
      }),
    ).toBe(1)
  })

  test('retains partial native profiles and logs after a timed-out child', async () => {
    const { root, paths } = diagnosticFixture()
    const execute = vi.fn(async (args: string[]) => {
      const directory = args[args.indexOf('--output-dir') + 1]!
      writeFileSync(
        path.join(directory, 'worker.cpuprofile'),
        '{"partial":true}',
      )
      return {
        exitCode: 1,
        timedOut: true,
        stdout: 'worker started',
        stderr: 'deadline exceeded',
      }
    })
    expect(
      await runCoverageDiagnostics({
        repoRoot: root,
        profile: true,
        execute,
        context: () => undefined,
      }),
    ).toBe(1)
    const summary = JSON.parse(readFileSync(paths.comparison, 'utf8'))
    expect(summary).toMatchObject({ diagnostic: true, gateEvidence: false })
    expect(summary.runs).toHaveLength(1)
    const { 0: run } = summary.runs
    expect(run).toMatchObject({
      timedOut: true,
      exitCode: 1,
      error: expect.any(String),
    })
    expect(
      readFileSync(path.join(run.directory, 'worker.cpuprofile'), 'utf8'),
    ).toBe('{"partial":true}')
    expect(readFileSync(path.join(run.directory, 'command.log'), 'utf8')).toBe(
      'worker starteddeadline exceeded',
    )
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

test('collects coverage in two shards before aggregation', () => {
  const document = parseDocument(
    readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    ),
  )
  expect(document.errors).toEqual([])
  const workflow = document.toJS() as {
    jobs: {
      'cover-shards': {
        outputs: Record<string, string>
        strategy: { matrix: { shard: number[] } }
        steps: Array<{
          name?: string | undefined
          run?: string | undefined
          with?: Record<string, string> | undefined
          env?: Record<string, string> | undefined
        }>
      }
      cover: {
        needs: string[]
        steps: Array<{
          name?: string | undefined
          run?: string | undefined
          with?: Record<string, string> | undefined
          env?: Record<string, string> | undefined
        }>
      }
    }
  }
  const collection = workflow.jobs['cover-shards']
  expect(collection.strategy.matrix.shard).toEqual([1, 2])
  expect(collection.outputs['shard-count']).toBe('${{ strategy.job-total }}')
  expect(
    collection.steps.find(step => step.name === 'Run coverage'),
  ).toMatchObject({
    env: {
      COVERAGE_SHARD: '${{ matrix.shard }}',
      COVERAGE_SHARD_COUNT: '${{ strategy.job-total }}',
    },
    with: {
      'main-script':
        'pnpm run cover:shard --shard="$COVERAGE_SHARD/$COVERAGE_SHARD_COUNT"',
    },
  })

  const aggregate = workflow.jobs.cover
  expect(aggregate.needs).toEqual(['cover-shards'])
  expect(
    aggregate.steps
      .filter(step => step.name?.startsWith('Download coverage shard'))
      .map(step => step.with?.['name']),
  ).toEqual(['coverage-shard-1', 'coverage-shard-2'])
  expect(
    aggregate.steps.find(step => step.name === 'Run coverage'),
  ).toMatchObject({
    env: {
      COVERAGE_SHARD_COUNT: '${{ needs.cover-shards.outputs.shard-count }}',
    },
    with: {
      'main-script':
        'pnpm run cover:aggregate --shards="$COVERAGE_SHARD_COUNT"',
    },
  })
  expect(
    [...collection.steps, ...aggregate.steps].some(step =>
      Object.hasOwn(step.env ?? {}, 'CANONICAL_COMMIT'),
    ),
  ).toBe(false)
})
