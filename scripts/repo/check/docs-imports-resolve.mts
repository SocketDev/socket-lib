#!/usr/bin/env node
/*
 * @file Gate: every `@socketsecurity/lib` import shown in the docs resolves.
 *   A doc example is the first code a consumer runs, so a subpath missing from
 *   the exports map, or a named import the target module does not export, is a
 *   broken instruction rather than a typo. Four such breaks shipped at once:
 *   `getDefaultLogger` from `./logger` (only `./logger/default` has it),
 *   `httpDownload` from `./http-request` (it lives at `./http-request/download`),
 *   `WIN32`/`DARWIN` documented as constants when they are `isWin32()` and
 *   `isDarwin()` functions, and a palette subpath that never existed.
 *
 *   The export check IMPORTS the built module and reads its real export names.
 *   Grepping the dist text for the identifier would pass on a mention inside a
 *   comment and fail on a re-export the bundler renamed, so the module's own
 *   namespace object is the only answer that tracks what a consumer gets.
 *
 *   Counterexamples are exempt. The docs deliberately show a wrong import next
 *   to a `NO`, `Wrong`, or `Avoid` marker, and a commented-out import is the
 *   same thing, so a line the prose warns about is not a finding.
 *
 *   Usage: node scripts/repo/check/docs-imports-resolve.mts [--json]
 */

import { globSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

// `import { a, b } from '@socketsecurity/lib/<subpath>'`, single line or block.
const IMPORT_RE =
  /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@socketsecurity\/lib(\/[^']*)?'/g

// A marker in the lines above an import that makes it a counterexample.
const COUNTEREXAMPLE_RE = /\b(?:Avoid|Bad|Do not|Don't|NO|Wrong)\b/i

export interface DocImportFinding {
  readonly detail: string
  readonly file: string
  readonly line: number
}

export interface DocImportSite {
  readonly line: number
  readonly names: readonly string[]
  readonly subpath: string
}

/**
 * The dist entry an exports-map value points at, for the node condition.
 */
export function distTargetOf(target: unknown): string | undefined {
  if (typeof target === 'string') {
    return target
  }
  if (!target || typeof target !== 'object') {
    return undefined
  }
  const record = target as Record<string, unknown>
  const node = record['node'] as Record<string, unknown> | undefined
  const candidate =
    (node?.['import'] as string | undefined) ??
    (node?.['default'] as string | undefined) ??
    (record['import'] as string | undefined) ??
    (record['default'] as string | undefined)
  return typeof candidate === 'string' ? candidate : undefined
}

/**
 * Whether the import at `index` is one the surrounding prose warns about.
 */
export function isCounterexample(text: string, index: number): boolean {
  const lines = text.slice(0, index).split(/\r?\n/)
  const context = lines.slice(Math.max(0, lines.length - 4)).join('\n')
  const ownLine = lines[lines.length - 1] ?? ''
  return ownLine.trimStart().startsWith('//') || COUNTEREXAMPLE_RE.test(context)
}

/**
 * Every real (non-counterexample) lib import a doc shows.
 */
export function collectImportSites(text: string): DocImportSite[] {
  const sites: DocImportSite[] = []
  for (const match of text.matchAll(IMPORT_RE)) {
    if (isCounterexample(text, match.index)) {
      continue
    }
    const names = (match[1] ?? '')
      .split(',')
      .map(name =>
        name
          .trim()
          .split(/\s+as\s+/)[0]!
          .trim(),
      )
      .filter(Boolean)
    sites.push({
      line: text.slice(0, match.index).split(/\r?\n/).length,
      names,
      subpath: match[2] ? `.${match[2]}` : '.',
    })
  }
  return sites
}

/**
 * The export names a built module actually provides, or undefined when it can
 * not be loaded at all.
 */
export async function exportNamesOf(
  distPath: string,
): Promise<Set<string> | undefined> {
  try {
    const mod = (await import(pathToFileURL(distPath).href)) as object
    return new Set(Object.keys(mod))
  } catch {
    return undefined
  }
}

export async function scanDocFile(
  file: string,
  exportsMap: Record<string, unknown>,
  root: string = ROOT,
): Promise<DocImportFinding[]> {
  const findings: DocImportFinding[] = []
  const rel = path.relative(root, file)
  const sites = collectImportSites(readFileSync(file, 'utf8'))
  for (let i = 0, { length } = sites; i < length; i += 1) {
    const site = sites[i]!
    if (!(site.subpath in exportsMap)) {
      findings.push({
        detail: `subpath ${site.subpath} is not in the exports map`,
        file: rel,
        line: site.line,
      })
      continue
    }
    const dist = distTargetOf(exportsMap[site.subpath])
    if (!dist) {
      continue
    }
    const distPath = path.join(root, dist.replace(/^\.\//, ''))
    // oxlint-disable-next-line no-await-in-loop -- one module load per site
    const exported = await exportNamesOf(distPath)
    if (!exported) {
      findings.push({
        detail: `subpath ${site.subpath} resolves to ${dist}, which does not load`,
        file: rel,
        line: site.line,
      })
      continue
    }
    for (const name of site.names) {
      if (!exported.has(name)) {
        findings.push({
          detail: `subpath ${site.subpath} does not export ${name}`,
          file: rel,
          line: site.line,
        })
      }
    }
  }
  return findings
}

export async function scanDocs(
  root: string = ROOT,
): Promise<DocImportFinding[]> {
  const pkg = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as { exports: Record<string, unknown> }
  const files = globSync('docs/**/*.md', { absolute: true, cwd: root }).filter(
    file => statSync(file).isFile(),
  )
  const findings: DocImportFinding[] = []
  for (let i = 0, { length } = files; i < length; i += 1) {
    // oxlint-disable-next-line no-await-in-loop -- serial keeps output ordered
    findings.push(...(await scanDocFile(files[i]!, pkg.exports, root)))
  }
  return findings
}

async function main(): Promise<number> {
  const findings = await scanDocs()
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ findings }, undefined, 2)}\n`)
    return findings.length === 0 ? 0 : 1
  }
  if (findings.length === 0) {
    process.stdout.write('docs imports resolve\n')
    return 0
  }
  process.stderr.write(
    `${findings.length} documented import(s) do not resolve.\n\n`,
  )
  for (const finding of findings) {
    process.stderr.write(
      `  ${finding.file}:${finding.line}: ${finding.detail}\n`,
    )
  }
  process.stderr.write(
    '\nFix: point the example at the subpath that exports the symbol, or mark it as a counterexample with a NO / Wrong / Avoid line above it.\n',
  )
  return 1
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  void (async () => {
    process.exitCode = await main()
  })()
}
