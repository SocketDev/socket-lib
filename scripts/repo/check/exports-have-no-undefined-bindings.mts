// Repo check — no public subpath may expose a binding that is undefined at
// runtime.
//
// This is the MEASURED half of the eager-re-export problem. Its sibling,
// reexports-have-no-import-cycles, reasons about the module graph and asks
// "could this cycle poison a binding?". This one imports the built code and
// asks "IS a binding undefined right now?". The distinction is not academic:
// the graph check reported clean over 673 modules while seven real bindings
// were poisoned — fromUnixPath, splitPath, toUnixPath, trimLeadingDotSlash,
// relative, relativeResolve and resolve — whenever a consumer entered through
// paths/conversion or paths/resolve. A graph the checker likes is not a
// runtime that works.
//
// The mechanism: rolldown emits a re-export as an eager value copy taken while
// the re-exporting module initializes.
//
//   exports.fromUnixPath = require_paths_conversion.fromUnixPath
//
// If the source module is already on the require stack, Node hands back a
// half-built exports object, the property is missing, and the binding is
// pinned to undefined for the life of the process. It never heals, and Node
// only mentions it in a warning that reads as cosmetic.
//
// Import ORDER decides whether it happens, so every public subpath is probed
// in its OWN process. Entering through paths/normalize was always fine;
// entering through paths/conversion was not. A single shared process would
// have shown only the first entry's answer.
//
// Why a poisoned binding is distinguishable from one that is simply undefined:
// dist legitimately exports undefined values (constants/sentinels'
// UNDEFINED_TOKEN, a primordial absent on this Node, an unset std-env var).
// Those are direct assignments (`exports.X = X`), not cross-module reads, and
// their source value is undefined too. A finding requires BOTH halves: the
// re-exporter's value is undefined AND the source module's value is not. That
// gap is the snapshot, and nothing else produces it.
//
// Usage: node scripts/repo/check/exports-have-no-undefined-bindings.mts [--quiet]

import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'
import { isMainModule } from '../../fleet/_shared/is-main-module.mts'
import { runMain } from '../../fleet/_shared/run-main.mts'
import {
  findPathBack,
  listDistFiles,
  readEagerReexports,
} from './reexports-have-no-import-cycles.mts'

import type { ScriptMeta } from '../../fleet/_shared/run-main.mts'

const execFileAsync = promisify(execFile)

const logger = getDefaultLogger()

const DIST_DIR = path.join(REPO_ROOT, 'dist')

// A probe that hangs is a broken probe, not a passing one. Modules that arm a
// timer or open a handle keep the loop alive, so the child force-exits after
// printing and this bounds the pathological case.
const PROBE_TIMEOUT_MS = 30_000

/**
 * Knobs for a probe sweep. `distDir` only sets what findings are reported
 * relative to, so a forensic run can point at an unpacked tarball.
 */
export interface AuditOptions {
  distDir?: string | undefined
  onProgress?: ((done: number) => void) | undefined
}

/**
 * The result of a probe sweep. `observed` counts how many planned modules were
 * actually found loaded, across every probe — a sweep that observed nothing
 * measured nothing and must not be read as a pass.
 */
export interface UndefinedBindingAudit {
  findings: UndefinedBindingFinding[]
  observed: number
}

/**
 * One public subpath and the built file its `default` condition points at.
 */
export interface SubpathTarget {
  // Absolute path of the built entry file.
  file: string
  // The exports-map key, e.g. `./paths/normalize`.
  subpath: string
}

/**
 * One binding that is undefined at runtime because an eager re-export
 * snapshotted a half-built module.
 */
export interface UndefinedBindingFinding {
  // The name the re-exporting module publishes as undefined.
  binding: string
  // Dist-relative hops from the source module back to the re-exporter, i.e.
  // the cycle. Undefined when the graph shows no way back.
  chain: string[] | undefined
  // Dist-relative file whose export is undefined.
  file: string
  // Dist-relative module the value should have been read from.
  source: string
  // The public subpath whose import exposed it.
  subpath: string
}

/**
 * The plan a probe works from: for each built file, the eager re-exports it
 * performs. Keyed by absolute file path so the child can look each one up in
 * `require.cache` without re-reading any bytes.
 */
export type ProbePlan = Record<
  string,
  Array<{ exported: string; local: string; target: string }>
>

/**
 * Group every eager re-export in `files` into a probe plan, dropping files
 * that perform none.
 */
