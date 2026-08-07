#!/usr/bin/env node
/*
 * @file Repo check — the PACKED tarball's dist resolves under both CJS
 *   `require` and ESM `import` for a sample of the subpaths the fleet
 *   actually imports.
 *   A predicate unit test on the build's `external()` classifier (see
 *   `.config/rolldown.config.mts` and its
 *   `test/unit/config/rolldown.config.test.mts`) proves the PREDICATE is
 *   correct — it cannot prove the SHIPPED BYTES are loadable. The bug this
 *   check exists to catch shipped anyway: `external()` once treated any path
 *   with an `external/` segment as external, which also matched a
 *   dependency's own nested `dist/external/*` tree, externalizing modules
 *   meant to be bundled and emitting relative `require()`s to files that do
 *   not exist next to the output. That shipped socket-cli 1.1.151's "Cannot
 *   find module 'form-data'" outage. The predicate was fixed in 46a64e45,
 *   but only loading the PACKED bytes — not the workspace `src/` — exercises
 *   the externals boundary a build predicate can still get wrong the same
 *   way. This check does that:
 *
 *   1. Build first when `dist/` is missing.
 *   2. `pnpm pack` into an OS tmpdir via the shared `packAndInspect()` (never the
 *      repo tree).
 *   3. Install the tarball into a SECOND OS-tmpdir scratch package via `pnpm add
 *      <tarball> --offline` — the package ships zero runtime dependencies, so
 *      no network fetch is ever needed; `--offline` makes that a guarantee
 *      rather than an assumption.
 *   4. Spawn `node` inside the scratch dir to `require()` and dynamically
 *      `import()` a fixed sample of the ~15 hottest subpaths — ranked by
 *      grepping `@socketsecurity/lib-stable/<subpath>` usage across socket-cli,
 *      socket-registry, and socket-wheelhouse on 2026-08-07 — from the
 *      INSTALLED copy. Spawning a real `node` process rooted at the scratch dir
 *      is what makes this a genuine consumer simulation: Node resolves the bare
 *      `@socketsecurity/lib/<subpath>` specifier against the scratch dir's own
 *      `node_modules`, the same way any downstream installer would. Both
 *      tmpdirs are removed in a `finally`. A pack or install failure is a
 *      FAILURE, never a skip — this check never reports green without having
 *      actually loaded the packed bytes. `--json` prints the structured
 *      {@link PackedTarballReport} instead of prose. `run-main.mts`'s
 *      `ScriptMeta`/`runMain` has no generic result-to-JSON hook yet, so this
 *      is self-contained for now; the report shape below is already the trivial
 *      plug-in point for one. Usage: node
 *      scripts/repo/check/packed-tarball-resolves.mts [--quiet] [--json]
 */

import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  isJson,
  isQuiet,
} from '@socketsecurity/lib-stable/argv/flag-predicates'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { packAndInspect } from '../../fleet/_shared/pack-inspect.mts'
import { isMainModule } from '../../fleet/_shared/is-main-module.mts'
import { runMain } from '../../fleet/_shared/run-main.mts'
import { REPO_ROOT } from '../../fleet/paths.mts'

import type { ScriptMeta } from '../../fleet/_shared/run-main.mts'

const logger = getDefaultLogger()

const CHECK = '[packed-tarball-resolves]'

/**
 * The published package name a downstream consumer installs. The packed
 * manifest's own `name` field is preferred at runtime; this is only the
 * fallback for a manifest read that somehow comes back nameless.
 */
export const PACKAGE_NAME = '@socketsecurity/lib'

/**
 * The ~15 hottest `@socketsecurity/lib` subpaths, ranked by grepping
 * `@socketsecurity/lib-stable/<subpath>` usage across socket-cli,
 * socket-registry, and socket-wheelhouse on 2026-08-07 (counts below are the
 * combined hit count across the three repos at that snapshot). A static
 * sample rather than a live re-grep at check time: the check must run the
 * same way in CI, where those sibling repos are not checked out, and a fixed
 * sample keeps the result reproducible run to run. Two leaves are spelled at
 * their post-consolidation homes: the `exe` namespace (15f89c63) moved
 * `argv/parse` to `exe/argv/parse` and `bin/which` to `exe/path/which`, and
 * consumers migrate with their next lib bump.
 */
export const HOT_LIB_SUBPATHS: readonly string[] = [
  'logger/default', // 2779
  'process/spawn/child', // 2228
  'fs/safe', // 1016
  'paths/normalize', // 980
  'errors/message', // 680
  'http-request', // 174
  'exe/argv/parse', // 136
  'constants/platform', // 122
  'exe/path/which', // 109
  'fs/read-file', // 103
  'debug/output', // 99
  'globs/match', // 91
  'paths/socket', // 70
  'arrays/join', // 68
  'versions/compare', // 67
]

/**
 * The load mode a probe exercises: CJS `require()` or ESM dynamic
 * `import()`. Both are real fleet usage — the fleet's own test files mix
 * both styles for the same subpaths.
 */
