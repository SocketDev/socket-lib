/**
 * @file Walk a directory of JavaScript/TypeScript and emit findings: every site
 *   where a primordial would apply, or already does. Each finding records:
 *
 *   - The primordial that maps to the call site (e.g. `ArrayPrototypeMap`).
 *   - Whether that primordial is currently exported from socket-lib (`covered`)
 *     or not yet (`gap`).
 *   - File / line / column / source pattern for human inspection.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import process from 'node:process'

/**
 * Argument list the interceptor below forwards. `process.emitWarning` has four
 * overloads and only the first argument is common to all of them, so the rest
 * passes through unread.
 */
export type EmitWarningArgs = [warning: string | Error, ...rest: unknown[]]

// Suppress the one-time ExperimentalWarning from stripTypeScriptTypes
// without affecting other warnings. We replace Node's default emit-to-
// stderr behavior with a filter that silences just this one warning;
// everything else gets re-emitted to stderr in the same format.
const defaultEmitWarning = process.emitWarning.bind(process) as (
  ...args: EmitWarningArgs
) => void
process.emitWarning = function emitWarning(...args) {
  const [warning, name] = args
  const warningStr = typeof warning === 'string' ? warning : warning?.message
  const warningName =
    typeof name === 'string'
      ? name
      : typeof warning === 'string'
        ? undefined
        : warning?.name
  if (
    warningName === 'ExperimentalWarning' &&
    warningStr?.includes('stripTypeScriptTypes')
  ) {
    return
  }
  return defaultEmitWarning(...args)
}

import {
  buildLineStarts,
  isSourceFile,
  lineColumnAt,
  PARSE_OPTIONS,
  TS_EXTENSIONS,
} from './audit-helpers.mts'
import { buildVisitors } from './audit-visitors.mts'
import { disambiguateReceiver } from './disambiguate.mts'
import { prototypePrimordialName } from './globals.mts'

/**
 * The visitor table `buildVisitors` hands the walk. Derived from the builder so
 * the per-node parameter types stay in one place.
 */
export type AuditVisitors = ReturnType<typeof buildVisitors>

// `@ultrathink/acorn.rs.wasm` ships no declarations; ./acorn-wasm.mts is the
// one typed accessor for it, so this module does not name a second.
import { walk } from './acorn-wasm.mts'

/**
 * `covered` — the primordial exists today. `gap` — it still has to be added to
 * the surface. `redeclaration` — the file hand-rolls a local alias for a
 * primordial it could import.
 */
export type FindingKind = 'covered' | 'gap' | 'redeclaration'

export interface Finding {
  /**
   * Name of the matching primordial.
   */
  primordial: string
  /**
   * Source-level pattern, e.g. `Object.keys(...)`.
   */
  pattern: string
  /**
   * Path relative to the target root.
   */
  file: string
  line: number
  column: number
  kind: FindingKind
}

/**
 * The findings list plus the walk's skipped-file bookkeeping, attached as
 * non-enumerable handles so array consumers see a plain `Finding[]`.
 */
export interface AuditFindings extends Array<Finding> {
  parseFailures?: number | undefined
  parseFailureFiles?: string[] | undefined
  stripFailures?: number | undefined
  stripFailureFiles?: string[] | undefined
}

/**
 * One ambiguous-method call site queued for the post-walk AI pass. Snapshotted
 * by value because the AST is freed when the walk ends.
 */
export interface PendingAmbiguousSite {
  file: string
  offset: number
  line: number
  column: number
  methodName: string
  receiverName: string
  snippet: string
}

export interface AuditDirectoryOptions {
  /**
   * When true, defer ambiguous prototype methods (.test, .then, etc.) to
   * Claude with a locked-down read-only tool surface. Off by default — opt-in
   * via CLI flag. Requires ANTHROPIC_API_KEY in env.
   */
  aiDisambiguate?: boolean | undefined
  /**
   * Currently-exported primordials.
   */
  exported: Set<string>
  /**
   * Directory to walk.
   */
  scanDir: string
  /**
   * Directories to skip during walk.
   */
  skipDirs?: string[] | undefined
  /**
   * Files to skip, matched by basename.
   */
  skipFiles?: string[] | undefined
  targetRoot: string
}

