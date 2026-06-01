/**
 * @file acorn-walk visitor table for the primordial audit. Built per
 *   `auditDirectory` call from a context object that carries the shared
 *   per-file state (`currentFile`), the finding recorders, the exported-name
 *   set, and the pending-ambiguous queue. Split out of `audit.mts` to keep the
 *   orchestrator readable and under the file-size cap.
 */

import { isAmbiguousMethod } from './ambiguous-methods.mts'
import {
  isBundlerHelperAssignment,
  isExportsInteropGlue,
  isObjectPrototypeIdiom,
  lineColumnAt,
} from './audit-helpers.mts'
import { buildSnippet } from './disambiguate.mts'
import {
  INTENTIONAL_NON_PRIMORDIAL_STATICS,
  NODE_MODULE_STATIC_METHODS,
  TRACKED_GLOBALS,
  TYPE_NARROWING_STATIC_CALLS,
  UNAMBIGUOUS_PROTOTYPE_METHODS,
  ctorPrimordialName,
  guessReceiverType,
  prototypePrimordialName,
  staticPrimordialName,
} from './globals.mts'

/**
 * Build the acorn-walk visitor table.
 *
 * @param {Object} ctx
 * @param {boolean} ctx.aiDisambiguate
 * @param {{ relPath: string, lineStarts: number[], src: string }} ctx.currentFile
 * @param {Set<string>} ctx.exported Currently-exported primordials.
 * @param {Array<Object>} ctx.pendingAmbiguous Queue drained after the walk.
 * @param {(file: string, offset: number, pattern: string, primordial: string) => void} ctx.record
 * @param {(file: string, offset: number, name: string, pattern: string) => void} ctx.recordRedeclaration
 */
export function buildVisitors({
  aiDisambiguate,
  currentFile,
  exported,
  pendingAmbiguous,
  record,
  recordRedeclaration,
}) {
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

  return {
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
          a.type === 'ArrowFunctionExpression' ||
          a.type === 'FunctionDeclaration' ||
          a.type === 'FunctionExpression'
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
        // Skip statics whose return type narrows on the literal call
        // site (Symbol.for returns `unique symbol`). Rewriting through a
        // primordial alias collapses to plain `symbol` and breaks
        // computed-key class members.
        if (
          TYPE_NARROWING_STATIC_CALLS.has(`${object.name}.${property.name}`)
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
      // Skip statics whose return type narrows on the literal call
      // site (Symbol.for). See codemod.mts for the rationale.
      if (TYPE_NARROWING_STATIC_CALLS.has(`${node.object.name}.${propName}`)) {
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
}
