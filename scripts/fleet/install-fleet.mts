#!/usr/bin/env node
/*
 * @file Zero-npm-dependency fleet bundle installer. A consumer repo needs only
 *   this one file copied in plus one package.json script. Running it downloads
 *   the release bundle from a socket-wheelhouse GitHub Release, verifies every
 *   file's SHA-256, copies byte-identical files into <dest>, and splices the
 *   fleet-canonical block into each hybrid file (CLAUDE.md, .gitignore, …) that
 *   carries BEGIN/END fleet-canonical markers.
 *
 *   Zero deps: only node: builtins + system tools `gh` (download) and `tar`
 *   (extract). No @socketsecurity/* imports — this file cascades into consumer
 *   repos that don't have the wheelhouse dep tree.
 *
 *   USAGE: node scripts/fleet/install-fleet.mts --ref <tag> [--repo <owner/repo>]
 *   [--dest <dir>] [--dry-run]
 */

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// ── inline types ──────────────────────────────────────────────────────────────

export type FleetCommentStyle = 'hash' | 'html' | 'slash'

export interface BundleManifest {
  readonly files: Record<string, string>
  readonly segments?: readonly SegmentEntry[] | undefined
  readonly templateSha: string
  readonly version: string
  readonly workspaceSegment?: WorkspaceSegmentEntry | undefined
}

export interface InstallOptions {
  readonly dest?: string | undefined
  readonly dryRun?: boolean | undefined
  // Skip the fetch when the pinned ref is already applied (idempotent — the
  // belt/prepare wire passes this so a warm `pnpm install` does no network).
  readonly ifCurrent?: boolean | undefined
  // The release tag to install. Empty → resolved from the member's settings
  // file (`bundle.ref` in .config/socket-wheelhouse.json).
  readonly ref: string
  readonly repo?: string | undefined
  readonly thin?: boolean | undefined
  readonly wire?: boolean | undefined
}

export interface MergeWorkspaceOptions {
  readonly bundleFleetSections: string
  readonly consumerYaml: string
  readonly fleetKeys: readonly string[]
}

export interface ThinOptions {
  readonly dest: string
  readonly manifest: BundleManifest
}

export interface WorkspaceSegmentEntry {
  readonly fleetKeys: readonly string[]
  readonly path: string
  readonly sha256: string
}

export interface SegmentEntry {
  readonly commentStyle: FleetCommentStyle
  readonly path: string
  readonly sha256: string
}

export interface SpliceOptions {
  readonly commentStyle: FleetCommentStyle
  readonly fleetBlock: string
  readonly target: string
}

// ── constants ─────────────────────────────────────────────────────────────────

const DEFAULT_REPO = 'SocketDev/socket-wheelhouse'
const MANIFEST_NAME = 'release-bundle-manifest.json'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

// ── pure helpers ──────────────────────────────────────────────────────────────

function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message
  }
  return String(e)
}

/**
 * Compute the SHA-256 hex digest of a Buffer — used for both files (byte-
 * identical verification) and fleet-block segments.
 */
export function computeSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/**
 * The BEGIN marker line for a given comment style, matching the grammar used by
 * fleet-markers.mts on the producer side. Inlined here so this file stays
 * dep-0 — it cannot import the wheelhouse's fleet-markers module.
 */
export function beginMarker(style: FleetCommentStyle): string {
  if (style === 'html') {
    return '<!-- BEGIN <fleet-canonical> -->'
  }
  if (style === 'slash') {
    return '// BEGIN <fleet-canonical>'
  }
  return '# BEGIN <fleet-canonical>'
}

/**
 * The END marker line for a given comment style.
 */
export function endMarker(style: FleetCommentStyle): string {
  if (style === 'html') {
    return '<!-- END </fleet-canonical> -->'
  }
  if (style === 'slash') {
    return '// END </fleet-canonical>'
  }
  return '# END </fleet-canonical>'
}

