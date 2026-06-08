/**
 * @file Walk a directory of JavaScript/TypeScript and emit findings: every site
 *   where a primordial would (or already does) apply. Each finding records:
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

import { walk } from 'acorn'

// Suppress the one-time ExperimentalWarning from stripTypeScriptTypes
// without affecting other warnings. We replace Node's default emit-to-
// stderr behavior with a filter that silences just this one warning;
// everything else gets re-emitted to stderr in the same format.
const defaultEmitWarning = process.emitWarning.bind(process)
process.emitWarning = function emitWarning(...args) {
  const [warning, name] = args
  const warningStr = typeof warning === 'string' ? warning : warning?.message
  const warningName = typeof name === 'string' ? name : warning?.name
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

/**
 * @typedef {Object} Finding
 *
 * @property {string} primordial Name of the matching primordial.
 * @property {string} pattern Source-level pattern, e.g. `Object.keys(...)`.
 * @property {string} file Path relative to the target root.
 * @property {number} line
 * @property {number} column
 * @property {'covered' | 'gap'} kind Whether the primordial exists today.
 */

/**
 * @param {Object} opts
 * @param {string} opts.targetRoot
 * @param {string} opts.scanDir Directory to walk.
 * @param {Set<string>} opts.exported Currently-exported primordials.
 * @param {string[]} [opts.skipDirs] Directories to skip during walk.
 * @param {string[]} [opts.skipFiles] Files to skip (basename match).
 * @param {boolean} [opts.aiDisambiguate] When true, defer ambiguous prototype
 *   methods (.test, .then, etc.) to Claude with a locked-down read-only tool
 *   surface. Off by default — opt-in via CLI flag. Requires ANTHROPIC_API_KEY
 *   in env.
 *
 * @returns {Promise<Finding[]>}
 */
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
}) {
  const findings = []
  const seen = new Set()

  function record(file, offset, pattern, primordial) {
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
  function recordRedeclaration(file, offset, name, pattern) {
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
  /**
   * @type {{
   *   file: string
   *   offset: number
   *   line: number
   *   column: number
   *   methodName: string
   *   receiverName: string
   *   snippet: string
   * }[]}
   */
  const pendingAmbiguous = []

  const visitors = buildVisitors({
    aiDisambiguate,
    currentFile,
    exported,
    pendingAmbiguous,
    record,
    recordRedeclaration,
  })

  // Track files that couldn't be audited. Two failure modes:
  //   - parse: acorn-wasm threw on the (possibly type-stripped) source.
  //   - strip: Node's module.stripTypeScriptTypes threw before we got
  //     to the parser. Different mode but same user impact (the file
  //     was silently skipped, audit results incomplete).
  const parseFailureFiles: string[] = []
  const stripFailureFiles: string[] = []

  function auditFile(absPath, relPath) {
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
  function attachParseFailureCount(arr) {
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

  function* walkDir(dir) {
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
  // Claude (or hits the on-disk cache) and produces a verdict.
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