export async function auditDirectory({
  aiDisambiguate = false,
  exported,
  scanDir,
  skipDirs = ['external', 'node_modules', '.cache'],
  skipFiles = [
    'primordials.js',
    'primordials.mjs',
    'primordials.cjs',
    'primordials.ts',
    'primordials.mts',
    'primordials.cts',
  ],
  targetRoot,
}: AuditDirectoryOptions): Promise<AuditFindings> {
  const findings: Finding[] = []
  const seen = new Set<string>()

  function record(
    file: string,
    offset: number,
    pattern: string,
    primordial: string | undefined,
  ) {
    // `prototypePrimordialName` returns `undefined` when the method
    // doesn't actually exist on the global's prototype — i.e. the
    // receiver-name guess was wrong (e.g. `p` named like a Promise
    // but holding an EditablePackageJson). Skip these to avoid
    // fabricating gap findings for non-existent methods.
    if (!primordial) {
      return
    }
    const lineStarts = currentFile.lineStarts
    const { line, column } = lineColumnAt(lineStarts, offset)
    const dedupKey = `${file}:${line}:${column}:${primordial}`
    if (seen.has(dedupKey)) {
      return
    }
    seen.add(dedupKey)
    findings.push({
      primordial,
      pattern,
      file,
      line,
      column,
      kind: exported.has(primordial) ? 'covered' : 'gap',
    })
  }

  /**
   * Record a `redeclaration` finding — a top-level `const NAME = expr` where
   * `NAME` matches a primordials export and `expr` reaches a built-in (Error,
   * JSON.parse, Array.isArray, etc.). This is the shape consumers fall back to
   * when they don't know they can import from `./primordials`. The codemod
   * (eventually) rewrites these to a single `import { NAME } from
   * './primordials'` line.
   */
  function recordRedeclaration(
    file: string,
    offset: number,
    name: string,
    pattern: string,
  ) {
    const lineStarts = currentFile.lineStarts
    const { line, column } = lineColumnAt(lineStarts, offset)
    const dedupKey = `${file}:${line}:${column}:redecl:${name}`
    if (seen.has(dedupKey)) {
      return
    }
    seen.add(dedupKey)
    findings.push({
      primordial: name,
      pattern,
      file,
      line,
      column,
      kind: 'redeclaration',
    })
  }

  // Per-file context the visitors read. acorn-wasm's walker doesn't
  // pass extra args beyond ancestors, so we share state via this
  // closure-scoped handle. Reset on every `auditFile` call.
  const currentFile = { relPath: '', lineStarts: [0], src: '' }

  // Sites where the property name is in AMBIGUOUS_PROTOTYPE_METHODS
  // and the receiver identifier didn't match a static guess. Drained
  // after the walk by an async pass that defers to Claude (read-only
  // tool surface) when `aiDisambiguate` is on. Snapshots the snippet
  // up-front because the AST is freed after walk completes.
  const pendingAmbiguous: PendingAmbiguousSite[] = []

  const visitors = buildVisitors({
    aiDisambiguate,
    currentFile,
    exported,
    pendingAmbiguous,
    record,
    recordRedeclaration,
  })

  // Track files that couldn't be audited. Two failure modes:
  //   - parse: acorn-wasm threw on the source, possibly after type-stripping.
  //   - strip: Node's module.stripTypeScriptTypes threw before we got
  //     to the parser. Different mode but same user impact (the file
  //     was silently skipped, audit results incomplete).
  const parseFailureFiles: string[] = []
  const stripFailureFiles: string[] = []

  function auditFile(absPath: string, relPath: string) {
    const ext = path.extname(absPath)
    const rawSrc = readFileSync(absPath, 'utf8')
    // For TypeScript files, strip types before parsing. acorn-wasm's
    // `typescript: true` doesn't cover modern TS syntax (`export type`,
    // class fields with annotations, generic type parameters), so we
    // strip via Node's `module.stripTypeScriptTypes` and parse plain JS.
    let src = rawSrc
    if (TS_EXTENSIONS.has(ext)) {
      try {
        src = stripTypeScriptTypes(rawSrc, { mode: 'strip' })
      } catch {
        // Strip failed (e.g. syntax error). Track and skip — lint/type
        // pipelines catch syntax errors elsewhere, but record the path
        // so users running --json can see what was skipped.
        stripFailureFiles.push(relPath)
        return
      }
    }
    currentFile.relPath = relPath
    currentFile.lineStarts = buildLineStarts(src)
    currentFile.src = src
    try {
      walk(src, visitors, PARSE_OPTIONS)
    } catch {
      parseFailureFiles.push(relPath)
    }
  }

  // After auditing, tag the findings with the failure metadata so
  // callers can surface a warning + investigate. Attached as
  // non-enumerable properties so they don't interfere with code that
  // does findings.length / map / filter etc., but enumerable copies
  // also live on a wrapper the JSON formatter pulls from.
  function attachParseFailureCount(arr: Finding[]): AuditFindings {
    Object.defineProperty(arr, 'parseFailures', {
      value: parseFailureFiles.length,
      enumerable: false,
      configurable: false,
      writable: false,
    })
    Object.defineProperty(arr, 'parseFailureFiles', {
      value: parseFailureFiles.slice(),
      enumerable: false,
      configurable: false,
      writable: false,
    })
    Object.defineProperty(arr, 'stripFailures', {
      value: stripFailureFiles.length,
      enumerable: false,
      configurable: false,
      writable: false,
    })
    Object.defineProperty(arr, 'stripFailureFiles', {
      value: stripFailureFiles.slice(),
      enumerable: false,
      configurable: false,
      writable: false,
    })
    return arr
  }

  function* walkDir(dir: string): Generator<string, void, undefined> {
    for (const entry of readdirSync(dir)) {
      if (skipDirs.includes(entry) || skipFiles.includes(entry)) {
        continue
      }
      const abs = path.join(dir, entry)
      const stat = statSync(abs)
      if (stat.isDirectory()) {
        yield* walkDir(abs)
      } else if (isSourceFile(entry)) {
        yield abs
      }
    }
  }

  for (const abs of walkDir(scanDir)) {
    const rel = path.relative(targetRoot, abs)
    auditFile(abs, rel)
  }

  // Post-walk: drain pending ambiguous sites. Each call goes to
  // Claude or hits the on-disk cache, then produces a verdict.
  // Sequential to keep API throughput predictable; parallelism
  // would need a token budget concept we don't have.
  if (aiDisambiguate && pendingAmbiguous.length > 0) {
    for (let i = 0, { length } = pendingAmbiguous; i < length; i += 1) {
      const item = pendingAmbiguous[i]!
      const verdict = await disambiguateReceiver({
        aiEnabled: true,
        column: item.column,
        filePath: item.file,
        line: item.line,
        methodName: item.methodName,
        receiverName: item.receiverName,
        snippet: item.snippet,
        targetRoot,
      })
      if (verdict.type) {
        record(
          item.file,
          item.offset,
          `${item.receiverName}.${item.methodName}(...)  [ai: ${verdict.type} — ${verdict.reason}]`,
          prototypePrimordialName(verdict.type, item.methodName),
        )
      }
    }
  }

  return attachParseFailureCount(findings)
}