/**
 * Splice the canonical fleet block into `target`. If `target` already contains
 * the BEGIN/END markers, the content between them (markers inclusive) is
 * replaced. If markers are absent:
 * - `html` style (CLAUDE.md, README): insert before the first level-2 heading
 * (`## `) with i > 0, or append at end.
 * - other styles: append with a leading blank line separator.
 */
export function spliceFleetBlock(options: SpliceOptions): string {
  const opts = { __proto__: null, ...options } as SpliceOptions
  const { commentStyle, fleetBlock, target } = opts
  const begin = beginMarker(commentStyle)
  const end = endMarker(commentStyle)
  const lines = target.split('\n')
  const startIdx = lines.findIndex(l => l === begin)
  const endIdx = lines.findIndex(l => l === end)
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = lines.slice(0, startIdx)
    const after = lines.slice(endIdx + 1)
    return [...before, fleetBlock, ...after].join('\n')
  }
  if (commentStyle === 'html') {
    let insertIdx = lines.length
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i]!.startsWith('## ')) {
        insertIdx = i
        break
      }
    }
    const before = lines.slice(0, insertIdx)
    const after = lines.slice(insertIdx)
    return [...before, fleetBlock, '', ...after].join('\n')
  }
  const trimmed = target.replace(/\n+$/, '')
  return `${trimmed}\n\n${fleetBlock}\n`
}

// Matches a column-0 top-level YAML key at the start of a line.
const COL0_KEY_RE = /^[A-Za-z][\w-]*:/

/**
 * Parse a YAML string into an ordered list of top-level key blocks. Each block
 * owns all lines from the key line up to (not including) the next column-0 key
 * line or EOF.
 */
function parseYamlKeyBlocks(
  yaml: string,
): Array<{ key: string; lines: string[] }> {
  const lines = yaml.split('\n')
  const blocks: Array<{ key: string; lines: string[] }> = []
  let current: { key: string; lines: string[] } | undefined
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    if (COL0_KEY_RE.test(line)) {
      if (current !== undefined) {
        blocks.push(current)
      }
      const colonIdx = line.indexOf(':')
      current = { key: line.slice(0, colonIdx), lines: [line] }
    } else if (current !== undefined) {
      current.lines.push(line)
    }
  }
  if (current !== undefined) {
    blocks.push(current)
  }
  return blocks
}

/**
 * Merge the fleet-managed workspace sections from `bundleFleetSections` into
 * `consumerYaml`, replacing only the keys listed in `fleetKeys`. Non-fleet keys
 * (including `packages:`) are preserved byte-exact. Throws on ambiguous input.
 */
export function mergeWorkspaceYaml(options: MergeWorkspaceOptions): string {
  const opts = { __proto__: null, ...options } as MergeWorkspaceOptions
  const { bundleFleetSections, consumerYaml, fleetKeys } = opts

  const consumerBlocks = parseYamlKeyBlocks(consumerYaml)
  const bundleBlocks = parseYamlKeyBlocks(bundleFleetSections)

  // Fail-closed: check for duplicate fleet keys in consumer.
  const fleetKeySet = new Set(fleetKeys)
  const consumerKeyCounts = new Map<string, number>()
  for (let i = 0, { length } = consumerBlocks; i < length; i += 1) {
    const block = consumerBlocks[i]!
    if (fleetKeySet.has(block.key)) {
      consumerKeyCounts.set(
        block.key,
        (consumerKeyCounts.get(block.key) ?? 0) + 1,
      )
    }
  }
  for (const [key, count] of consumerKeyCounts) {
    if (count > 1) {
      throw new Error(
        `mergeWorkspaceYaml: fleet key "${key}" appears ${count} times at column 0 in consumerYaml — cannot merge safely`,
      )
    }
  }

  // Build a map of bundle blocks keyed by name.
  const bundleMap = new Map<string, { key: string; lines: string[] }>()
  for (let i = 0, { length } = bundleBlocks; i < length; i += 1) {
    const block = bundleBlocks[i]!
    bundleMap.set(block.key, block)
  }

  // Build result: iterate consumer blocks, replacing fleet-managed ones.
  const resultBlocks: Array<{ key: string; lines: string[] }> = []
  const handledFleetKeys = new Set<string>()
  for (let i = 0, { length } = consumerBlocks; i < length; i += 1) {
    const block = consumerBlocks[i]!
    if (fleetKeySet.has(block.key)) {
      const bundleBlock = bundleMap.get(block.key)
      if (bundleBlock !== undefined) {
        resultBlocks.push(bundleBlock)
      } else {
        resultBlocks.push(block)
      }
      handledFleetKeys.add(block.key)
    } else {
      resultBlocks.push(block)
    }
  }

  // Append any fleet keys from the bundle that don't exist in the consumer.
  for (let i = 0, { length } = fleetKeys; i < length; i += 1) {
    const key = fleetKeys[i]!
    if (!handledFleetKeys.has(key)) {
      const bundleBlock = bundleMap.get(key)
      if (bundleBlock !== undefined) {
        resultBlocks.push(bundleBlock)
      }
    }
  }

  // Reconstruct YAML from blocks. Each block's lines already contain any
  // trailing blank lines that were part of the original block.
  const output = resultBlocks.map(b => b.lines.join('\n')).join('\n')
  // Normalise to a single trailing newline.
  return `${output.replace(/\n+$/, '')}\n`
}

