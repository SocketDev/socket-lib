#!/usr/bin/env node
/**
 * @file Audit which individual `src/` exports (functions, classes, consts) have
 *   zero references anywhere — same-file use, other socket-lib source, or any
 *   fleet consumer repo. Complements audit-api-usage.mts (subpath granularity)
 *   with per-name granularity.
 *   Matching is identifier-based (word-boundary token scan), so it sees through
 *   namespace imports (`ns.foo()`), re-export chains, and `require` shapes that
 *   a specifier-based audit can't attribute per name. The trade-off is
 *   conservatism: a name shared with ANY other identifier in the scanned tree
 *   counts as used, and a name defined in more than one module is reported as a
 *   collision and never flagged. False "used" is possible; false "unused" is
 *   not (modulo string-built dynamic access, which nothing static can see).
 *   Usage: node scripts/repo/audit-unused-exports.mts [--json]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

const logger = getDefaultLogger()

// Consumer repos live as siblings of socket-lib — every fleet repo that
// consumes the lib, plus the wheelhouse (its template/ ships fleet-wide).
export const CONSUMER_REPOS = [
  'sdxgen',
  'socket-addon',
  'socket-bin',
  'socket-btm',
  'socket-cli',
  'socket-mcp',
  'socket-packageurl-js',
  'socket-registry',
  'socket-sdk-js',
  'socket-vscode',
  'socket-webext',
  'socket-wheelhouse',
  'stuie',
  'ultrathink',
]

const IDENTIFIER_RE = /[$A-Za-z_][\w$]*/g
const REEXPORT_LINE_RE = /^\s*export\s+(?:\*|\{|type\s+\{)[^;]*?\sfrom\s/
const SKIP_DIRS = new Set([
  '.git',
  'build',
  'coverage',
  'coverage-isolated',
  'dist',
  'node_modules',
])
const SOURCE_EXTS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])

export interface ExportDef {
  readonly file: string
  readonly kind: 'class' | 'const' | 'function'
  readonly line: number
  readonly name: string
}

export interface ExportUsage {
  readonly consumerRepos: string[]
  readonly def: ExportDef
  readonly internalRefs: number
  readonly sameFileRefs: number
  readonly testRefs: number
}

// Pull every module-scope exported function/class/const definition out of one
// source file. Interfaces and type aliases are compile-time-only and skipped.
export function collectExportDefs(source: string, file: string): ExportDef[] {
  const defs: ExportDef[] = []
  const lines = source.split('\n')
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    // `export` + one of `async function` / `function` / `class` / `const`,
    // then the identifier being defined (captured).
    const m = line.match(
      /^export\s+(?:(async\s+)?function\*?\s+|class\s+|const\s+)([$A-Za-z_][\w$]*)/,
    )
    if (!m) {
      continue
    }
    const name = m[2]!
    const kind = line.includes('function')
      ? 'function'
      : line.startsWith('export class')
        ? 'class'
        : 'const'
    defs.push({ file, kind, line: i + 1, name })
  }
  return defs
}

// List every source file under a dir, skipping vendored / build / VCS trees.
export function listSourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (let i = 0, { length } = entries; i < length; i += 1) {
      const name = entries[i]!
      if (SKIP_DIRS.has(name)) {
        continue
      }
      const abs = path.join(dir, name)
      let st
      try {
        st = statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(abs)
      } else if (SOURCE_EXTS.has(path.extname(name))) {
        out.push(abs)
      }
    }
  }
  walk(root)
  return out
}

interface RefTally {
  consumerRepos: Set<string>
  internalRefs: number
  sameFileRefs: number
  testRefs: number
}

interface TallyFileOptions {
  readonly defsByName: Map<string, ExportDef[]>
  readonly file: string
  readonly repo: string | undefined
  readonly source: string
  readonly tallies: Map<string, RefTally>
  readonly zone: 'consumer' | 'internal' | 'test'
}

// Scan one file's identifier tokens against the candidate-name set, crediting
// each hit to the owning tally. The defining line itself is not a reference,
// and internal pure re-export lines (`export … from`) are forwarding, not use.
export function tallyFileRefs(options: TallyFileOptions): void {
  const opts = { __proto__: null, ...options }
  const lines = opts.source.split('\n')
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    if (opts.zone !== 'consumer' && REEXPORT_LINE_RE.test(line)) {
      continue
    }
    const ids = line.match(IDENTIFIER_RE)
    if (!ids) {
      continue
    }
    for (let j = 0, jlen = ids.length; j < jlen; j += 1) {
      const name = ids[j]!
      const defs = opts.defsByName.get(name)
      if (!defs) {
        continue
      }
      const def = defs[0]!
      const isDefLine = def.file === opts.file && def.line === i + 1
      if (isDefLine) {
        continue
      }
      const tally = opts.tallies.get(name)!
      if (opts.zone === 'consumer') {
        tally.consumerRepos.add(opts.repo ?? 'unknown')
      } else if (opts.zone === 'test') {
        tally.testRefs += 1
      } else if (def.file === opts.file) {
        tally.sameFileRefs += 1
      } else {
        tally.internalRefs += 1
      }
    }
  }
}