export type ProbeMode = 'require' | 'import'

/**
 * One subpath that threw when loaded from the installed tarball.
 */
export interface ProbeFailure {
  readonly subpath: string
  readonly mode: ProbeMode
  readonly message: string
}

/**
 * The structured result this check produces — the `--json` payload, and the
 * shape prose rendering reads from. Pure data so a future generic `--json`
 * hook in `run-main.mts` can adopt it without this check changing shape.
 */
export interface PackedTarballReport {
  readonly ok: boolean
  readonly packageName: string
  readonly probedSubpaths: number
  readonly failures: readonly ProbeFailure[]
  readonly tarball: string
}

/**
 * Build the source of a throwaway probe script that loads every subpath in
 * `subpaths` from `packageName` and reports which ones threw. Written to disk
 * and run in a fresh `node` process rooted at the installed package's
 * directory — that is what makes the probe a genuine consumer simulation
 * rather than a resolution check against this repo's own `node_modules`.
 * Pure — exported for tests.
 */
export function buildPackedProbeSource(
  packageName: string,
  subpaths: readonly string[],
  mode: ProbeMode,
): string {
  const lines: string[] = ['const failures = []']
  for (let i = 0, { length } = subpaths; i < length; i += 1) {
    const subpath = subpaths[i]!
    const spec = JSON.stringify(`${packageName}/${subpath}`)
    const subpathLiteral = JSON.stringify(subpath)
    const modeLiteral = JSON.stringify(mode)
    const load =
      mode === 'require' ? `require(${spec})` : `await import(${spec})`
    lines.push(
      `try { ${load} } catch (e) { failures.push({ subpath: ${subpathLiteral}, mode: ${modeLiteral}, message: String((e && e.message) || e) }) }`,
    )
  }
  lines.push('process.stdout.write(JSON.stringify(failures))')
  return `${lines.join('\n')}\n`
}

/**
 * Parse a probe script's stdout into its `ProbeFailure[]` payload. Throws —
 * rather than returning an empty array — when the output isn't a JSON array,
 * because that means the probe harness itself broke (a syntax error, a crash
 * before it reached its own try/catch guards), which must never read as "0
 * failures found". Pure — exported for tests.
 */
export function parsePackedProbeOutput(stdout: string): ProbeFailure[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (e) {
    throw new Error(
      `probe harness produced non-JSON stdout: ${errorMessage(e)}\n  Saw: ${stdout.slice(0, 500)}`,
    )
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `probe harness stdout was not a JSON array.\n  Saw: ${stdout.slice(0, 500)}`,
    )
  }
  return parsed as ProbeFailure[]
}

/**
 * Write a probe script for `mode` into `scratchDir` and run it with `node`,
 * `cwd` rooted at `scratchDir` — Node resolves the bare `packageName`
 * specifier against `scratchDir/node_modules`, the same lookup any real
 * consumer's process performs. Returns the subpaths that threw; throws on a
 * harness-level failure (spawn error, non-zero exit, unparsable stdout) so a
 * broken probe never reads as a clean pass.
 */
export function runPackedSubpathProbe(
  scratchDir: string,
  packageName: string,
  subpaths: readonly string[],
  mode: ProbeMode,
): ProbeFailure[] {
  const fileName = mode === 'require' ? 'probe-require.cjs' : 'probe-import.mjs'
  const probePath = path.join(scratchDir, fileName)
  writeFileSync(
    probePath,
    buildPackedProbeSource(packageName, subpaths, mode),
    'utf8',
  )
  const result = spawnSync('node', [probePath], {
    cwd: scratchDir,
    timeout: 60_000,
  })
  if (result.error) {
    throw new Error(
      `probe harness (${mode}) failed to spawn: ${errorMessage(result.error)}`,
    )
  }
  const stdout = String(result.stdout ?? '')
  if (result.status !== 0) {
    throw new Error(
      `probe harness (${mode}) exited ${result.status}.\n` +
        `  stderr: ${String(result.stderr ?? '').slice(0, 1000)}\n` +
        `  stdout: ${stdout.slice(0, 1000)}`,
    )
  }
  return parsePackedProbeOutput(stdout)
}

/**
 * Aggregate the require + import probe results into the report this check
 * prints and exits on. Pure — exported for tests.
 */
export function buildPackedTarballReport(
  packageName: string,
  tarball: string,
  subpaths: readonly string[],
  requireFailures: readonly ProbeFailure[],
  importFailures: readonly ProbeFailure[],
): PackedTarballReport {
  const failures = [...requireFailures, ...importFailures]
  return {
    ok: failures.length === 0,
    packageName,
    probedSubpaths: subpaths.length,
    failures,
    tarball,
  }
}

function formatFailureLine(packageName: string, failure: ProbeFailure): string {
  return `[${failure.mode}] ${packageName}/${failure.subpath} — ${failure.message}`
}

