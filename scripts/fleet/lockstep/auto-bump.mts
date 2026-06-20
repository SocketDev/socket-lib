/**
 * Resolve version-pin auto-bumps from a lockstep drift report — the
 * deterministic tag math the updating-lockstep skill drives, leaving the
 * test-gate, locked-row approval, and commit prose to the model.
 *
 * The high-churn pure core is the tag resolver: given the current `pinned_tag`,
 * the list of upstream tags, and the `upgrade_policy`, it filters pre-release
 * tags, detects the tag scheme, semver-sorts, and applies track-latest vs
 * major-gate. That logic was inline jq/bash across reference.md Phases 2-3b;
 * here it is one tested function. Reuses the harness's own Report types.
 *
 * Modes:
 *   --plan --report <lockstep.json | -> [--json]
 *       INPUT: the `pnpm run lockstep --json` report on stdin or at a path.
 *       OUTPUT: { auto: PlannedRow[], advisory: AdvisoryRow[] } — each auto row
 *       carries the already-resolved targetTag (or a skipReason for locked /
 *       no-newer / major-gate-major-diff). Collapses Phases 2 + 3a + 3b.
 *
 *   --apply --id <row-id> --target-tag <tag> [--manifest <lockstep.json>]
 *       Lands ONE resolved bump: checkout the target tag inside the row's
 *       submodule, rewrite that version-pin row's `pinned_tag` + `pinned_sha`
 *       in `lockstep.json`, regenerate the `.gitmodules` `# <name>-<version>
 *       sha256:…` annotation via gen-gitmodules-hash.mts --set, and commit
 *       `chore(deps): bump <upstream> to <tag>`. Collapses reference.md Phase 3
 *       (the bash the skill used to inline). The skill still owns the per-row
 *       test gate + the locked-row human approval (it only calls --apply for an
 *       already-approved, validated row); the deterministic git + edit + commit
 *       mechanics live here so they are tested, not re-typed per run.
 */

import process from 'node:process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { REPO_ROOT } from '../paths.mts'
import { readManifest } from './manifest.mts'

import type { Manifest, Report, VersionPinReport } from './types.mts'

export type UpgradePolicy = 'track-latest' | 'major-gate' | 'locked'

export interface SemVer {
  major: number
  minor: number
  patch: number
}

export interface ParsedTag {
  raw: string
  prefix: string
  version: SemVer
}

export interface PlannedRow {
  id: string
  upstream: string
  pinnedTag: string | undefined
  targetTag: string | undefined
  policy: string
  skipReason?: string | undefined
}

export interface AdvisoryRow {
  kind: string
  id: string
  note: string
}

// Pre-release / nightly / preview suffixes the skill always filters — it
// targets stable releases only (reference.md "Tag-stability filter").
const PRERELEASE_RE =
  /-(?:alpha|beta|dev|nightly|preview|rc|snapshot)(?:[._-]?\d+)?$/iu

export function isStableTag(tag: string): boolean {
  return !PRERELEASE_RE.test(tag)
}

// Parse a tag into { prefix, version } across the four schemes reference.md
// enumerates: `v1.2.3`, `1.2.3`, `<prefix>-1.2.3`, `<prefix>_1_2_3`. Returns
// undefined when no semver triple is present.
export function parseTag(tag: string): ParsedTag | undefined {
  // Underscore style (curl-style `<prefix>_1_2_3` and `v_1_2_3`): digits joined
  // by underscores.
  const underscore = /^(.*?)[._-]?(\d+)_(\d+)_(\d+)$/u.exec(tag)
  if (underscore && tag.includes('_')) {
    return {
      prefix: underscore[1]!.replace(/[._-]$/u, ''),
      raw: tag,
      version: {
        major: Number(underscore[2]),
        minor: Number(underscore[3]),
        patch: Number(underscore[4]),
      },
    }
  }
  // Dotted semver, optionally v-prefixed or `<prefix>-` prefixed.
  const dotted = /^(.*?)(\d+)\.(\d+)\.(\d+)$/u.exec(tag)
  if (dotted) {
    return {
      prefix: dotted[1]!.replace(/[._-]$/u, '').replace(/^v$/u, ''),
      raw: tag,
      version: {
        major: Number(dotted[2]),
        minor: Number(dotted[3]),
        patch: Number(dotted[4]),
      },
    }
  }
  return undefined
}