// ── I/O helpers ───────────────────────────────────────────────────────────────

function run(cmd: string, args: readonly string[]): void {
  execFileSync(cmd, args as string[], { stdio: 'inherit' })
}

function readManifest(manifestPath: string): BundleManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as BundleManifest
}

function walkFiles(dir: string, base: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkFiles(abs, base))
    } else if (entry.isFile()) {
      out.push(path.relative(base, abs))
    }
  }
  return out
}

// ── verification ──────────────────────────────────────────────────────────────

/**
 * Verify every file in `manifest.files` against its expected SHA-256 digest.
 * Returns a list of problem descriptions — empty means all verified. A single
 * mismatch must abort the whole install (fail closed).
 */
export function verifyBundleFiles(
  filesDir: string,
  manifest: BundleManifest,
): string[] {
  const problems: string[] = []
  for (const rel of Object.keys(manifest.files)) {
    const abs = path.join(filesDir, rel)
    if (!existsSync(abs)) {
      problems.push(`missing from bundle: ${rel}`)
      continue
    }
    const actual = computeSha256(readFileSync(abs))
    const expected = manifest.files[rel]!
    if (actual !== expected) {
      problems.push(`sha256 mismatch: ${rel} (got ${actual}, want ${expected})`)
    }
  }
  return problems
}

/**
 * Verify every segment in `manifest.segments` against its expected SHA-256. A
 * segment mismatch is just as fatal as a file mismatch — the splice result
 * would silently differ from the producer's intent.
 */
export function verifySegments(
  segmentsDir: string,
  manifest: BundleManifest,
): string[] {
  const segments = manifest.segments
  if (!segments || segments.length === 0) {
    return []
  }
  const problems: string[] = []
  for (const entry of segments) {
    const destName = `${entry.path.replace(/^\./, 'dot-')}.fleetblock`
    const abs = path.join(segmentsDir, destName)
    if (!existsSync(abs)) {
      problems.push(`missing segment: ${entry.path}`)
      continue
    }
    const actual = computeSha256(readFileSync(abs))
    if (actual !== entry.sha256) {
      problems.push(
        `sha256 mismatch for segment ${entry.path} (got ${actual}, want ${entry.sha256})`,
      )
    }
  }
  return problems
}

// ── install ───────────────────────────────────────────────────────────────────

/**
 * Copy every verified byte-identical file from `filesDir` into `dest`,
 * creating parent directories as needed.
 */
export function installFiles(
  filesDir: string,
  dest: string,
  manifest: BundleManifest,
): void {
  for (const rel of Object.keys(manifest.files)) {
    const target = path.join(dest, rel)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(path.join(filesDir, rel), target)
  }
}

