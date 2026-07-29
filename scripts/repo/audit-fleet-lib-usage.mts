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

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

import { REPO_ROOT } from '../fleet/paths.mts'
import { isMainModule } from '../fleet/_shared/is-main-module.mts'
import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

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

// Tracked source files in a repo that can import the lib.
function sourceFiles(repoDir: string): string[] {
  const r = spawnSync(
    'git',
    ['ls-files', '*.ts', '*.mts', '*.cts', '*.tsx', '*.js', '*.mjs', '*.cjs'],
    { cwd: repoDir, stdio: 'pipe', stdioString: true },
  )
  if (r.status !== 0) {
    return []
  }
  return String(r.stdout ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(
      line =>
        Boolean(line) &&
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
  const unusedLeaves = publicLeaves.filter(leaf => !leaves[leaf])
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
  const report = auditFleetLibUsage(REPO_ROOT)
  if (process.argv.includes('--write-stub-list')) {
    const candidates = graphSafeStubCandidates(REPO_ROOT, report)
    const listPath = path.join(
      REPO_ROOT,
      'scripts',
      'repo',
      'build-stubs',
      'unexposed-leaves.json',
    )
    writeFileSync(
      listPath,
      `${JSON.stringify({ leaves: candidates }, null, 2)}\n`,
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

if (isMainModule(import.meta.url)) {
  main()
}