export function main(): number {
  const quiet = isQuiet()
  const json = isJson()

  const distDir = path.join(REPO_ROOT, 'dist')
  if (!existsSync(distDir)) {
    if (!quiet) {
      logger.log(`${CHECK} dist/ absent — building first (\`pnpm run build\`).`)
    }
    const built = spawnSync('pnpm', ['run', 'build'], {
      cwd: REPO_ROOT,
      timeout: 600_000,
    })
    if (built.error || built.status !== 0) {
      logger.error(
        `${CHECK} the build failed.\n` +
          '  What:  `pnpm run build` did not complete before packing.\n' +
          `  Where: ${REPO_ROOT}\n` +
          `  Saw:   exit ${built.status ?? 'spawn error'}; ${
            built.error
              ? errorMessage(built.error)
              : String(built.stderr ?? '').slice(0, 1000)
          }\n` +
          '  Fix:   run `pnpm run build` directly and fix the reported build error.',
      )
      return 1
    }
  }

  const inspection = packAndInspect(REPO_ROOT)
  if (!inspection) {
    logger.error(
      `${CHECK} \`pnpm pack\` failed.\n` +
        '  What:  packing the repo into a tarball did not succeed.\n' +
        `  Where: ${REPO_ROOT}\n` +
        '  Saw:   packAndInspect() returned no inspection — the pack, tar listing, or packed-manifest read failed.\n' +
        '  Fix:   run `pnpm pack` directly from the repo root and fix the reported error.',
    )
    return 1
  }

  const packDir = path.dirname(inspection.tarball)
  const scratchDir = mkdtempSync(
    path.join(os.tmpdir(), 'packed-tarball-resolves-install-'),
  )

  try {
    writeFileSync(
      path.join(scratchDir, 'package.json'),
      JSON.stringify({ name: 'packed-tarball-resolves-probe', private: true }),
    )
    const installed = spawnSync(
      'pnpm',
      ['add', inspection.tarball, '--offline'],
      {
        cwd: scratchDir,
        timeout: 120_000,
      },
    )
    if (installed.error || installed.status !== 0) {
      logger.error(
        `${CHECK} installing the packed tarball failed.\n` +
          '  What:  `pnpm add <tarball> --offline` did not complete.\n' +
          `  Where: ${scratchDir}\n` +
          `  Saw:   exit ${installed.status ?? 'spawn error'}; ${
            installed.error
              ? errorMessage(installed.error)
              : String(installed.stderr ?? '').slice(0, 1000)
          }\n` +
          '  Fix:   confirm the packed manifest carries no unresolved runtime dependency and retry `pnpm add` manually against the tarball.',
      )
      return 1
    }

    const packageName = inspection.packedManifest?.name ?? PACKAGE_NAME
    let report: PackedTarballReport
    try {
      const requireFailures = runPackedSubpathProbe(
        scratchDir,
        packageName,
        HOT_LIB_SUBPATHS,
        'require',
      )
      const importFailures = runPackedSubpathProbe(
        scratchDir,
        packageName,
        HOT_LIB_SUBPATHS,
        'import',
      )
      report = buildPackedTarballReport(
        packageName,
        inspection.tarball,
        HOT_LIB_SUBPATHS,
        requireFailures,
        importFailures,
      )
    } catch (e) {
      logger.error(
        `${CHECK} the probe harness itself failed — this is not a subpath resolution failure.\n` +
          '  What:  spawning `node` to require/import the installed package broke before it could report per-subpath results.\n' +
          `  Where: ${scratchDir}\n` +
          `  Saw:   ${errorMessage(e)}\n` +
          '  Fix:   rerun this check and inspect the scratch dir it prints on failure.',
      )
      return 1
    }

    if (json) {
      logger.log(JSON.stringify(report, undefined, 2))
      return report.ok ? 0 : 1
    }

    if (!report.ok) {
      const lines = report.failures.map(f =>
        formatFailureLine(report.packageName, f),
      )
      logger.error(
        `${CHECK} ${report.failures.length} of ${report.probedSubpaths} hot subpath(s) failed to resolve from the PACKED tarball.\n` +
          "  What:  a subpath the fleet actually imports throws when loaded from the installed tarball, not from this repo's own workspace source.\n" +
          `  Where: ${report.tarball}\n` +
          `  Saw:   ${lines.join('\n         ')}\n` +
          "  Fix:   this is the externals-boundary class of bug fixed in 46a64e45 — check .config/rolldown.config.mts's external() predicate for anything matching a dependency's own nested dist path.",
      )
      return 1
    }

    if (!quiet) {
      logger.success(
        `${CHECK} ok — ${report.probedSubpaths} hot subpath(s) resolve (require + import) from the packed tarball.`,
      )
    }
    return 0
  } finally {
    safeDeleteSync(scratchDir)
    safeDeleteSync(packDir)
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    "checks the packed tarball's dist resolves require/import for a sample of hot subpaths — catches externals-boundary packaging regressions a predicate unit test can't see",
  help: `Usage: node scripts/repo/check/packed-tarball-resolves.mts [flags]
  --quiet  suppress the success message
  --json   print the machine-readable PackedTarballReport instead of prose`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