/**
 * Apply each fleet-canonical segment: read the `.fleetblock` file, read the
 * consumer's existing file (or start with an empty string), splice the block
 * in, and write back.
 */
export function installSegments(
  segmentsDir: string,
  dest: string,
  manifest: BundleManifest,
): void {
  const segments = manifest.segments
  if (!segments || segments.length === 0) {
    return
  }
  for (const entry of segments) {
    const destName = `${entry.path.replace(/^\./, 'dot-')}.fleetblock`
    const blockPath = path.join(segmentsDir, destName)
    const fleetBlock = readFileSync(blockPath, 'utf8')
    const targetPath = path.join(dest, entry.path)
    const existing = existsSync(targetPath)
      ? readFileSync(targetPath, 'utf8')
      : ''
    const updated = spliceFleetBlock({
      commentStyle: entry.commentStyle,
      fleetBlock,
      target: existing,
    })
    mkdirSync(path.dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, updated)
  }
}

/**
 * If the manifest includes a `workspaceSegment`, merge the fleet-managed
 * sections into the consumer's `pnpm-workspace.yaml`. Returns 0 on success,
 * 1 on any error (fail-closed).
 */
export function installWorkspaceSegment(
  segmentsDir: string,
  dest: string,
  manifest: BundleManifest,
): number {
  const ws = manifest.workspaceSegment
  if (ws === undefined) {
    return 0
  }
  const fleetFile = path.join(segmentsDir, 'pnpm-workspace.yaml.fleet')
  if (!existsSync(fleetFile)) {
    console.log(
      `install-fleet: workspace segment file missing at ${fleetFile} — skipping workspace merge`,
    )
    return 0
  }
  const bundleFleetSections = readFileSync(fleetFile, 'utf8')
  const targetPath = path.join(dest, 'pnpm-workspace.yaml')
  const consumerYaml = existsSync(targetPath)
    ? readFileSync(targetPath, 'utf8')
    : ''
  try {
    const merged = mergeWorkspaceYaml({
      bundleFleetSections,
      consumerYaml,
      fleetKeys: ws.fleetKeys,
    })
    writeFileSync(targetPath, merged)
  } catch (e) {
    console.log(
      `install-fleet: pnpm-workspace.yaml merge failed — ${errorMessage(e)}. Nothing written.`,
    )
    return 1
  }
  return 0
}

// The full manual re-fetch script + the idempotent auto-fetch that the
// `prepare` BELT prepends. Exported so the enforcement check (a thin member
// must carry the belt) tests against the exact strings, not a copy.
export const SYNC_FLEET_SCRIPT = 'node scripts/fleet/install-fleet.mts'
export const PREPARE_FETCH = 'node scripts/fleet/install-fleet.mts --if-current'

/**
 * Wire the consumer's package.json for thin distribution: a `sync-fleet` script
 * (manual full re-fetch) and the `prepare` BELT — the idempotent auto-fetch
 * prepended so a fresh clone / CI `pnpm install` repopulates the untracked
 * fleet payload BEFORE the (itself-untracked) install-git-hooks step + any
 * chained build runs. Idempotent: skips when both are already in place. No-ops
 * if package.json is absent. (Dep-0 file — raw JSON, not EditablePackageJson.)
 */