export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) {
    return a.major - b.major
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor
  }
  return a.patch - b.patch
}

// From the available tags, pick the target per policy. Only tags sharing the
// current tag's prefix + a parseable semver are candidates (so a `v`-scheme pin
// never jumps to a `<prefix>-` tag). Returns the chosen tag + an optional
// skipReason. Pure — the unit of the resolver, tested directly.
export function resolveTarget(
  pinnedTag: string | undefined,
  availableTags: readonly string[],
  policy: string,
): { targetTag: string | undefined; skipReason?: string | undefined } {
  if (policy === 'locked') {
    return { skipReason: 'upgrade_policy=locked — advisory only', targetTag: undefined }
  }
  const current = pinnedTag ? parseTag(pinnedTag) : undefined
  const stable = availableTags.filter(isStableTag)
  const parsed = stable
    .map(parseTag)
    .filter((p): p is ParsedTag => p !== undefined)
  // Constrain to the current scheme's prefix when we know it.
  const candidates =
    current === undefined
      ? parsed
      : parsed.filter(p => p.prefix === current.prefix)
  if (!candidates.length) {
    return { skipReason: 'no parseable stable tags found', targetTag: undefined }
  }
  candidates.sort((a, b) => compareSemVer(a.version, b.version))
  const latest = candidates[candidates.length - 1]!
  if (current && compareSemVer(latest.version, current.version) <= 0) {
    return { skipReason: 'already at the latest stable tag', targetTag: undefined }
  }
  if (
    policy === 'major-gate' &&
    current &&
    latest.version.major !== current.version.major
  ) {
    return {
      skipReason: `major bump (${current.version.major} → ${latest.version.major}) needs human review — policy=major-gate`,
      targetTag: undefined,
    }
  }
  return { targetTag: latest.raw }
}

function isVersionPin(r: Report): r is VersionPinReport {
  return r.kind === 'version-pin'
}

// Partition a lockstep report into the auto (version-pin, actionable policy)
// and advisory (everything else with drift/error) lists. The auto rows have no
// targetTag yet — the skill resolves each against its fetched tags via
// resolveTarget; --plan does that when given a tag map.
export function planFromReport(
  reports: readonly Report[],
  tagsByUpstream: Record<string, readonly string[]>,
): { auto: PlannedRow[]; advisory: AdvisoryRow[] } {
  const auto: PlannedRow[] = []
  const advisory: AdvisoryRow[] = []
  for (let i = 0, { length } = reports; i < length; i += 1) {
    const r = reports[i]!
    if (r.severity === 'ok') {
      continue
    }
    if (
      isVersionPin(r) &&
      (r.upgrade_policy === 'major-gate' || r.upgrade_policy === 'track-latest')
    ) {
      const tags = tagsByUpstream[r.upstream] ?? []
      const resolved = resolveTarget(r.pinned_tag, tags, r.upgrade_policy)
      if (resolved.targetTag) {
        auto.push({
          id: r.id,
          pinnedTag: r.pinned_tag,
          policy: r.upgrade_policy,
          targetTag: resolved.targetTag,
          upstream: r.upstream,
        })
      } else {
        // A version-pin that can't auto-bump (locked-major, no-newer) is an
        // advisory line, not a silent drop.
        advisory.push({
          id: r.id,
          kind: 'version-pin',
          note: resolved.skipReason ?? 'no target tag resolved',
        })
      }
      continue
    }
    advisory.push({
      id: r.id,
      kind: r.kind,
      note: `${r.severity} — needs human review`,
    })
  }
  return { advisory, auto }
}

// ---------------------------------------------------------------------------
// --apply orchestration. The deterministic git + edit + commit mechanics for
// landing one already-resolved, already-approved bump. Shared annotation helper
// (`gitmodulesLabelForTag`) is used by both the apply path and the skill's
// advisory prose so the `# <name>-<version>` label is computed one way.
// ---------------------------------------------------------------------------

