/**
 * @file Measure coverage and profile representative tests without changing
 *   gate settings.
 */

import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import {
  getDefaultFormatting,
  stringifyWithFormatting,
} from '@socketsecurity/lib-stable/json/format'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { runQuietCommand } from '../fleet/cover-run.mts'
import { REPO_ROOT } from '../fleet/paths.mts'
import { isMainModule } from '../fleet/process/is-main-module.mts'
import { runMain } from '../fleet/process/run-main.mts'
import type { ScriptMeta } from '../fleet/process/run-main.mts'
import { getScriptArgs } from '../fleet/process/script-output.mts'
import { coverageDiagnosticPaths } from './_shared/paths.mts'
import {
  compareCoverageReports,
  compareTestReports,
} from './coverage-diagnostics/compare.mts'
import { getEnvValue } from '@socketsecurity/lib-stable/env/rewire'

const COVERAGE_PROFILE_TEST_FILES = [
  'test/unit/normalize.test.mts',
  'test/unit/polyfills/set.test.mts',
  'test/unit/packages/provenance-trust-status.test.mts',
  'test/unit/packages/tarball-errors.test.mts',
  'test/unit/dlx/lockfile.test.mts',
  'test/unit/iterate.test.mts',
  'test/unit/cacache/shared.test.mts',
  'test/unit/external-tools/uv/from-vfs.test.mts',
]

const SCRIPT_META: ScriptMeta = {
  describe:
    'Compare coverage workers or profile representative tests; diagnostic results do not establish gate success.',
  help: 'Usage: pnpm run cover:diagnose [--profile]',
  json: 'result',
}

function readDiagnosticJson(
  directory: string,
  filename: string,
): Record<string, unknown> {
  const value: unknown = JSON.parse(
    readFileSync(path.join(directory, filename), 'utf8'),
  )
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  )
  return value as Record<string, unknown>
}