export function buildProbePlan(files: string[]): ProbePlan {
  const plan: ProbePlan = { __proto__: null } as unknown as ProbePlan
  for (let i = 0, { length } = files; i < length; i += 1) {
    const file = files[i]!
    const found = readEagerReexports(file)
    if (found.length > 0) {
      plan[file] = found
    }
  }
  return plan
}

/**
 * The child program. Requires one entry, then compares each eager re-export's
 * runtime value against the value on the module it was read from.
 *
 * Written as a CJS string because it must run with `node -e`, sharing nothing
 * with this process — a fresh require cache per subpath is the entire point.
 */
export function buildProbeSource(): string {
  return `
const { readFileSync, realpathSync } = require('node:fs')
const plan = JSON.parse(readFileSync(process.env['PROBE_PLAN'], 'utf8'))
// require.cache is keyed by REALPATH. On macOS /var is a symlink to
// /private/var, so a plan built from the walked path misses every lookup and
// the probe reports a clean run it never performed. Canonicalize both sides.
const real = p => { try { return realpathSync(p) } catch { return p } }
try {
  require(process.env['PROBE_TARGET'])
} catch (e) {
  process.stdout.write(JSON.stringify({ error: String((e && e.message) || e) }))
  process.exit(0)
}
const findings = []
let observed = 0
const cache = require.cache
for (const file of Object.keys(plan)) {
  const mod = cache[real(file)]
  if (!mod) { continue }
  observed += 1
  const exported = mod.exports
  if (!exported || typeof exported !== 'object') { continue }
  for (const entry of plan[file]) {
    const sourceMod = cache[real(entry.target)]
    if (!sourceMod) { continue }
    const sourceExported = sourceMod.exports
    if (!sourceExported || typeof sourceExported !== 'object') { continue }
    let here
    let there
    try { here = exported[entry.exported] } catch { continue }
    if (here !== undefined) { continue }
    try { there = sourceExported[entry.local] } catch { continue }
    if (there === undefined) { continue }
    findings.push({ binding: entry.exported, file, source: entry.target })
  }
}
process.stdout.write(JSON.stringify({ findings, observed }))
process.exit(0)
`
}

/**
 * A finding, rendered the way the fleet's error-message rule asks: what broke,
 * where, what was seen against what was wanted, and the fix.
 */
export function formatFinding(finding: UndefinedBindingFinding): string {
  const { binding, chain, file, source, subpath } = finding
  const lines = [
    `${binding} is undefined at runtime.`,
    `  Where:  importing '${subpath}' leaves ${file} exporting it as undefined.`,
    `  Saw:    ${file} -> ${binding} === undefined`,
    `          ${source} -> ${binding} is defined`,
  ]
  if (chain) {
    lines.push(`  Cycle:  ${chain.join(' -> ')}`)
  }
  lines.push(
    `  Fix:    ${file} takes an eager copy of ${binding} from ${source}`,
    `          while ${source} is still initializing, so it snapshots`,
    `          undefined and never heals. Move the implementation of`,
    `          ${binding} DOWN into a leaf module that imports nothing`,
    `          from ${file}, then have both files import that leaf.`,
    `          Do not reorder imports to dodge it — order is the consumer's`,
    `          to choose, and the next consumer will choose differently.`,
  )
  return lines.join('\n')
}

/**
 * Every public subpath in an exports map whose `default` condition names a
 * built `.js` file.
 */
export function listPublicSubpathTargets(
  exportsMap: Record<string, unknown>,
  root: string,
): SubpathTarget[] {
  const targets: SubpathTarget[] = []
  for (const { 0: subpath, 1: condition } of Object.entries(exportsMap)) {
    if (!condition || typeof condition !== 'object') {
      continue
    }
    const fallback = (condition as Record<string, unknown>)['default']
    if (typeof fallback !== 'string' || !fallback.endsWith('.js')) {
      continue
    }
    targets.push({
      file: path.resolve(root, fallback),
      subpath,
    })
  }
  return targets.toSorted((a, b) => (a.subpath < b.subpath ? -1 : 1))
}

/**
 * Parse a probe's stdout. A child that printed nothing usable is reported as
 * an error rather than silently counted clean.
 */
export function parseProbeOutput(stdout: string): {
  error?: string | undefined
  findings: Array<{ binding: string; file: string; source: string }>
  observed: number
} {
  let parsed
  try {
    parsed = JSON.parse(stdout) as {
      error?: string | undefined
      findings?:
        | Array<{ binding: string; file: string; source: string }>
        | undefined
      observed?: number | undefined
    }
  } catch {
    return {
      error: `probe printed unparseable output: ${stdout.slice(0, 200)}`,
      findings: [],
      observed: 0,
    }
  }
  if (parsed.error) {
    return { error: parsed.error, findings: [], observed: 0 }
  }
  return { findings: parsed.findings ?? [], observed: parsed.observed ?? 0 }
}