export interface ApplyOptions {
  id: string
  manifestPath: string
  repoRoot: string
  targetTag: string
}

export interface ApplyResult {
  committed: boolean
  gitmodulesLabel: string
  pinnedSha: string
  state: 'bumped' | 'skipped-no-row' | 'skipped-no-submodule'
  submodulePath: string | undefined
  targetTag: string
}

// The `# <name>-<version>` label gen-gitmodules-hash.mts --set stamps above the
// submodule block: the submodule's basename + the target tag. Pure so the
// advisory prose and the apply write agree on one label.
export function gitmodulesLabelForTag(
  submodulePath: string,
  targetTag: string,
): string {
  return `${path.basename(submodulePath)}-${targetTag}`
}

function runGit(repoRoot: string, args: readonly string[]): string {
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    stdioString: true,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (status ${result.status}): ${String(result.stderr).trim()}`,
    )
  }
  return String(result.stdout)
}

// Locate the version-pin row + its submodule path in the manifest. Returns
// undefined for either when the id is unknown or its upstream has no submodule
// — the apply path turns those into a skipped (not thrown) result so a stale id
// from a re-run plan is a no-op, not a crash.
function findVersionPinRow(
  manifest: Manifest,
  id: string,
): { submodulePath: string | undefined; upstreamAlias: string } | undefined {
  for (let i = 0, rows = manifest.rows, { length } = rows; i < length; i += 1) {
    const row = rows[i]!
    if (row.kind === 'version-pin' && row.id === id) {
      const upstream = manifest.upstreams?.[row.upstream]
      return {
        submodulePath: upstream?.submodule,
        upstreamAlias: row.upstream,
      }
    }
  }
  return undefined
}

// Rewrite ONE version-pin row's `pinned_tag` + `pinned_sha` in the manifest
// JSON, preserving the file's existing 2-space formatting + trailing newline.
function writePinnedFields(
  manifestPath: string,
  id: string,
  options: { pinnedSha: string; pinnedTag: string },
): void {
  const { pinnedSha, pinnedTag } = { __proto__: null, ...options } as {
    pinnedSha: string
    pinnedTag: string
  }
  const raw = readFileSync(manifestPath, 'utf8')
  const trailingNewline = raw.endsWith('\n')
  const parsed: unknown = JSON.parse(raw)
  const manifest = parsed as Manifest
  for (let i = 0, rows = manifest.rows, { length } = rows; i < length; i += 1) {
    const row = rows[i]!
    if (row.kind === 'version-pin' && row.id === id) {
      row.pinned_sha = pinnedSha
      row.pinned_tag = pinnedTag
    }
  }
  const serialized = JSON.stringify(manifest, undefined, 2)
  writeFileSync(manifestPath, trailingNewline ? `${serialized}\n` : serialized)
}

// Land one resolved bump. Checkout the target tag in the submodule, resolve its
// commit SHA, rewrite the manifest row, regenerate the .gitmodules annotation,
// then commit. The caller (skill) is responsible for the test gate + locked-row
// approval BEFORE calling this — apply is the deterministic write half.
export function applyBump(options: ApplyOptions): ApplyResult {
  const opts = { __proto__: null, ...options } as ApplyOptions
  const { id, manifestPath, repoRoot, targetTag } = opts
  const manifest = readManifest(manifestPath)
  const found = findVersionPinRow(manifest, id)
  if (!found) {
    return {
      committed: false,
      gitmodulesLabel: '',
      pinnedSha: '',
      state: 'skipped-no-row',
      submodulePath: undefined,
      targetTag,
    }
  }
  const { submodulePath } = found
  if (!submodulePath) {
    return {
      committed: false,
      gitmodulesLabel: '',
      pinnedSha: '',
      state: 'skipped-no-submodule',
      submodulePath: undefined,
      targetTag,
    }
  }
  const submoduleDir = path.join(repoRoot, submodulePath)
  // Fetch tags then checkout — a shallow submodule may not have the tag yet.
  runGit(submoduleDir, ['fetch', '--tags', '--quiet'])
  runGit(submoduleDir, ['checkout', '--quiet', targetTag])
  const pinnedSha = runGit(submoduleDir, ['rev-parse', 'HEAD']).trim()
  const gitmodulesLabel = gitmodulesLabelForTag(submodulePath, targetTag)

  writePinnedFields(manifestPath, id, { pinnedSha, pinnedTag: targetTag })

  // Regenerate the `# <name>-<version> sha256:…` annotation. gen-gitmodules-hash
  // --set bumps the block's ref AND recomputes the archive hash in one write —
  // the only annotation path uses-sha-verify-guard accepts.
  const gen = spawnSync(
    'node',
    [
      'scripts/fleet/gen-gitmodules-hash.mts',
      '--set',
      submodulePath,
      pinnedSha,
      '--label',
      gitmodulesLabel,
      path.join(repoRoot, '.gitmodules'),
    ],
    { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], stdioString: true },
  )
  if (gen.error) {
    throw gen.error
  }
  if (gen.status !== 0) {
    throw new Error(
      `gen-gitmodules-hash --set failed (status ${gen.status}): ${String(gen.stderr).trim()}`,
    )
  }

  const upstreamAlias = found.upstreamAlias
  runGit(repoRoot, [
    'commit',
    '-o',
    submodulePath,
    '-o',
    manifestPath,
    '-o',
    path.join(repoRoot, '.gitmodules'),
    '-m',
    `chore(deps): bump ${upstreamAlias} to ${targetTag}`,
  ])

  return {
    committed: true,
    gitmodulesLabel,
    pinnedSha,
    state: 'bumped',
    submodulePath,
    targetTag,
  }
}

