/**
 * @fileoverview Walk a directory of JavaScript/TypeScript and emit
 * findings: every site where a primordial would (or already does)
 * apply.
 *
 * Each finding records:
 *   - The primordial that maps to the call site (e.g. `ArrayPrototypeMap`).
 *   - Whether that primordial is currently exported from socket-lib
 *     (`covered`) or not yet (`gap`).
 *   - File / line / column / source pattern for human inspection.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import { walk } from 'acorn-wasm'

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
  TRACKED_GLOBALS,
  UNAMBIGUOUS_PROTOTYPE_METHODS,
  ctorPrimordialName,
  guessReceiverType,
  prototypePrimordialName,
  staticPrimordialName,
} from './globals.mts'

// File extensions the walker descends into. TypeScript files get
// type-stripped before parsing (acorn-wasm's `typescript: true` doesn't
// cover modern TS syntax: `export type`, class fields with annotations,
// generic type parameters, etc.). The strip-then-parse approach is
// reliable and uses only Node built-ins (`module.stripTypeScriptTypes`,
// available 22.6+).
const TS_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.tsx'])
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx'])

/** Returns true if the file's extension is one we walk. */
function isSourceFile(absPath) {
  const ext = path.extname(absPath)
  return TS_EXTENSIONS.has(ext) || JS_EXTENSIONS.has(ext)
}

const PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  locations: true,
  allowImportExportEverywhere: true,
  allowAwaitOutsideFunction: true,
  allowHashBang: true,
}

/**
 * Build a (start-of-line offset → 1-based line number) lookup for a
 * source string. acorn-wasm's `node.loc` is unreliable in our build
 * (locations come back undefined despite `locations: true`), so we
 * compute line/column from `node.start` (a 0-based byte offset)
 * ourselves.
 */
function lineColumnAt(lineStarts, offset) {
  // Binary search for the largest lineStarts entry ≤ offset.
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
  return {
    line: lo + 1,
    column: offset - lineStarts[lo] + 1,
  }
}

function buildLineStarts(src) {
  const starts = [0]
  for (let i = 0; i < src.length; i += 1) {
    if (src.charCodeAt(i) === 10) {
      starts.push(i + 1)
    }
  }
  return starts
}

/**
 * @typedef {Object} Finding
 * @property {string} primordial    Name of the matching primordial.
 * @property {string} pattern       Source-level pattern, e.g. `Object.keys(...)`.
 * @property {string} file          Path relative to the target root.
 * @property {number} line
 * @property {number} column
 * @property {'covered'|'gap'} kind Whether the primordial exists today.
 */

/**
 * @param {Object} opts
 * @param {string} opts.targetRoot
 * @param {string} opts.scanDir              Directory to walk.
 * @param {Set<string>} opts.exported        Currently-exported primordials.
 * @param {string[]} [opts.skipDirs]         Directories to skip during walk.
 * @param {string[]} [opts.skipFiles]        Files to skip (basename match).
 * @returns {Finding[]}
 */
