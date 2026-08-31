/*
 * @file Fleet-wide usage audit of the @socketsecurity/lib export surface —
 *   the evidence base for stubbing never-used exports out of the published
 *   build. Walks every roster sibling checkout under ~/projects, collects
 *   each `@socketsecurity/lib[-stable]/<leaf>` import with its named
 *   bindings, and reconciles them against this package's exports map.
 *
 *   Classification per leaf module:
 *     - `unused`   — no fleet repo imports the leaf at all.
 *     - `namespace` — some repo takes the whole module (`import * as`,
 *       default import, or bare require), so every export counts as used.
 *     - `named`    — only specific bindings are used; the unused remainder
 *       is the stub candidate set.
 *   Type-only imports are recorded but never keep a RUNTIME export alive —
 *   stubs replace bodies, not declarations.
 *
 *   Output: a JSON report on stdout (or --out <file>). Read-only over the
 *   sibling repos; never writes into them.
 *
 *   Usage: node scripts/repo/audit-fleet-lib-usage.mts [--out <file>]
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { keptLeafEntries } from './build-stubs/settings.mts'

export type { KeptLeaf } from './build-stubs/settings.mts'
export { keptLeafEntries } from './build-stubs/settings.mts'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { REPO_ROOT } from '../fleet/paths.mts'
import { isMainModule } from '../fleet/process/is-main-module.mts'
import { runMain } from '../fleet/process/run-main.mts'
import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import type { ScriptMeta } from '../fleet/process/run-main.mts'

const logger = getDefaultLogger()

export interface LeafUsage {
  named: string[]
  namespace: boolean
  repos: string[]
  typeOnlyNamed: string[]
}

export interface FleetLibUsageReport {
  leaves: Record<string, LeafUsage>
  reposScanned: string[]
  unusedLeaves: string[]
}

/**
 * The roster repo names, from the cascaded fleet roster.
 */
export function rosterRepoNames(repoRoot: string): string[] {
  const rosterPath = path.join(
    repoRoot,
    '.claude',
    'skills',
    'fleet',
    'cascading-fleet',
    'lib',
    'fleet-repos.json',
  )
  const roster = JSON.parse(readFileSync(rosterPath, 'utf8')) as {
    repos: Array<{ name: string }>
  }
  return roster.repos.map(r => r.name)
}

/**
 * The roster repos with no checkout on disk beside this one. Each missing
 * checkout is a blind spot: its imports are invisible, so every leaf only it
 * uses would be misclassified as fleet-unused.
 */
export function missingRosterRepos(repoRoot: string): string[] {
  const projectsDir = path.dirname(repoRoot)
  return rosterRepoNames(repoRoot).filter(
    name => !existsSync(path.join(projectsDir, name, '.git')),
  )
}

/**
 * The lib's public leaf specifiers, from the exports map (`./abort/signal`
 * → `abort/signal`). The root `.` entry and pattern entries are skipped —
 * stubbing targets concrete leaves.
 */
export function exportLeaves(repoRoot: string): string[] {
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as { exports?: Record<string, unknown> | undefined }
  return Object.keys(manifest.exports ?? {})
    .filter(k => k.startsWith('./') && !k.includes('*'))
    .map(k => k.slice(2))
    .filter(k => k !== 'package.json')
}

export function keptLeaves(repoRoot: string): Set<string> {
  return new Set(keptLeafEntries(repoRoot).map(entry => entry.leaf))
}

/**
 * The keep-list entries a real fleet consumer now imports. Each is redundant —
 * the consumer alone keeps the leaf out of the stub list.
 */
export function redundantKeptLeaves(
  repoRoot: string,
  usedLeaves: ReadonlySet<string>,
): string[] {
  return keptLeafEntries(repoRoot)
    .filter(entry => usedLeaves.has(entry.leaf))
    .map(entry => entry.leaf)
    .toSorted()
}

// One import statement's parse: the leaf it names and its bindings.
export interface ParsedImport {
  leaf: string
  named: string[]
  namespace: boolean
  typeOnly: boolean
}