export function wirePackageJson(dest: string): void {
  const pkgPath = path.join(dest, 'package.json')
  if (!existsSync(pkgPath)) {
    console.log(
      `install-fleet: --wire: no package.json at ${pkgPath} — skipping`,
    )
    return
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<
    string,
    unknown
  >
  const scripts = (pkg['scripts'] ?? {}) as Record<string, string>
  let changed = false
  if (scripts['sync-fleet'] !== SYNC_FLEET_SCRIPT) {
    scripts['sync-fleet'] = SYNC_FLEET_SCRIPT
    changed = true
  }
  // Prepend the belt to `prepare`. The fetch MUST run first (install-git-hooks
  // and any build step are untracked in a thin repo, so they're absent until
  // the fetch lands them).
  const prepare = scripts['prepare']
  if (!prepare) {
    scripts['prepare'] = PREPARE_FETCH
    changed = true
  } else if (!prepare.startsWith(PREPARE_FETCH)) {
    scripts['prepare'] = `${PREPARE_FETCH} && ${prepare}`
    changed = true
  }
  if (!changed) {
    return
  }
  pkg['scripts'] = scripts
  writeFileSync(pkgPath, `${JSON.stringify(pkg, undefined, 2)}\n`)
}

/**
 * Compute the gitignore entries for thin mode — the wholly-fleet files that the
 * download/fetch action supplies, so they need not be git-tracked. Hybrid paths
 * (manifest.segments — CLAUDE.md, pnpm-workspace.yaml, …) are merged per repo
 * and stay tracked, so they're excluded. Each remaining non-hybrid path is
 * collapsed to an entry that can NEVER catch a repo-owned sibling:
 *
 * - A path under a `fleet/` tier (`.claude/hooks/fleet/…`, `.config/fleet/…`,
 *   `docs/agents.md/fleet/…`, `scripts/fleet/…`) collapses to that tier root.
 *   The `fleet/` convention guarantees the dir holds only fleet files; the
 *   member's own live beside it under `repo/`.
 * - EVERY other path — a root file (`.npmrc`), or a wholly-fleet file inside a
 *   MIXED dir (`.github/workflows/provenance.yml`, where the member's OWN
 *   ci.yml also lives) — is listed EXACTLY.
 *
 * A blind 2-segment collapse would gitignore `.github/workflows/` (member CI),
 * `.claude/hooks/repo/`, `.config/repo/` — repo-owned. This never does that.
 */
export function thinIgnoreEntries(manifest: {
  files: Record<string, string>
  segments?: ReadonlyArray<{ path: string }> | undefined
}): string[] {
  const hybridPaths = new Set((manifest.segments ?? []).map(s => s.path))
  const entries = new Set<string>()
  for (const p of Object.keys(manifest.files)) {
    if (hybridPaths.has(p)) {
      continue
    }
    const parts = p.split('/')
    const fleetIdx = parts.indexOf('fleet')
    entries.add(
      fleetIdx >= 0 ? `${parts.slice(0, fleetIdx + 1).join('/')}/` : p,
    )
  }
  return [...entries].toSorted()
}

/**
 * Apply thin mode: write a fleet-managed `.gitignore` block listing the
 * wholly-fleet bundle paths (see thinIgnoreEntries) plus `.agents/`, then
 * untrack them from git so the fetch action repopulates them going forward.
 */
export function applyThinMode(options: ThinOptions): void {
  const opts = { __proto__: null, ...options } as ThinOptions
  const { dest, manifest } = opts

  const sortedRoots = thinIgnoreEntries(manifest)

  // Build the gitignore block content. `.agents/` is the regenerated agent
  // mirror — dead weight in a thin consumer (the fetch repopulates it), so
  // untrack it too. The `!…install-fleet.mts` negation keeps the dep-0
  // bootstrap tracked (the one wire point a thin repo must retain).
  const blockLines = [
    '.agents/',
    ...sortedRoots,
    '!scripts/fleet/install-fleet.mts',
  ]
  const fleetBlock = [
    beginMarker('hash'),
    ...blockLines,
    endMarker('hash'),
  ].join('\n')

  // Splice into .gitignore (create if absent).
  const gitignorePath = path.join(dest, '.gitignore')
  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf8')
    : ''
  const updated = spliceFleetBlock({
    commentStyle: 'hash',
    fleetBlock,
    target: existing,
  })
  writeFileSync(gitignorePath, updated)

  // Untrack the fleet payload + the dead `.agents/` mirror from git (non-fatal
  // if git rm fails — e.g. a path that was never tracked). `--ignore-unmatch`
  // tolerates entries absent from the index.
  const rmTargets = ['.agents/', ...sortedRoots]
  if (rmTargets.length > 0) {
    try {
      execFileSync(
        'git',
        ['rm', '-r', '--cached', '--ignore-unmatch', ...rmTargets],
        { cwd: dest, stdio: 'inherit' },
      )
    } catch (e) {
      console.log(
        `install-fleet: --thin: git rm --cached failed (non-fatal) — ${errorMessage(e)}`,
      )
    }
  }
}

// ── settings + applied-ref marker ───────────────────────────────────────────

// The member's wheelhouse settings file — the single member-owned config
// surface (repo identity + the pinned bundle ref). Relative to <dest>.
const SETTINGS_PATH = '.config/socket-wheelhouse.json'
// Local, gitignored marker recording the ref of the last-applied bundle. Lives
// under the (thin-untracked) .config/fleet/ tree, so a fresh clone has none and
// the fetch runs; `--if-current` reads it to skip a redundant warm fetch.
const APPLIED_MARKER = '.config/fleet/.bundle-applied'

/**
 * Default bundle ref for a member — `bundle.ref` in its wheelhouse settings
 * file. Lets install-fleet (and the prepare/CI wires) omit an explicit --ref so
 * the pin lives in exactly one place. Returns undefined when absent/malformed.
 */
export function readBundleRef(dest: string): string | undefined {
  const p = path.join(dest, SETTINGS_PATH)
  if (!existsSync(p)) {
    return undefined
  }
  try {
    const json = JSON.parse(readFileSync(p, 'utf8')) as {
      bundle?: { ref?: string | undefined } | undefined
    }
    return json.bundle?.ref
  } catch {
    return undefined
  }
}

function readAppliedRef(dest: string): string | undefined {
  const p = path.join(dest, APPLIED_MARKER)
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : undefined
}

function writeAppliedRef(dest: string, ref: string): void {
  const p = path.join(dest, APPLIED_MARKER)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, `${ref}\n`)
}