function main(): number {
  const json = process.argv.includes('--json')
  const libRoot = path.resolve(import.meta.dirname, '../..')
  const projectsDir = path.dirname(libRoot)
  const srcRoot = path.join(libRoot, 'src')

  // 1. Collect export definitions from src/ (vendored src/external/ excluded).
  const defsByName = new Map<string, ExportDef[]>()
  const srcFiles = listSourceFiles(srcRoot).filter(
    f => !f.startsWith(path.join(srcRoot, 'external') + path.sep),
  )
  for (let i = 0, { length } = srcFiles; i < length; i += 1) {
    const file = srcFiles[i]!
    const defs = collectExportDefs(readFileSync(file, 'utf8'), file)
    for (let j = 0, jlen = defs.length; j < jlen; j += 1) {
      const def = defs[j]!
      const list = defsByName.get(def.name)
      if (list) {
        list.push(def)
      } else {
        defsByName.set(def.name, [def])
      }
    }
  }

  // Names defined in >1 module can't be attributed by token scan — set aside.
  const collisions: ExportDef[] = []
  for (const [name, defs] of defsByName) {
    if (defs.length > 1) {
      collisions.push(...defs)
      defsByName.delete(name)
    }
  }

  const tallies = new Map<string, RefTally>()
  for (const name of defsByName.keys()) {
    tallies.set(name, {
      consumerRepos: new Set(),
      internalRefs: 0,
      sameFileRefs: 0,
      testRefs: 0,
    })
  }

  // 2. Tally references: socket-lib src/ + scripts/ (internal), test/ (test),
  //    then every consumer repo.
  const internalFiles = [
    ...srcFiles,
    ...listSourceFiles(path.join(libRoot, 'scripts')),
  ]
  for (let i = 0, { length } = internalFiles; i < length; i += 1) {
    const file = internalFiles[i]!
    tallyFileRefs({
      defsByName,
      file,
      repo: undefined,
      source: readFileSync(file, 'utf8'),
      tallies,
      zone: 'internal',
    })
  }
  const testFiles = listSourceFiles(path.join(libRoot, 'test'))
  for (let i = 0, { length } = testFiles; i < length; i += 1) {
    const file = testFiles[i]!
    tallyFileRefs({
      defsByName,
      file,
      repo: undefined,
      source: readFileSync(file, 'utf8'),
      tallies,
      zone: 'test',
    })
  }
  for (let i = 0, { length } = CONSUMER_REPOS; i < length; i += 1) {
    const repo = CONSUMER_REPOS[i]!
    const root = path.join(projectsDir, repo)
    const files = listSourceFiles(root)
    if (!files.length) {
      logger.warn(`skip (absent or empty): ${repo}`)
      continue
    }
    for (let j = 0, jlen = files.length; j < jlen; j += 1) {
      const file = files[j]!
      tallyFileRefs({
        defsByName,
        file,
        repo,
        source: readFileSync(file, 'utf8'),
        tallies,
        zone: 'consumer',
      })
    }
  }

  // 3. Classify. Unused = zero refs everywhere outside the definition line
  //    (test-only names are still unused API — reported distinctly).
  const usages: ExportUsage[] = []
  for (const [name, defs] of defsByName) {
    const tally = tallies.get(name)!
    usages.push({
      consumerRepos: [...tally.consumerRepos].toSorted(),
      def: defs[0]!,
      internalRefs: tally.internalRefs,
      sameFileRefs: tally.sameFileRefs,
      testRefs: tally.testRefs,
    })
  }
  const isUnused = (u: ExportUsage): boolean =>
    u.consumerRepos.length === 0 && u.internalRefs === 0 && u.sameFileRefs === 0
  const unused = usages
    .filter(isUnused)
    .toSorted((a, b) =>
      a.def.file === b.def.file
        ? a.def.line - b.def.line
        : a.def.file.localeCompare(b.def.file),
    )
  const relative = (f: string): string => path.relative(libRoot, f)

  if (json) {
    logger.log(
      JSON.stringify(
        {
          collisionNames: [...new Set(collisions.map(d => d.name))].toSorted(),
          totalExports: usages.length + collisions.length,
          unused: unused.map(u => ({
            consumerRepos: u.consumerRepos,
            file: relative(u.def.file),
            kind: u.def.kind,
            line: u.def.line,
            name: u.def.name,
            testRefs: u.testRefs,
          })),
          unusedCount: unused.length,
        },
        null,
        2,
      ),
    )
    return 0
  }

  logger.log(
    `exports scanned: ${usages.length + collisions.length} (${collisions.length} in name collisions, skipped)`,
  )
  logger.log(`unused: ${unused.length}`)
  for (let i = 0, { length } = unused; i < length; i += 1) {
    const u = unused[i]!
    const testNote = u.testRefs > 0 ? ` (test-only: ${u.testRefs} refs)` : ''
    logger.log(
      `  ${relative(u.def.file)}:${u.def.line} ${u.def.name}${testNote}`,
    )
  }
  return 0
}

process.exitCode = main()