const IMPORT_RE =
  /import\s+(?<clause>type\s+)?(?<bindings>[^'"]*?)\s*from\s*['"]@socketsecurity\/lib(?:-stable)?\/(?<leaf>[^'"]+)['"]|require\(['"]@socketsecurity\/lib(?:-stable)?\/(?<reqleaf>[^'"]+)['"]\)/g

/**
 * Parse every lib import in one source text.
 */
export function parseLibImports(text: string): ParsedImport[] {
  const results: ParsedImport[] = []
  let m = IMPORT_RE.exec(text)
  while (m !== null) {
    const groups = m.groups ?? {}
    const leaf = (groups['leaf'] ?? groups['reqleaf'] ?? '').replace(
      /\.m?[jt]s$/,
      '',
    )
    if (groups['reqleaf'] !== undefined) {
      results.push({ leaf, named: [], namespace: true, typeOnly: false })
      m = IMPORT_RE.exec(text)
      continue
    }
    const typeOnly = Boolean(groups['clause'])
    const bindings = (groups['bindings'] ?? '').trim()
    const braced = /\{(?<names>[^}]*)\}/.exec(bindings)
    if (braced?.groups?.['names'] !== undefined) {
      const named = braced.groups['names']
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => entry.replace(/^type\s+/, '').split(/\s+as\s+/)[0] ?? '')
        .filter(Boolean)
      results.push({ leaf, named, namespace: false, typeOnly })
    } else if (bindings) {
      // Default or `* as ns` import — the whole module is live.
      results.push({ leaf, named: [], namespace: true, typeOnly })
    } else {
      // Bare side-effect import.
      results.push({ leaf, named: [], namespace: true, typeOnly: false })
    }
    m = IMPORT_RE.exec(text)
  }
  return results
}

const SOURCE_EXTENSION_PATHSPECS = [
  '*.ts',
  '*.mts',
  '*.cts',
  '*.tsx',
  '*.js',
  '*.mjs',
  '*.cjs',
]

/**
 * The fleet payload directories. A thin member gitignores every one of these,
 * so `--exclude-standard` hides them and a leaf reached only by a cascaded
 * fleet script reads as fleet-unused. These are listed back in explicitly.
 */
export const FLEET_PAYLOAD_PATHSPECS = [
  '.claude/hooks/fleet/',
  '.claude/skills/fleet/',
  '.git-hooks/fleet/',
  'scripts/fleet/',
]