/**
 * Probe every subpath, each in its own process, and collect the poisoned
 * bindings. Concurrency is capped at the CPU count; each child is short.
 */
export async function auditUndefinedBindings(
  targets: SubpathTarget[],
  plan: ProbePlan,
  options: AuditOptions = {},
): Promise<UndefinedBindingAudit> {
  const { distDir = DIST_DIR, onProgress } = options
  const scratchDir = mkdtempSync(path.join(os.tmpdir(), 'undefined-bindings-'))
  const planFile = path.join(scratchDir, 'plan.json')
  writeFileSync(planFile, JSON.stringify(plan))
  const probeSource = buildProbeSource()
  const findings: UndefinedBindingFinding[] = []
  let next = 0
  let done = 0
  let observed = 0

  async function worker(): Promise<void> {
    while (next < targets.length) {
      const target = targets[next]!
      next += 1
      let stdout = ''
      try {
        ;({ stdout } = await execFileAsync('node', ['-e', probeSource], {
          env: {
            ...process.env,
            PROBE_PLAN: planFile,
            PROBE_TARGET: target.file,
          },
          maxBuffer: 64 * 1024 * 1024,
          timeout: PROBE_TIMEOUT_MS,
        }))
      } catch {
        // A subpath that cannot even load is a different check's business
        // (packed-tarball-resolves owns resolution). Do not fail here on it.
        done += 1
        onProgress?.(done)
        continue
      }
      const parsed = parseProbeOutput(stdout)
      observed += parsed.observed
      for (const raw of parsed.findings) {
        findings.push({
          binding: raw.binding,
          chain: findPathBack(raw.source, raw.file)?.map(f =>
            path.relative(distDir, f),
          ),
          file: path.relative(distDir, raw.file),
          source: path.relative(distDir, raw.source),
          subpath: target.subpath,
        })
      }
      done += 1
      onProgress?.(done)
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, os.cpus().length) }, worker),
  )
  return {
    findings: findings.toSorted((a, b) =>
      `${a.file}:${a.binding}:${a.subpath}` <
      `${b.file}:${b.binding}:${b.subpath}`
        ? -1
        : 1,
    ),
    observed,
  }
}

export async function main(): Promise<void> {
  const isQuiet = process.argv.includes('--quiet')

  if (!existsSync(DIST_DIR)) {
    logger.warn(
      '[undefined-bindings] dist/ is absent — run `pnpm run build` first. Skipping.',
    )
    return
  }

  const pkg = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as { exports?: Record<string, unknown> | undefined }
  const targets = listPublicSubpathTargets(pkg.exports ?? {}, REPO_ROOT)
  const plan = buildProbePlan(listDistFiles(DIST_DIR))
  const { findings, observed } = await auditUndefinedBindings(targets, plan)

  // A sweep that never located a single planned module in a child's require
  // cache proved nothing. That is not a pass — it is the check silently
  // no-opping, which is precisely the failure this file exists to end.
  if (observed === 0 && Object.keys(plan).length > 0) {
    logger.error(
      `[undefined-bindings] probed ${targets.length} subpath(s) and observed 0 of ${Object.keys(plan).length} planned module(s).`,
    )
    logger.error(
      "  Where:  the child require caches never matched the plan's file paths.",
    )
    logger.error('  Saw:    observed === 0')
    logger.error('  Wanted: at least one planned module loaded')
    logger.error(
      "  Fix:    the plan's paths are not the realpaths Node keys require.cache by.",
    )
    logger.error(
      '          Check that dist/ is reachable without an unresolved symlink.',
    )
    process.exitCode = 1
    return
  }

  if (findings.length > 0) {
    logger.error(
      `[undefined-bindings] ${findings.length} binding(s) are undefined at runtime.`,
    )
    logger.error('')
    for (let i = 0, { length } = findings; i < length; i += 1) {
      logger.error(formatFinding(findings[i]!))
      logger.error('')
    }
    process.exitCode = 1
    return
  }

  if (!isQuiet) {
    logger.success(
      `[undefined-bindings] ${targets.length} public subpath(s) probed in isolation — every exported binding is defined.`,
    )
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'imports every public subpath in isolation and fails when an exported binding is undefined',
  help: `Usage: node scripts/repo/check/exports-have-no-undefined-bindings.mts [flags]

  --quiet  print nothing on success`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