// ── main flow ─────────────────────────────────────────────────────────────────

export function parseArgs(argv: readonly string[]): InstallOptions {
  const opts = {
    __proto__: null,
    dest: repoRoot,
    dryRun: false,
    ifCurrent: false,
    ref: '',
    repo: DEFAULT_REPO,
    thin: false,
    wire: false,
  } as unknown as {
    dest: string
    dryRun: boolean
    ifCurrent: boolean
    ref: string
    repo: string
    thin: boolean
    wire: boolean
  }
  for (let i = 0, { length } = argv; i < length; i += 1) {
    const arg = argv[i]!
    if (arg === '--dest') {
      opts.dest = argv[++i] ?? repoRoot
    } else if (arg === '--dry-run') {
      opts.dryRun = true
    } else if (arg === '--if-current') {
      opts.ifCurrent = true
    } else if (arg === '--ref') {
      opts.ref = argv[++i] ?? ''
    } else if (arg === '--repo') {
      opts.repo = argv[++i] ?? DEFAULT_REPO
    } else if (arg === '--thin') {
      opts.thin = true
    } else if (arg === '--wire') {
      opts.wire = true
    }
  }
  return opts as InstallOptions
}

/**
 * Download, verify, and apply the fleet bundle identified by `options.ref`.
 * Returns 0 on success, 1 on any error.
 */