function gitLsFiles(repoDir: string, args: string[]): string[] {
  const r = spawnSync('git', ['ls-files', ...args], {
    cwd: repoDir,
    stdio: 'pipe',
    stdioString: true,
  })
  if (r.status !== 0) {
    return []
  }
  return String(r.stdout ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

// Source files in a repo that can import the lib — tracked plus untracked
// (unignored) files, so a consumer written but not yet committed still counts
// as fleet usage. (The 6.5.1 npm/meta stub shipped because the only consumer
// was untracked work in progress at audit time.) The cascaded fleet payload is
// gitignored in every thin member, so it is collected in a second pass that
// asks for ignored files under those directories. (The 7.0.1 exe/argv/parse
// stub shipped because its only consumer was `scripts/fleet/release-pipeline`,
// which the first pass cannot see.)
export function sourceFiles(repoDir: string): string[] {
  const tracked = gitLsFiles(repoDir, [
    '--cached',
    '--others',
    '--exclude-standard',
    ...SOURCE_EXTENSION_PATHSPECS,
  ])
  const fleetPayload = gitLsFiles(repoDir, [
    '--others',
    '--ignored',
    '--exclude-standard',
    '--',
    ...FLEET_PAYLOAD_PATHSPECS,
  ]).filter(line =>
    SOURCE_EXTENSION_PATHSPECS.some(spec => line.endsWith(spec.slice(1))),
  )
  return [...new Set([...tracked, ...fleetPayload])].filter(
    line =>
      !line.includes('node_modules') &&
      !line.startsWith('dist/') &&
      !line.startsWith('coverage/'),
  )
}

/**
 * Run the audit across every roster sibling that exists on disk.
 */
export function auditFleetLibUsage(repoRoot: string): FleetLibUsageReport {
  const projectsDir = path.dirname(repoRoot)
  const names = rosterRepoNames(repoRoot)
  const leaves: Record<string, LeafUsage> = {}
  const reposScanned: string[] = []
  for (let i = 0, { length } = names; i < length; i += 1) {
    const name = names[i] as string
    const dir = path.join(projectsDir, name)
    if (!existsSync(path.join(dir, '.git'))) {
      continue
    }
    reposScanned.push(name)
    const files = sourceFiles(dir)
    for (let j = 0, flen = files.length; j < flen; j += 1) {
      const filePath = path.join(dir, files[j] as string)
      let text: string
      try {
        text = readFileSync(filePath, 'utf8')
      } catch {
        continue
      }
      if (!text.includes('@socketsecurity/lib')) {
        continue
      }
      const imports = parseLibImports(text)
      for (let k = 0, ilen = imports.length; k < ilen; k += 1) {
        const imp = imports[k] as ParsedImport
        const usage = (leaves[imp.leaf] ??= {
          named: [],
          namespace: false,
          repos: [],
          typeOnlyNamed: [],
        })
        if (!usage.repos.includes(name)) {
          usage.repos.push(name)
        }
        if (imp.namespace && !imp.typeOnly) {
          usage.namespace = true
        }
        const bucket = imp.typeOnly ? usage.typeOnlyNamed : usage.named
        for (let n = 0, nlen = imp.named.length; n < nlen; n += 1) {
          const bindingName = imp.named[n] as string
          if (!bucket.includes(bindingName)) {
            bucket.push(bindingName)
          }
        }
      }
    }
  }
  const publicLeaves = exportLeaves(repoRoot)
  const kept = keptLeaves(repoRoot)
  const unusedLeaves = publicLeaves.filter(
    leaf => !leaves[leaf] && !kept.has(leaf),
  )
  const usages = Object.values(leaves)
  for (let i = 0, { length } = usages; i < length; i += 1) {
    const usage = usages[i] as LeafUsage
    usage.named.sort()
    usage.repos.sort()
    usage.typeOnlyNamed.sort()
  }
  return { leaves, reposScanned, unusedLeaves: unusedLeaves.toSorted() }
}

// The src file backing a leaf specifier, or undefined when none exists
// (data-only exports).
export function srcFileForLeaf(
  repoRoot: string,
  leaf: string,
): string | undefined {
  const candidates = [
    path.join(repoRoot, 'src', `${leaf}.ts`),
    path.join(repoRoot, 'src', `${leaf}.mts`),
    path.join(repoRoot, 'src', leaf, 'index.ts'),
  ]
  for (let i = 0, { length } = candidates; i < length; i += 1) {
    if (existsSync(candidates[i] as string)) {
      return candidates[i]
    }
  }
  return undefined
}

const RELATIVE_IMPORT_RE = /(?:from|require\()\s*['"](?<spec>\.[^'"]+)['"]/g

function relativeDepsOf(filePath: string): string[] {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch {
    return []
  }
  const deps: string[] = []
  let m = RELATIVE_IMPORT_RE.exec(text)
  while (m !== null) {
    const spec = (m.groups?.['spec'] ?? '').replace(/\.m?[jt]s$/, '')
    const base = path.join(path.dirname(filePath), spec)
    const candidates = [
      `${base}.ts`,
      `${base}.mts`,
      path.join(base, 'index.ts'),
    ]
    for (let i = 0, { length } = candidates; i < length; i += 1) {
      const candidate = candidates[i] as string
      if (existsSync(candidate)) {
        deps.push(candidate)
        break
      }
    }
    m = RELATIVE_IMPORT_RE.exec(text)
  }
  return deps
}

/**
 * The unused leaves that are ALSO unreachable through relative imports from
 * any fleet-used leaf — the set safe to stub without breaking a used
 * module's internal require of a sibling.
 */
export function graphSafeStubCandidates(
  repoRoot: string,
  report: FleetLibUsageReport,
): string[] {
  const reachable = new Set<string>()
  const queue = Object.keys(report.leaves)
    .map(leaf => srcFileForLeaf(repoRoot, leaf))
    .filter((f): f is string => Boolean(f))
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (reachable.has(file)) {
      continue
    }
    reachable.add(file)
    const deps = relativeDepsOf(file)
    for (let i = 0, { length } = deps; i < length; i += 1) {
      const dep = deps[i] as string
      if (!reachable.has(dep)) {
        queue.push(dep)
      }
    }
  }
  return report.unusedLeaves.filter(leaf => {
    const src = srcFileForLeaf(repoRoot, leaf)
    return Boolean(src) && !reachable.has(src as string)
  })
}

function main(): void {
  const writeStubList = process.argv.includes('--write-stub-list')
  if (writeStubList) {
    const missing = missingRosterRepos(REPO_ROOT)
    if (missing.length > 0) {
      throw new Error(
        'audit-fleet-lib-usage: refusing to write the stub list with roster blind spots.\n' +
          `  Where: ${path.dirname(REPO_ROOT)}\n` +
          `  Saw: ${missing.length} roster repo(s) with no checkout on disk (${missing.join(', ')}); wanted every roster member scannable.\n` +
          '  Fix: clone the missing checkout(s) beside this repo, then re-run --write-stub-list.',
      )
    }
  }
  const report = auditFleetLibUsage(REPO_ROOT)
  if (writeStubList) {
    const candidates = graphSafeStubCandidates(REPO_ROOT, report)
    const listPath = path.join(
      REPO_ROOT,
      '.config',
      'repo',
      'socket-wheelhouse.json',
    )
    // Record the roster this verdict was judged against, not just the verdict.
    // "Unused" is a claim about the whole fleet, so the list is only as good
    // as the consumer set behind it — and with no record, one computed against
    // a smaller fleet reads exactly like a correct one.
    writeFileSync(
      listPath,
      `${JSON.stringify(
        {
          leaves: candidates,
          scannedRoster: rosterRepoNames(REPO_ROOT).toSorted(),
        },
        null,
        2,
      )}\n`,
    )
    logger.success(
      `audit-fleet-lib-usage: ${candidates.length} graph-safe stub leaf(s) → ${listPath}`,
    )
    return
  }
  const outFlag = process.argv.indexOf('--out')
  const json = JSON.stringify(report, null, 2)
  if (outFlag !== -1 && process.argv[outFlag + 1]) {
    const outPath = path.resolve(process.argv[outFlag + 1] as string)
    // macOS tmpdir lives under /var/folders while /tmp symlinks /private/tmp;
    // accept the literal /tmp spelling alongside the canonical tmpdir.
    const inTmp =
      outPath.startsWith(os.tmpdir()) ||
      normalizePath(outPath).startsWith('/tmp/') ||
      normalizePath(outPath).startsWith('/private/tmp/')
    if (!inTmp && !outPath.startsWith(REPO_ROOT)) {
      throw new Error(
        'audit-fleet-lib-usage: refusing to write outside the repo or tmp.\n' +
          `  Where: --out ${outPath}\n` +
          '  Saw: a path in neither tree; wanted one under the repo root or os.tmpdir().\n' +
          '  Fix: point --out at a repo-relative or tmp path.',
      )
    }
    writeFileSync(outPath, `${json}\n`)
    logger.success(
      `audit-fleet-lib-usage: ${report.reposScanned.length} repo(s) scanned, ` +
        `${Object.keys(report.leaves).length} leaf module(s) used, ` +
        `${report.unusedLeaves.length} unused → ${outPath}`,
    )
    return
  }
  logger.log(json)
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'audits fleet-wide @socketsecurity/lib usage to find leaf modules no roster repo imports',
  help: `Usage: node scripts/repo/audit-fleet-lib-usage.mts [flags]

  --out <file>          write the JSON report to <file> instead of stdout
  --write-stub-list      write the graph-safe stub candidates to
                         .config/repo/socket-wheelhouse.json`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
