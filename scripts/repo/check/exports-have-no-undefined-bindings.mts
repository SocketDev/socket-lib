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
import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { runMain } from '../../fleet/process/run-main.mts'
import {
  findPathBack,
  listDistFiles,
  readEagerReexports,
} from './reexports-have-no-import-cycles.mts'
import {
  buildProbeSource,
  parseProbeOutput,
} from './undefined-bindings-probe.mts'

import type { ProbeFinding } from './undefined-bindings-probe.mts'

import type { ScriptMeta } from '../../fleet/process/run-main.mts'

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

  // Targets are handed out in CHUNKS, one child per chunk, rather than one
  // child per target. Node startup dominated this check: 663 targets cost 663
  // process launches, ~26s of CPU for a few seconds of actual probing.
  const workerCount = Math.max(1, os.cpus().length)
  const chunkSize = Math.max(1, Math.ceil(targets.length / workerCount))
  const chunks: SubpathTarget[][] = []
  for (let i = 0; i < targets.length; i += chunkSize) {
    chunks.push(targets.slice(i, i + chunkSize))
  }

  async function worker(): Promise<void> {
    while (next < chunks.length) {
      const chunk = chunks[next]!
      next += 1
      const targetsFile = path.join(scratchDir, `targets-${next}.json`)
      writeFileSync(targetsFile, JSON.stringify(chunk.map(t => t.file)))
      let stdout = ''
      try {
        ;({ stdout } = await execFileAsync('node', ['-e', probeSource], {
          env: {
            ...process.env,
            PROBE_PLAN: planFile,
            PROBE_TARGETS: targetsFile,
          },
          maxBuffer: 256 * 1024 * 1024,
          timeout: PROBE_TIMEOUT_MS * chunk.length,
        }))
      } catch {
        // A chunk that dies takes its targets with it. Falling back to one
        // child per target keeps a single unloadable subpath from silently
        // dropping the rest of its chunk from the sweep.
        for (const target of chunk) {
          const single = await probeOne(target)
          if (single) {
            observed += single.observed
            collect(single.findings, target)
          }
          done += 1
          onProgress?.(done)
        }
        continue
      }
      const byTarget = new Map(chunk.map(t => [t.file, t]))
      const lines = stdout.split(/\r?\n/)
      for (let i = 0, { length } = lines; i < length; i += 1) {
        const line = lines[i] as string
        if (!line) {
          continue
        }
        const parsed = parseProbeOutput(line)
        const target = byTarget.get(parsed.target ?? '')
        observed += parsed.observed
        if (target) {
          collect(parsed.findings, target)
        }
        done += 1
        onProgress?.(done)
      }
    }
  }

  function collect(raws: readonly ProbeFinding[], target: SubpathTarget): void {
    for (const raw of raws) {
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
  }

  async function probeOne(
    target: SubpathTarget,
  ): Promise<{ findings: ProbeFinding[]; observed: number } | undefined> {
    const oneFile = path.join(scratchDir, 'one.json')
    writeFileSync(oneFile, JSON.stringify([target.file]))
    try {
      const { stdout } = await execFileAsync('node', ['-e', probeSource], {
        env: {
          ...process.env,
          PROBE_PLAN: planFile,
          PROBE_TARGETS: oneFile,
        },
        maxBuffer: 64 * 1024 * 1024,
        timeout: PROBE_TIMEOUT_MS,
      })
      const parsed = parseProbeOutput(stdout.split(/\r?\n/)[0] ?? '')
      return { findings: parsed.findings, observed: parsed.observed }
    } catch {
      // A subpath that cannot even load is a different check's business
      // (packed-tarball-resolves owns resolution). Do not fail here on it.
      return undefined
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
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