export async function installFleet(options: InstallOptions): Promise<number> {
  const opts = { __proto__: null, ...options } as InstallOptions
  const dest = path.resolve(opts.dest ?? repoRoot)
  // Resolve the ref: an explicit --ref wins, else the member's pinned
  // `bundle.ref` (so the pin lives in exactly one place — the settings file).
  const ref = opts.ref || readBundleRef(dest) || ''
  if (!ref) {
    // --if-current is the CI/prepare-safe mode: a repo with no pinned
    // `bundle.ref` isn't a thin consumer, so there's nothing to fetch. No-op
    // success lets the belt (prepare) + suspenders (CI) call this
    // unconditionally — it stays inert in the wheelhouse + non-thin members.
    if (opts.ifCurrent) {
      console.log(
        'install-fleet: no bundle.ref pinned — not a thin consumer, ' +
          'nothing to fetch.',
      )
      return 0
    }
    console.log(
      'install-fleet: no --ref and no `bundle.ref` in ' +
        `${SETTINGS_PATH}. Pass --ref fleet-<sha> or set bundle.ref.`,
    )
    return 1
  }
  // Idempotent warm path: the belt/prepare wire passes --if-current, so a
  // `pnpm install` whose pinned ref is already applied does no network.
  if (opts.ifCurrent && readAppliedRef(dest) === ref) {
    console.log(
      `install-fleet: bundle ${ref} already applied — skipping fetch.`,
    )
    return 0
  }
  const repo = opts.repo ?? DEFAULT_REPO
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'fleet-install-'))
  try {
    console.log(`install-fleet: downloading ${ref} from ${repo}…`)
    try {
      run('gh', [
        'release',
        'download',
        ref,
        '--repo',
        repo,
        '--pattern',
        '*.tar.gz',
        '--pattern',
        MANIFEST_NAME,
        '--dir',
        tmp,
      ])
    } catch (e) {
      console.log(
        `install-fleet: download failed for ${repo}@${ref}: ${errorMessage(e)}. ` +
          'Check the tag exists and gh is authenticated.',
      )
      return 1
    }
    const manifestPath = path.join(tmp, MANIFEST_NAME)
    if (!existsSync(manifestPath)) {
      console.log(
        `install-fleet: release ${ref} has no ${MANIFEST_NAME} asset.`,
      )
      return 1
    }
    const manifest = readManifest(manifestPath)
    const tarball = readdirSync(tmp).find(f => f.endsWith('.tar.gz'))
    if (!tarball) {
      console.log(`install-fleet: release ${ref} has no .tar.gz asset.`)
      return 1
    }
    const extractDir = path.join(tmp, 'extracted')
    mkdirSync(extractDir, { recursive: true })
    run('tar', ['-xzf', path.join(tmp, tarball), '-C', extractDir])
    const filesDir = path.join(extractDir, 'files')
    const segmentsDir = path.join(extractDir, 'segments')
    if (!existsSync(filesDir)) {
      console.log(
        `install-fleet: bundle ${ref} has no files/ directory — unexpected layout.`,
      )
      return 1
    }
    const problems = [
      ...verifyBundleFiles(filesDir, manifest),
      ...verifySegments(segmentsDir, manifest),
    ]
    if (problems.length > 0) {
      console.log(
        `install-fleet: verification FAILED for ${ref} (${problems.length} problem(s)); ` +
          `nothing written. First few:\n  ${problems.slice(0, 5).join('\n  ')}`,
      )
      return 1
    }
    const fileCount = Object.keys(manifest.files).length
    const segmentCount = manifest.segments?.length ?? 0
    if (opts.dryRun) {
      console.log(
        `install-fleet: [dry-run] ${fileCount} file(s) + ${segmentCount} segment(s) verified ` +
          `for ${ref} (template ${manifest.templateSha}). Would write into ${dest}.`,
      )
      return 0
    }
    installFiles(filesDir, dest, manifest)
    installSegments(segmentsDir, dest, manifest)
    const wsResult = installWorkspaceSegment(segmentsDir, dest, manifest)
    if (wsResult !== 0) {
      return wsResult
    }
    if (opts.wire) {
      wirePackageJson(dest)
    }
    if (opts.thin) {
      applyThinMode({ dest, manifest })
    }
    // Record the applied ref so a subsequent --if-current run can skip a warm
    // re-fetch. Written after a successful apply only.
    writeAppliedRef(dest, ref)
    console.log(
      `install-fleet: placed ${fileCount} file(s) + ${segmentCount} segment(s) from ${ref} ` +
        `(template ${manifest.templateSha}) → ${dest}.`,
    )
    return 0
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await installFleet(parseArgs(process.argv.slice(2)))
}
