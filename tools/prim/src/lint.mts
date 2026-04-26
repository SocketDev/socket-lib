/**
 * @fileoverview `prim lint` — structural lint rules for primordials usage.
 *
 * Currently encoded rules:
 *   - **ctor-rename**: constructor-shaped primordials (`Array`, `Set`,
 *     `Map`, `TypeError`, etc.) imported from `primordials` MUST be
 *     aliased `<Name>: <Name>Ctor` to avoid shadowing the global:
 *
 *       const { Array: ArrayCtor, Set: SetCtor } = primordials   // OK
 *       const { Array, Set } = primordials                       // VIOLATION
 *
 *     Same idea for any other alias (`Array: A`, `Set: MySet`) — the
 *     local name must be exactly `<Name>Ctor`.
 *
 * The file walks source code, parses every `const { ... } = primordials`
 * destructure, and reports violations with file:line:column locations.
 * Future lint rules slot into the same visitor.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'

import { walk } from 'acorn-wasm'

// Names that MUST be aliased with `<Name>Ctor` when imported from
// `primordials` (or any other surface). Matches the convention used
// across socket-lib's `src/primordials.ts` and socket-btm's additions.
const CTOR_NAMES = new Set([
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'FinalizationRegistry',
  'Float32Array',
  'Float64Array',
  'Function',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'Map',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'WeakMap',
  'WeakRef',
  'WeakSet',
])

const TS_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.tsx'])
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx'])

const PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  locations: true,
  allowImportExportEverywhere: true,
  allowAwaitOutsideFunction: true,
  allowHashBang: true,
}

/**
 * @typedef {Object} LintFinding
 * @property {string} rule        The lint rule that fired (e.g. `ctor-rename`).
 * @property {string} file
 * @property {number} line
 * @property {number} column
 * @property {string} name        The identifier that violated the rule.
 * @property {string} expected    The expected name/alias.
 * @property {string} source      Where it was destructured from
 *                                (`primordials`, `require('foo')`, etc.).
 */

function buildLineStarts(src) {
  const starts = [0]
  for (let i = 0; i < src.length; i += 1) {
    if (src.charCodeAt(i) === 10) {
      starts.push(i + 1)
    }
  }
  return starts
}

function lineColumnAt(lineStarts, offset) {
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (lineStarts[mid] <= offset) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return { line: lo + 1, column: offset - lineStarts[lo] + 1 }
}

/**
 * Default set of source identifiers / require specifiers that we
 * consider "primordials-shaped" — destructures from these sources are
 * subject to ctor-rename and other primordials lint rules. The user
 * can extend this via `--primordials-source <name>` (CLI flag,
 * repeatable).
 *
 * Defaults cover the patterns we know about today:
 *   - `primordials` — Node bootstrap global (in `lib/internal/...`).
 *   - `internal/socketsecurity/safe-references` — socket-btm's curated
 *     re-export of cached primordial references.
 *   - `safe-references` — short form (when require resolution allows).
 */
const DEFAULT_PRIMORDIAL_SOURCES = [
  'primordials',
  'internal/socketsecurity/safe-references',
  'safe-references',
]

/**
 * Identifies the "kind" of a destructuring init expression. Returns
 * the canonical source name (e.g. `primordials`, `internal/foo`) for
 * sources we recognize, or `null` for everything else.
 */
function classifySource(node, primordialSources) {
  if (!node) {
    return null
  }
  if (node.type === 'Identifier') {
    return primordialSources.has(node.name) ? node.name : null
  }
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments?.[0]?.type === 'Literal' &&
    typeof node.arguments[0].value === 'string'
  ) {
    const spec = node.arguments[0].value
    if (primordialSources.has(spec)) {
      return spec
    }
    // Allow trailing-segment match: `require('internal/foo/safe-references')`
    // matches the configured `safe-references`. Helps cover paths from
    // different roots without forcing the user to enumerate every
    // possible prefix.
    const segments = spec.split('/')
    const tail = segments[segments.length - 1]
    if (tail && primordialSources.has(tail)) {
      return spec
    }
    return null
  }
  return null
}

/** Pretty-print the source for finding output. */
function describeSource(node) {
  if (!node) {
    return '<unknown>'
  }
  if (node.type === 'Identifier') {
    return node.name
  }
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments?.[0]?.type === 'Literal'
  ) {
    return `require('${node.arguments[0].value}')`
  }
  return node.type
}

