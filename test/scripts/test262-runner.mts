/**
 * @file Run the pinned test262 subset against the `src/polyfills` shims.
 *   Thin entry: resolve paths, pick the features to run, hand off to the
 *   modules under `test262/`.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { isMainModule } from '../../scripts/fleet/_shared/is-main-module.mts'
import { runMain } from '../../scripts/fleet/_shared/run-main.mts'
import { exitCodeFor, summarize } from './test262/classifier.mts'
import { loadAllowlist, loadFeatures } from './test262/config.mts'
import { collectCases, composePrelude } from './test262/harness.mts'
import { runCases, writePrelude } from './test262/executor.mts'
import { formatSummary } from './test262/report.mts'

import type { ScriptMeta } from '../../scripts/fleet/_shared/run-main.mts'
import type { RunResult } from './test262/types.mts'

const CONCURRENCY = 8

const logger = getDefaultLogger()

const thisDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(thisDir, '..', '..')
const test262Root = path.join(repoRoot, 'upstream', 'test262')
const distDir = path.join(repoRoot, 'dist')

async function main(): Promise<void> {
  const only = readOnlyFlag(process.argv.slice(2))
  const features = loadFeatures(
    path.join(repoRoot, 'test', 'test262-config', 'features.json'),
    path.join(repoRoot, '.gitmodules'),
  )
  if (!existsSync(test262Root)) {
    throw new Error(
      `test262 is not fetched.\n  Where: ${test262Root}\n  Saw: no checkout; wanted the pinned sparse submodule.\n  Fix: node scripts/fleet/git-partial-submodule.mts clone upstream/test262`,
    )
  }
  if (!existsSync(distDir)) {
    throw new Error(
      `No build to test.\n  Where: ${distDir}\n  Saw: no dist/; wanted the built shims the prelude imports.\n  Fix: pnpm run build`,
    )
  }
  const results: RunResult[] = []
  for (const feature of features) {
    if (only && !feature.name.includes(only)) {
      continue
    }
    const cases = collectCases(test262Root, feature)
    logger.log(`${feature.name}: ${cases.length} test(s)`)
    const preludePath = writePrelude(composePrelude(feature, distDir))
    results.push(
      ...(await runCases(test262Root, preludePath, cases, CONCURRENCY)),
    )
  }
  const summary = summarize(
    results,
    loadAllowlist(
      path.join(repoRoot, 'test', 'test262-config', 'test262.allowlist'),
    ),
  )
  logger.log(formatSummary(summary))
  process.exitCode = exitCodeFor(summary)
}

/**
 * The `--only <substring>` value, which narrows the run to matching features.
 */
export function readOnlyFlag(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--only')
  return index === -1 ? undefined : argv[index + 1]
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'runs the pinned test262 subset against the src/polyfills shims, shim installed over native',
  help: `Usage: node test/scripts/test262-runner.mts [flags]

  --only <substring>    run only features whose name contains <substring>`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
