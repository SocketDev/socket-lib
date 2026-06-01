/**
 * @file `prim` CLI output reporters. Each command (`audit`, `lint`, `mod`)
 *   funnels its results through one of these functions, which emit either
 *   machine-readable JSON (when `--json` is set) or human-readable text.
 *   Kept separate from the argument-parsing entry point in `cli.mts` so the
 *   command dispatch and the presentation layer stay independently testable.
 */

import { readFileSync } from 'node:fs'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { createPatch } from 'diff'

import { formatHuman, formatJson } from './format.mts'
import { formatLintFindings } from './lint.mts'
import { formatValidationReport } from './validate.mts'

export function fail(msg) {
  process.stderr.write(`prim: ${msg}\n`) // socket-hook: allow console
  process.exit(1)
}

export function report(
  findings,
  json,
  targetName,
  mode,
  parseFailureFiles: string[] = [],
  stripFailureFiles: string[] = [],
) {
  if (json) {
    // Embed the failure lists in the JSON output so machine consumers
    // can see what got skipped — non-enumerable handles on the array
    // don't survive JSON.stringify, so we lift them onto the wrapper.
    // Raw stdout keeps CLI output machine-pipeable (no logger prefixes / colors).
    const payload = formatJson({
      targetName,
      mode,
      count: findings.length,
      findings,
      parseFailures: parseFailureFiles.length,
      parseFailureFiles,
      stripFailures: stripFailureFiles.length,
      stripFailureFiles,
    })
    process.stdout.write(`${payload}\n`) // socket-hook: allow console
  } else {
    process.stdout.write(formatHuman(findings, { mode, targetName }) + '\n') // socket-hook: allow console
  }
}

export function reportLint(findings, json, targetName) {
  if (json) {
    const payload = formatJson({
      targetName,
      mode: 'lint',
      count: findings.length,
      findings,
    })
    process.stdout.write(`${payload}\n`) // socket-hook: allow console
    return
  }
  process.stdout.write(formatLintFindings(findings, { targetName })) // socket-hook: allow console
}

export function reportMod(result, json, applied, showDiff = false) {
  // Validation failure short-circuit: when the two-phase apply rejected
  // the batch, surface the per-finding report and exit non-zero. Working
  // tree is pristine (no atomicWrite happened), so the user can re-attempt
  // after addressing the findings or bypass with `--no-validate`.
  if (result.validationFailed) {
    const validationReport = formatValidationReport(
      result.validationFindings ?? [],
    )
    if (json) {
      const payload = formatJson({
        applied: false,
        validationFailed: true,
        validationFindings: result.validationFindings,
      })
      process.stdout.write(`${payload}\n`) // socket-hook: allow console
    } else {
      process.stderr.write(`${validationReport}\n`) // socket-hook: allow console
    }
    process.exitCode = 1
    return
  }
  if (json) {
    const payload = formatJson({
      applied,
      filesChanged: result.filesChanged,
      rewriteCount: result.rewriteCount,
      skipped: result.skipped,
      files: result.files,
    })
    process.stdout.write(`${payload}\n`) // socket-hook: allow console
    return
  }
  const verb = applied ? 'Wrote' : 'Would write'
  if (result.rewriteCount === 0) {
    process.stdout.write('mod: no rewrites needed.\n') // socket-hook: allow console
    return
  }
  const summary = `mod: ${verb} ${result.rewriteCount} rewrite(s) across ${result.filesChanged} file(s).\n`
  process.stdout.write(summary) // socket-hook: allow console
  if (result.skipped > 0) {
    const skippedMsg = `mod: skipped ${result.skipped} candidate(s) — pass --include-guessed to rewrite receiver-guessed sites too.\n`
    process.stdout.write(skippedMsg) // socket-hook: allow console
  }
  if (!applied) {
    process.stdout.write('mod: dry run — pass --apply to write changes.\n') // socket-hook: allow console
  }
  for (const f of result.files) {
    const fileLine = `  ${f.file}: ${f.rewrites} rewrite(s), import added: ${f.importAdded ? 'yes' : 'no'}\n`
    process.stdout.write(fileLine) // socket-hook: allow console
  }
  if (showDiff && !applied) {
    // Dry-run preview: render unified line-diff per planned rewrite by
    // reading the pre-change source from disk and comparing it to the
    // staged new source. Disk is never written in dry-run mode.
    const logger = getDefaultLogger()
    for (const plan of result.plans ?? []) {
      let oldSource = ''
      try {
        oldSource = readFileSync(plan.absPath, 'utf8')
      } catch {
        continue
      }
      const patch = createPatch(
        plan.relPath,
        oldSource,
        plan.newSource,
        '',
        '',
        { context: 3 },
      )
      logger.log('')
      logger.log(String(patch))
    }
  }
}