/**
 * @param {Object} opts
 * @param {string} opts.targetRoot
 * @param {string} opts.scanDir
 * @param {string[]} [opts.skipDirs]
 * @param {string[]} [opts.skipFiles]
 * @param {string[]} [opts.primordialSources]   Override default
 *        ['primordials', 'safe-references', ...]. Use to add custom
 *        primordials-shaped modules.
 * @returns {LintFinding[]}
 */
export function lintSource({
  targetRoot,
  scanDir,
  skipDirs,
  skipFiles,
  primordialSources,
}) {
  const findings = []
  const seen = new Set()

  const dirsToSkip = new Set(skipDirs ?? ['external', 'node_modules', '.cache'])
  const filesToSkip = new Set(skipFiles ?? [])
  const sources = new Set(primordialSources ?? DEFAULT_PRIMORDIAL_SOURCES)

  const currentFile = { relPath: '', lineStarts: [0] }

  function recordCtorRename(name, source, offset) {
    const { line, column } = lineColumnAt(currentFile.lineStarts, offset)
    const dedupKey = `ctor-rename:${currentFile.relPath}:${line}:${column}:${name}`
    if (seen.has(dedupKey)) {
      return
    }
    seen.add(dedupKey)
    findings.push({
      rule: 'ctor-rename',
      file: currentFile.relPath,
      line,
      column,
      name,
      expected: `${name}Ctor`,
      source,
    })
  }

  const visitors = {
    VariableDeclarator(node) {
      // Only `const { ... } = X` patterns.
      if (node.id?.type !== 'ObjectPattern' || !node.init) {
        return
      }
      if (!classifySource(node.init, sources)) {
        return
      }
      const sourceDesc = describeSource(node.init)
      for (const prop of node.id.properties) {
        if (
          prop.type !== 'Property' ||
          prop.key?.type !== 'Identifier' ||
          !CTOR_NAMES.has(prop.key.name)
        ) {
          continue
        }
        // If `prop.shorthand`, the imported name == the local name —
        // i.e. `{ Array }` instead of `{ Array: ArrayCtor }`. That's
        // what we want to flag.
        if (prop.shorthand) {
          recordCtorRename(prop.key.name, sourceDesc, prop.key.start)
          continue
        }
        // Non-shorthand: check the local alias matches `<Name>Ctor`.
        if (
          prop.value?.type === 'Identifier' &&
          prop.value.name !== `${prop.key.name}Ctor`
        ) {
          // Aliased to something other than `<Name>Ctor` — also a
          // convention miss (e.g. `Array: A` or `Set: MySet`).
          recordCtorRename(prop.key.name, sourceDesc, prop.key.start)
        }
      }
    },
  }

  function lintFile(absPath, relPath) {
    const ext = path.extname(absPath)
    const rawSrc = readFileSync(absPath, 'utf8')
    let src = rawSrc
    if (TS_EXTENSIONS.has(ext)) {
      try {
        src = stripTypeScriptTypes(rawSrc, { mode: 'strip' })
      } catch {
        return
      }
    }
    currentFile.relPath = relPath
    currentFile.lineStarts = buildLineStarts(src)
    try {
      walk(src, visitors, PARSE_OPTIONS)
    } catch {
      // Parse errors handled by lint/type pipelines.
    }
  }

  function* walkDir(dir) {
    for (const entry of readdirSync(dir)) {
      if (dirsToSkip.has(entry) || filesToSkip.has(entry)) {
        continue
      }
      const abs = path.join(dir, entry)
      const stat = statSync(abs)
      if (stat.isDirectory()) {
        yield* walkDir(abs)
      } else {
        const ext = path.extname(entry)
        if (TS_EXTENSIONS.has(ext) || JS_EXTENSIONS.has(ext)) {
          yield abs
        }
      }
    }
  }

  for (const abs of walkDir(scanDir)) {
    const rel = path.relative(targetRoot, abs)
    lintFile(abs, rel)
  }

  return findings
}

export function formatLintFindings(findings, ctx) {
  if (findings.length === 0) {
    return `${ctx.targetName}: no lint violations.\n`
  }
  const lines = [
    `${ctx.targetName} (lint): ${findings.length} violation(s)\n`,
  ]
  for (const f of findings) {
    lines.push(
      `  [${f.rule}] ${f.file}:${f.line}:${f.column}  destructured \`${f.name}\` from ${f.source}; expected \`${f.name}: ${f.expected}\``,
    )
  }
  return lines.join('\n') + '\n'
}