function readReport(src: string | undefined): Report[] {
  const raw =
    src && src !== '-'
      ? readFileSync(src, 'utf8')
      : readFileSync(0, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (
    parsed &&
    typeof parsed === 'object' &&
    'reports' in parsed &&
    Array.isArray((parsed as { reports: unknown }).reports)
  ) {
    return (parsed as { reports: Report[] }).reports
  }
  throw new Error(
    'expected a lockstep report with a `reports[]` array (the `pnpm run lockstep --json` output). Pass --report <path> or pipe it on stdin.',
  )
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag)
  return idx !== -1 ? argv[idx + 1] : undefined
}

function runApply(argv: readonly string[]): number {
  const id = flagValue(argv, '--id')
  const targetTag = flagValue(argv, '--target-tag')
  if (!id || !targetTag) {
    process.stderr.write(
      'usage: auto-bump.mts --apply --id <row-id> --target-tag <tag> [--manifest <lockstep.json>]\n',
    )
    return 1
  }
  const manifestPath =
    flagValue(argv, '--manifest') ?? path.join(REPO_ROOT, 'lockstep.json')
  const result = applyBump({
    id,
    manifestPath,
    repoRoot: REPO_ROOT,
    targetTag,
  })
  process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`)
  return result.state === 'bumped' ? 0 : 1
}

function runPlan(argv: readonly string[]): number {
  const reportIdx = argv.indexOf('--report')
  const reports = readReport(reportIdx !== -1 ? argv[reportIdx + 1] : undefined)
  const tagsIdx = argv.indexOf('--tags')
  const tagsByUpstream: Record<string, string[]> =
    tagsIdx !== -1 ? JSON.parse(readFileSync(argv[tagsIdx + 1]!, 'utf8')) : {}
  const plan = planFromReport(reports, tagsByUpstream)
  process.stdout.write(`${JSON.stringify(plan, undefined, 2)}\n`)
  return 0
}

export function main(argv: readonly string[]): number {
  if (argv.includes('--apply')) {
    return runApply(argv)
  }
  if (argv.includes('--plan')) {
    return runPlan(argv)
  }
  process.stderr.write(
    'usage: auto-bump.mts --plan --report <lockstep.json|-> [--tags <tags.json>] [--json]\n' +
      '       auto-bump.mts --apply --id <row-id> --target-tag <tag> [--manifest <lockstep.json>]\n',
  )
  return 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