export function auditDirectory({
  targetRoot,
  scanDir,
  exported,
  skipDirs = ['external', 'node_modules', '.cache'],
  skipFiles = [
    'primordials.js',
    'primordials.mjs',
    'primordials.cjs',
    'primordials.ts',
    'primordials.mts',
    'primordials.cts',
  ],
}) {
  const findings = []
  const seen = new Set()

  function record(file, offset, pattern, primordial) {
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

  // Per-file context the visitors read. acorn-wasm's walker doesn't
  // pass extra args beyond ancestors, so we share state via this
  // closure-scoped handle. Reset on every `auditFile` call.
  const currentFile = { relPath: '', lineStarts: [0] }

  /**
   * Recognize esbuild's CJS-output boilerplate — the helper-variable
   * assignments at the top of every esbuild-bundled file:
   *   var __defProp = Object.defineProperty;
   *   var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
   *   var __getOwnPropNames = Object.getOwnPropertyNames;
   *   var __hasOwnProp = Object.prototype.hasOwnProperty;
   *
   * These are machine-generated bundler plumbing, not user code. The
   * tell is that they're being assigned to a `__`-prefixed identifier
   * inside a `VariableDeclarator`. The helpers themselves use those
   * locals, not the original `Object.X` references — flagging the
   * assignment is misleading because there's nothing to migrate.
   */
  function isBundlerHelperAssignment(ancestors) {
    // ancestors are listed root-first; the immediate parent is the last entry.
    // Walk up looking for the nearest VariableDeclarator.
    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
      const a = ancestors[i]
      if (a.type === 'VariableDeclarator') {
        return (
          a.id?.type === 'Identifier' &&
          typeof a.id.name === 'string' &&
          a.id.name.startsWith('__')
        )
      }
      // Don't cross function/program boundaries — only check the direct
      // VariableDeclarator if we're inside one.
      if (
        a.type === 'FunctionDeclaration' ||
        a.type === 'FunctionExpression' ||
        a.type === 'ArrowFunctionExpression' ||
        a.type === 'Program'
      ) {
        return false
      }
    }
    return false
  }

  /**
   * Recognize the safe `Object.prototype.hasOwnProperty.call(target, key)`
   * idiom — that's already-correct hardening, not a migration target.
   *
   * Pattern: `Object.prototype.<method>.call(...)` where `<method>` is
   * a method on `Object.prototype` (`hasOwnProperty`, `propertyIsEnumerable`,
   * `isPrototypeOf`, `toString`, etc.). Reporting these as "Object.prototype"
   * findings is noise.
   */
  function isObjectPrototypeIdiom(node) {
    return (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.object?.type === 'MemberExpression' &&
      !node.object.computed &&
      node.object.object?.type === 'Identifier' &&
      node.object.object.name === 'Object' &&
      node.object.property?.name === 'prototype'
    )
  }

  /**
   * Recognize esbuild/tsc CommonJS interop glue:
   *   Object.defineProperty(exports, "__esModule", { value: true })
   *   Object.defineProperty(module.exports, ...)
   * These are machine-generated by every bundler that emits CJS from
   * ESM. They aren't migration candidates — they're plumbing.
   */
  function isExportsInteropGlue(node) {
    if (node.callee?.type !== 'MemberExpression') {
      return false
    }
    const { object, property } = node.callee
    if (
      object?.type !== 'Identifier' ||
      object.name !== 'Object' ||
      property?.name !== 'defineProperty'
    ) {
      return false
    }
    const firstArg = node.arguments?.[0]
    if (!firstArg) {
      return false
    }
    // Object.defineProperty(exports, ...)
    if (firstArg.type === 'Identifier' && firstArg.name === 'exports') {
      return true
    }
    // Object.defineProperty(module.exports, ...)
    if (
      firstArg.type === 'MemberExpression' &&
      !firstArg.computed &&
      firstArg.object?.type === 'Identifier' &&
      firstArg.object.name === 'module' &&
      firstArg.property?.name === 'exports'
    ) {
      return true
    }
    return false
  }

  // Constructor naming differs between surfaces:
  //   socket-lib uses `<Name>Ctor` (e.g. `ArrayCtor`, `SetCtor`)
  //   Node bootstrap uses bare `<Name>` (e.g. `Array`, `Set`)
  // Pick whichever variant the surface actually exports; if neither
  // is present we report the socket-lib convention as the gap so the
  // expansion target is clear.
  function resolveCtorName(globalName) {
    const sktName = ctorPrimordialName(globalName)
    if (exported.has(sktName)) {
      return sktName
    }
    if (exported.has(globalName)) {
      return globalName
    }
    return sktName
  }

  const visitors = {
    NewExpression(node, _ancestors) {
      if (
        node.callee?.type !== 'Identifier' ||
        !TRACKED_GLOBALS.has(node.callee.name)
      ) {
        return
      }
      record(
        currentFile.relPath,
        node.start,
        `new ${node.callee.name}(...)`,
        resolveCtorName(node.callee.name),
      )
    },
    CallExpression(node, _ancestors) {
      if (node.callee?.type !== 'MemberExpression') {
        return
      }
      // Skip esbuild/tsc CJS interop glue — `Object.defineProperty(exports, ...)`.
      if (isExportsInteropGlue(node)) {
        return
      }
      const { object, property } = node.callee
      if (!object || !property || property.type !== 'Identifier') {
        return
      }
      if (object.type === 'Identifier' && TRACKED_GLOBALS.has(object.name)) {
        record(
          currentFile.relPath,
          node.start,
          `${object.name}.${property.name}(...)`,
          staticPrimordialName(object.name, property.name),
        )
        return
      }
      if (object.type === 'Identifier') {
        // Strongest signal: the method name itself maps to one type
        // unambiguously (e.g. `.toUpperCase()` → String only,
        // `.getTime()` → Date only).
        const methodType = UNAMBIGUOUS_PROTOTYPE_METHODS.get(property.name)
        if (methodType) {
          record(
            currentFile.relPath,
            node.start,
            `${object.name}.${property.name}(...)  [method: ${methodType}]`,
            prototypePrimordialName(methodType, property.name),
          )
          return
        }
        // Weaker signal: guess the receiver's type from its name.
        const guess = guessReceiverType(object.name)
        if (!guess) {
          return
        }
        record(
          currentFile.relPath,
          node.start,
          `${object.name}.${property.name}(...)  [guessed: ${guess}]`,
          prototypePrimordialName(guess, property.name),
        )
      }
    },
    MemberExpression(node, ancestors) {
      if (
        node.computed ||
        node.object?.type !== 'Identifier' ||
        !TRACKED_GLOBALS.has(node.object.name) ||
        !node.property?.name
      ) {
        return
      }
      // Skip the safe `Object.prototype.X.call(...)` idiom — already
      // hardened, not a migration target.
      if (isObjectPrototypeIdiom(node)) {
        return
      }
      // Skip esbuild's `var __defProp = Object.defineProperty;` boilerplate.
      if (isBundlerHelperAssignment(ancestors)) {
        return
      }
      const propName = node.property.name
      if (propName[0] !== propName[0].toLowerCase()) {
        return
      }
      record(
        currentFile.relPath,
        node.start,
        `${node.object.name}.${propName}`,
        staticPrimordialName(node.object.name, propName),
      )
    },
  }

  function auditFile(absPath, relPath) {
    const ext = path.extname(absPath)
    const rawSrc = readFileSync(absPath, 'utf8')
    // For TypeScript files, strip types before parsing. We use mode
    // 'transform' (not 'strip') because the latter pads stripped
    // regions with whitespace to preserve byte offsets — but
    // `stripTypeScriptTypes` only supports 'strip' for sourceType
    // 'module'+ files when the strip leaves a parseable result. For
    // our purposes (offset → line/column) we re-derive line offsets
    // from the parseable source, so 'transform' is fine.
    let src = rawSrc
    if (TS_EXTENSIONS.has(ext)) {
      try {
        src = stripTypeScriptTypes(rawSrc, { mode: 'strip' })
      } catch {
        // Strip failed (e.g. syntax error). Skip this file —
        // lint/type pipelines catch syntax errors elsewhere.
        return
      }
    }
    currentFile.relPath = relPath
    currentFile.lineStarts = buildLineStarts(src)
    try {
      walk(src, visitors, PARSE_OPTIONS)
    } catch {
      // File didn't parse — skip silently. Lint/type pipelines catch
      // syntax errors elsewhere.
    }
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

  return findings
}
