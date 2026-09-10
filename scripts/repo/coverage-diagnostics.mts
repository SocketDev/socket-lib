/**
 * @file Measure coverage worker counts on one host without changing gate
 *   settings.
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
import { coverageDiagnosticPaths } from './_shared/paths.mts'
import {
  compareCoverageReports,
  compareTestReports,
} from './coverage-diagnostics/compare.mts'

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

export async function runCoverageDiagnostics(
  options: {
    repoRoot?: string | undefined
    execute?: typeof runQuietCommand | undefined
    context?: (() => unknown) | undefined
  } = {},
): Promise<number> {
  const {
    repoRoot = REPO_ROOT,
    execute = runQuietCommand,
    context = coverageDiagnosticContext,
  } = options
  const paths = coverageDiagnosticPaths(repoRoot)
  mkdirSync(paths.output, { recursive: true })
  const invocation = mkdtempSync(path.join(paths.output, 'run-'))
  const runs: Array<Record<string, unknown>> = []
  let exitCode = 0
  let head: unknown
  let control: string | undefined
  for (const [index, workers] of [4, 8, 4, 8].entries()) {
    const name = `workers-${workers}-run-${index + 1}`
    const destination = path.join(invocation, name)
    const args = [
      'run',
      'cover',
      '--measure',
      '--lane',
      'fast',
      `--maxWorkers=${workers}`,
    ]
    const before = context()
    const started = Date.now()
    const result = await execute(args, {
      cwd: repoRoot,
      env: process.env,
      timeoutMs: 120_000,
    })
    const after = context()
    const run: Record<string, unknown> = {
      name,
      directory: destination,
      workers,
      args,
      before,
      after,
      exitCode: result.exitCode,
      timedOut: result.timedOut === true,
    }
    mkdirSync(destination, { recursive: true })
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
  runMain(
    async () => {
      process.exitCode = await runCoverageDiagnostics()
    },
    {
      describe:
        'Compare four and eight coverage workers on one host; diagnostic results do not establish gate success.',
      help: 'Usage: pnpm run cover:diagnose',
    },
  )
}
