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

import { isAmbiguousMethod } from './ambiguous-methods.mts'
import { buildSnippet, disambiguateReceiver } from './disambiguate.mts'
import {
  INTENTIONAL_NON_PRIMORDIAL_STATICS,
  NODE_MODULE_STATIC_METHODS,
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
// `.d.ts`, `.d.mts`, `.d.cts` are type-only declaration files — no
// runtime code, so they can never contain a primordial call site.
// `path.extname` returns just `.ts` for `foo.d.ts`, so we have to
// match against the basename's secondary suffix.
function isDeclarationFile(absPath) {
  const base = path.basename(absPath)
  return /\.d\.[mc]?ts$/.test(base)
}

/** Returns true if the file's extension is one we walk. */
function isSourceFile(absPath) {
  if (isDeclarationFile(absPath)) {
    return false
  }
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
 * @param {boolean} [opts.aiDisambiguate]    When true, defer ambiguous
 *   prototype methods (.test, .then, etc.) to Claude with a locked-down
 *   read-only tool surface. Off by default — opt-in via CLI flag.
 *   Requires ANTHROPIC_API_KEY in env.
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
   * Record a `redeclaration` finding — a top-level `const NAME = expr`
   * where `NAME` matches a primordials export and `expr` reaches a
   * built-in (Error, JSON.parse, Array.isArray, etc.). This is the
   * shape consumers fall back to when they don't know they can
   * import from `./primordials`. The codemod (eventually) rewrites
   * these to a single `import { NAME } from './primordials'` line.
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
  /** @type {Array<{file:string, offset:number, line:number, column:number, methodName:string, receiverName:string, snippet:string}>} */
  const pendingAmbiguous = []

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
    VariableDeclarator(node, ancestors) {
      // Detect local-alias redeclaration of primordials:
      //   const ErrorCtor = Error
      //   const JSONParse = JSON.parse
      //   const ArrayIsArray = Array.isArray
      //
      // The audit normally visits the right-hand side via NewExpression /
      // CallExpression / MemberExpression and reports a "covered" finding —
      // technically correct, but misses the larger improvement: this file
      // should `import { NAME } from './primordials'` and skip the
      // declaration entirely. Surface as kind='redeclaration' so reports
      // and codemod can act on it specifically.
      if (
        node.id?.type !== 'Identifier' ||
        typeof node.id.name !== 'string' ||
        !exported.has(node.id.name)
      ) {
        return
      }
      // Skip the primordials.ts file itself — it IS the canonical
      // declaration. The skipFiles allowlist in scanDir already filters
      // by filename, but files under different names (a vendored copy,
      // a re-export module) shouldn't trip the redeclaration check
      // either if their declarations are intentionally re-exports.
      const init = node.init
      if (!init) {
        return
      }
      // Recognized RHS shapes that produce a primordial alias:
      //   Identifier            (e.g. Error)
      //   MemberExpression      (e.g. JSON.parse, Array.isArray, Object.keys)
      // Anything else (a function call, a literal) isn't a primordial
      // alias even if the LHS name happens to match.
      const isAliasRhs =
        init.type === 'Identifier' ||
        (init.type === 'MemberExpression' && !init.computed)
      if (!isAliasRhs) {
        return
      }
      // Only care about top-level declarations (Program → VariableDeclaration → VariableDeclarator).
      // Local-scope shadowing is a different kind of bug and out of scope.
      let topLevel = false
      for (let i = ancestors.length - 1; i >= 0; i -= 1) {
        const a = ancestors[i]
        if (a.type === 'Program') {
          topLevel = true
          break
        }
        if (
          a.type === 'FunctionDeclaration' ||
          a.type === 'FunctionExpression' ||
          a.type === 'ArrowFunctionExpression'
        ) {
          return
        }
      }
      if (!topLevel) {
        return
      }
      // Compose a human-readable RHS string for the report.
      let rhs
      if (init.type === 'Identifier') {
        rhs = init.name
      } else {
        // MemberExpression — `Object.name` or `Object.prototype.name`.
        const objName =
          init.object?.type === 'Identifier' ? init.object.name : '?'
        const propName =
          init.property?.type === 'Identifier' ? init.property.name : '?'
        rhs = `${objName}.${propName}`
      }
      recordRedeclaration(
        currentFile.relPath,
        node.start,
        node.id.name,
        `const ${node.id.name} = ${rhs}`,
      )
    },
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
        // Skip data-property / accessor statics that aren't callable
        // primordials (e.g. Error.prepareStackTrace — V8 setter).
        if (
          INTENTIONAL_NON_PRIMORDIAL_STATICS.has(
            `${object.name}.${property.name}`,
          )
        ) {
          return
        }
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
        // Skip when the property name is a known Node built-in module
        // static method (path.isAbsolute, fs.readFile, os.tmpdir, etc.).
        // The receiver is a module object regardless of identifier
        // shape — guessing the receiver as String/Array would be wrong.
        if (NODE_MODULE_STATIC_METHODS.has(property.name)) {
          return
        }
        // Hard cases (.test, .then, .exec, .catch, .finally): widely
        // duck-typed by user libraries. Static guess via identifier
        // name still applies ("re" → RegExp, "promise" → Promise);
        // for the rest, queue for AI-deferred classification when
        // --ai-disambiguate is on.
        if (isAmbiguousMethod(property.name)) {
          const guess = guessReceiverType(object.name)
          if (guess) {
            record(
              currentFile.relPath,
              node.start,
              `${object.name}.${property.name}(...)  [guessed: ${guess}]`,
              prototypePrimordialName(guess, property.name),
            )
            return
          }
          if (aiDisambiguate) {
            // Defer to a post-walk async pass. Snapshot what the
            // disambiguator needs; the AST gets thrown away when
            // the walk ends, so we capture by value.
            const { line, column } = lineColumnAt(
              currentFile.lineStarts,
              node.start,
            )
            pendingAmbiguous.push({
              column,
              file: currentFile.relPath,
              line,
              methodName: property.name,
              offset: node.start,
              receiverName: object.name,
              snippet: buildSnippet(
                currentFile.src,
                currentFile.lineStarts,
                line,
              ),
            })
          }
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
      // Skip data-property / accessor statics that aren't callable
      // primordials (e.g. Error.prepareStackTrace — V8 setter).
      if (
        INTENTIONAL_NON_PRIMORDIAL_STATICS.has(
          `${node.object.name}.${propName}`,
        )
      ) {
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
    for (const item of pendingAmbiguous) {
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
