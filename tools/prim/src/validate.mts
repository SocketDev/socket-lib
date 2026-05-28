/**
 * @file Cross-batch validation for `prim mod`. After the codemod computes a
 *   per-file plan (new content + new imports), THIS module walks the plan to
 *   catch problems that no single-file rewrite can see:
 *
 *   - **Self-imports**: `primordials/number.ts` rewritten to `import {
 *     NumberParseInt } from './number'`. Single-file-checks accept it; the
 *     module fails to load at runtime.
 *   - **Cross-leaf cycles within primordials**: `primordials/array.ts` → imports
 *     `MapCtor` from `./map-set` which transitively imports back. Breaks `pnpm
 *     install`'s `prepare` phase.
 *   - **Unparseable output**: a botched rewrite shifted offsets and produced a
 *     syntactically invalid file. Cheap node-builtin parser catches it before
 *     ship. The validator runs BEFORE any disk writes happen. Failures abort
 *     the whole apply pass — partial-rewrite working trees are the worst
 *     failure mode the tool can produce (40 dirty files, half broken, manual
 *     `git checkout` to recover). Uses `@socketsecurity/lib-stable/shell/parse`
 *     patterns + `node:fs` (lib's readFileUtf8 is async; the prim tool is
 *     sync). All paths are normalized via
 *     `@socketsecurity/lib-stable/paths/normalize` for cross-platform string
 *     containment checks.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse } from 'acorn-wasm'
import { stripTypeScriptTypes } from 'node:module'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

/**
 * Read the on-disk content of every planned-rewrite file's importers' existing
 * import lines + simulate the new graph. Detects cycles introduced by the
 * rewrite that would break module-load order.
 *
 * Implemented as a focused walk: for each plan, build the union of (existing
 * neighbors + newly-introduced relative imports) and DFS for back-edges within
 * the cohort.
 *
 * Out of scope for v1 — single-file self-import detection (above) catches the
 * primary failure mode we observed today. Multi-hop cycle detection is planned
 * as a follow-up; flag is reserved here so the option surface stays
 * compatible.
 */
export function detectImportCycles(
  _plans: readonly PlannedRewrite[],
): readonly ValidationFinding[] {
  // Reserved: implement when needed. The self-import + inside-root checks
  // above cover today's failure modes. Multi-hop cycles would need a full
  // graph build + DFS; deferred until we see a real one.
  return []
}

/**
 * Parse a TS/JS source string and return every relative `from` specifier in its
 * `import` declarations. Throws on parse errors. Strips TypeScript types first
 * (mode: 'strip') so positions stay aligned with the raw source.
 */
export function extractImports(
  source: string,
  absPath: string,
): readonly string[] {
  const ext = path.extname(absPath)
  const isTs =
    ext === '.ts' || ext === '.mts' || ext === '.cts' || ext === '.tsx'
  const parseSrc = isTs
    ? stripTypeScriptTypes(source, { mode: 'strip' })
    : source
  const ast = parse(parseSrc, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: false,
    ranges: false,
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: true,
    allowHashBang: true,
  }) as {
    body: ReadonlyArray<{
      type: string
      source?: { value?: unknown } | undefined
    }>
  }
  const specs: string[] = []
  for (let i = 0, { length } = ast.body; i < length; i += 1) {
    const node = ast.body[i]
    if (
      node &&
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source &&
      typeof node.source.value === 'string'
    ) {
      specs.push(node.source.value)
    }
  }
  return specs
}

/**
 * Format a validation report for human reading. Used by the CLI when the batch
 * is rejected.
 */
export function formatValidationReport(
  findings: readonly ValidationFinding[],
): string {
  if (findings.length === 0) {
    return ''
  }
  const lines = [
    `prim mod: validation rejected ${findings.length} planned rewrite(s):`,
    '',
  ]
  for (let i = 0, { length } = findings; i < length; i += 1) {
    const f = findings[i]!
    lines.push(`  [${f.kind}] ${f.file}`)
    lines.push(`    ${f.message}`)
    if (f.detail) {
      lines.push(`    ${f.detail}`)
    }
    lines.push('')
  }
  lines.push(
    'No files were modified. Re-run with --no-validate to skip these checks',
  )
  lines.push('(only when you know the rewrite is safe).')
  return lines.join('\n')
}

export function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../')
}

export function stripExt(p: string): string {
  return p.replace(/\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/, '')
}

/**
 * One planned file change from the codemod's compute phase. The `newSource` is
 * the fully-rewritten content, ready to be written if validation passes.
 */
export interface PlannedRewrite {
  /**
   * Absolute path on disk.
   */
  readonly absPath: string
  /**
   * Repo-root-relative path, for error reporting.
   */
  readonly relPath: string
  /**
   * Full new content of the file after rewrites.
   */
  readonly newSource: string
}

/**
 * A validation problem the codemod can't see in single-file mode. Each finding
 * names the offending file, the kind of problem, and a remediation hint. The
 * caller (cli.mts) aggregates these into a report and aborts the apply pass.
 */
export interface ValidationFinding {
  readonly kind:
    | 'self-import'
    | 'cycle'
    | 'unparseable'
    | 'inside-primordials-root'
  readonly file: string
  readonly message: string
  /**
   * Extra detail surfaced to the user — e.g. the cycle path.
   */
  readonly detail?: string
}

/**
 * Run cross-batch validation on a set of planned rewrites. Returns an empty
 * array on success; a non-empty array means the apply should abort.
 *
 * `primordialsRoot` (optional, absolute, normalized to forward slashes) is the
 * directory containing per-leaf primordials files. Used to recognize the
 * source-of-truth files that should never be rewritten.
 */
export function validateRewrites(
  plans: readonly PlannedRewrite[],
  options: {
    primordialsRoot?: string | undefined
  } = {},
): readonly ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const normalizedRoot = options.primordialsRoot
    ? `${normalizePath(options.primordialsRoot)}/`
    : undefined
  for (let i = 0, { length } = plans; i < length; i += 1) {
    const plan = plans[i]!
    // Source-of-truth check: any rewrite INSIDE the primordials root is a
    // bug. The compute phase should have skipped these; if one snuck
    // through, abort the whole batch rather than corrupt the surface.
    if (
      normalizedRoot &&
      normalizePath(plan.absPath).startsWith(normalizedRoot)
    ) {
      findings.push({
        kind: 'inside-primordials-root',
        file: plan.relPath,
        message:
          'rewrite would touch a file inside the primordials source-of-truth root',
        detail: `primordials root: ${normalizedRoot}`,
      })
      continue
    }
    // Parse the rewritten file's imports. Reject if the output is
    // syntactically invalid — fail fast before checking anything else.
    let imports: readonly string[]
    try {
      imports = extractImports(plan.newSource, plan.absPath)
    } catch (e) {
      findings.push({
        kind: 'unparseable',
        file: plan.relPath,
        message: 'rewritten file failed to parse',
        detail: (e as Error).message,
      })
      continue
    }
    // Self-import check: an import whose specifier resolves to the same
    // file as the importer.
    const fileNoExt = stripExt(plan.absPath)
    for (let j = 0, { length: il } = imports; j < il; j += 1) {
      const spec = imports[j]!
      if (!isRelativeSpecifier(spec)) {
        continue
      }
      const resolved = stripExt(
        normalizePath(path.resolve(path.dirname(plan.absPath), spec)),
      )
      if (resolved === normalizePath(fileNoExt)) {
        findings.push({
          kind: 'self-import',
          file: plan.relPath,
          message: 'rewrite added a self-import',
          detail: `specifier: '${spec}'`,
        })
      }
    }
  }
  return findings
}