function coverageDiagnosticContext() {
  const processes = spawnSync('ps', ['-eo', 'pid,ppid,pcpu,pmem,comm'], {
    timeout: 1000,
    stdioString: true,
  })
  return {
    __proto__: null,
    at: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpus: os.cpus(),
    availableParallelism: os.availableParallelism(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    loadAverage: os.loadavg(),
    processes: processes.status === 0 ? String(processes.stdout) : undefined,
  }
}

function compareDiagnosticSnapshots(control: string, candidate: string) {
  return ['main', 'isolated'].map(tier => {
    compareTestReports(
      readDiagnosticJson(control, `tests.${tier}.json`),
      readDiagnosticJson(candidate, `tests.${tier}.json`),
    )
    return {
      __proto__: null,
      tier,
      ...compareCoverageReports(
        readDiagnosticJson(control, `coverage-final.${tier}.json`),
        readDiagnosticJson(candidate, `coverage-final.${tier}.json`),
      ),
    }
  })
}

function assertCoverageProfileFiles(repoRoot: string, directory: string): void {
  const report = readDiagnosticJson(directory, 'tests.main.json')
  assert.ok(Array.isArray(report['testResults']))
  const files = report['testResults'].map((entry: { name: string }) =>
    normalizePath(path.relative(repoRoot, entry.name)),
  )
  assert.deepEqual(files.toSorted(), COVERAGE_PROFILE_TEST_FILES.toSorted())
}

function coverageDiagnosticArgs(
  repoRoot: string,
  destination: string,
  workers: number,
  options: { profile?: boolean | undefined } = {},
): string[] {
  const { profile = false } = { __proto__: null, ...options } as typeof options
  const command = [
    'run',
    'cover',
    '--measure',
    '--lane',
    'fast',
    `--maxWorkers=${workers}`,
  ]
  if (!profile) {
    return command
  }
  command.push(
    '--experimental.importDurations.print=true',
    '--reporter=default',
    ...COVERAGE_PROFILE_TEST_FILES,
  )
  return [
    'run',
    'test:profile',
    '--cwd',
    repoRoot,
    '--output-dir',
    destination,
    '--vitest-workers',
    '--command',
    JSON.stringify(['pnpm', ...command]),
  ]
}

function coverageDiagnosticEnv(
  options: { profile?: boolean | undefined } = {},
): NodeJS.ProcessEnv {
  const { profile = false } = { __proto__: null, ...options } as typeof options
  return profile
    ? {
        ...process.env,
        DEBUG: [getEnvValue('DEBUG'), 'vitest:coverage']
          .filter(Boolean)
          .join(','),
      }
    : process.env
}

export async function runCoverageDiagnostics(
  options: {
    repoRoot?: string | undefined
    execute?: typeof runQuietCommand | undefined
    context?: (() => unknown) | undefined
    profile?: boolean | undefined
  } = {},
): Promise<number> {
  const {
    repoRoot = REPO_ROOT,
    execute = runQuietCommand,
    context = coverageDiagnosticContext,
    profile = false,
  } = options
  const paths = coverageDiagnosticPaths(repoRoot)
  mkdirSync(paths.output, { recursive: true })
  const invocation = mkdtempSync(path.join(paths.output, 'run-'))
  const runs: Array<Record<string, unknown>> = []
  let exitCode = 0
  let head: unknown
  let control: string | undefined
  const workerCounts = profile ? [4] : [4, 8, 4, 8]
  const env = coverageDiagnosticEnv({ profile })
  for (const [index, workers] of workerCounts.entries()) {
    const name = `workers-${workers}-run-${index + 1}`
    const destination = path.join(invocation, name)
    mkdirSync(destination, { recursive: true })
    const args = coverageDiagnosticArgs(repoRoot, destination, workers, {
      profile,
    })
    const before = context()
    const started = Date.now()
    const result = await execute(args, {
      cwd: repoRoot,
      env,
      timeoutMs: 120_000,
    })
    const after = context()
    const run: Record<string, unknown> = {
      name,
      directory: destination,
      workers,
      profile,
      args,
      before,
      after,
      exitCode: result.exitCode,
      timedOut: result.timedOut === true,
    }
    writeFileSync(
      path.join(destination, 'command.log'),
      result.stdout + result.stderr,
    )
    try {
      cpSync(paths.measurement, destination, { recursive: true })
      const measurement = readDiagnosticJson(destination, 'measurement.json')
      assert.equal(measurement['measurement'], true)
      assert.equal(measurement['gateEvidence'], false)
      assert.equal(measurement['complete'], true)
      assert.equal(typeof measurement['startedAt'], 'string')
      assert.ok(Date.parse(measurement['startedAt'] as string) >= started)
      assert.ok(
        typeof measurement['head'] === 'string' &&
          /^[a-f\d]{40}$/u.test(measurement['head']),
      )
      head ??= measurement['head']
      assert.equal(measurement['head'], head)
      control ??= destination
      run['measurement'] = measurement
      if (profile) {
        assertCoverageProfileFiles(repoRoot, destination)
      }
      const comparison = compareDiagnosticSnapshots(control, destination)
      run['comparison'] = comparison
      if (
        comparison.some(tier => tier.lost.length > 0 || tier.gained.length > 0)
      ) {
        exitCode = 1
      }
    } catch (error) {
      run['error'] = errorMessage(error)
      exitCode = 1
    }
    if (result.exitCode !== 0) {
      exitCode = 1
    }
    runs.push(run)
    writeFileSync(
      paths.comparison,
      stringifyWithFormatting(
        { diagnostic: true, gateEvidence: false, invocation, runs },
        getDefaultFormatting(),
      ),
    )
  }
  return exitCode
}

if (isMainModule(import.meta.url)) {
  runMain(async () => {
    const { values } = parseArgs({
      args: getScriptArgs(),
      options: { profile: { type: 'boolean', default: false } },
      strict: true,
    })
    process.exitCode = await runCoverageDiagnostics({
      profile: values.profile,
    })
  }, SCRIPT_META)
}
