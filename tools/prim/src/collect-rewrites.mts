/**
 * @file Sync AST-walk classification for the codemod. Walks a parsed program
 *   depth-first and, for each `new Foo(...)`, `Foo.bar(...)` static call, and
 *   `obj.method(...)` prototype call, decides whether a primordial rewrite
 *   applies and records the span. Ambiguous-method sites whose receiver can't
 *   be guessed statically are captured for the post-walk AI pass
 *   (`ai-disambiguate-pass.mts`). Split out from `codemod.mts` so the per-node
 *   classification logic and its globals tables live in one domain.
 */

import type { PendingAmbiguous, Rewrite } from './ai-disambiguate-pass.mts'
import { isAmbiguousMethod } from './ambiguous-methods.mts'
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
import { findClosingParen, walkAst } from './source-text.mts'

/**
 * Walk `ast` and append every applicable primordial rewrite to `rewrites`,
 * recording introduced primordials in `usedPrimordials`. Ambiguous-method call
 * sites that need the AI pass are pushed onto `pendingAmbiguous`.
 *
 * Returns the number of sites skipped (guessed receiver without
 * `--include-guessed`, or ambiguous without an AI fallback) so the caller can
 * fold the count into its total.
 */
export function collectRewrites(options: {
  ast: unknown
  src: string
  exported: Set<string>
  includeGuessed: boolean
  aiDisambiguate: boolean
  isTsFile: boolean
  nullable: Set<string> | undefined
  toChar: (off: number) => number
  localName: (name: string) => string
  rewrites: Rewrite[]
  usedPrimordials: Set<string>
  pendingAmbiguous: PendingAmbiguous[]
}): { skipped: number } {
  const {
    aiDisambiguate,
    ast,
    exported,
    includeGuessed,
    isTsFile,
    localName,
    nullable,
    pendingAmbiguous,
    rewrites,
    src,
    toChar,
    usedPrimordials,
  } = options
  let skipped = 0

  walkAst(ast, node => {
    // ── new Foo(...) ────────────────────────────────────────────────
    if (node.type === 'NewExpression') {
      const callee = node.callee
      if (callee?.type !== 'Identifier' || !TRACKED_GLOBALS.has(callee.name)) {
        return
      }
      const ctor = ctorPrimordialName(callee.name)
      if (!exported.has(ctor)) {
        return
      }
      // Replace `Foo` (the identifier) with `Ctor` (or its aliased form).
      // Add `!` for nullable ctors in TS sources — see static-call site
      // for rationale.
      const ctorNeedsBang = isTsFile && nullable && nullable.has(ctor)
      rewrites.push({
        start: toChar(callee.start),
        end: toChar(callee.end),
        replacement: localName(ctor) + (ctorNeedsBang ? '!' : ''),
      })
      usedPrimordials.add(ctor)
      return
    }

    // ── Foo.bar(args) and obj.method(args) ──────────────────────────
    if (node.type !== 'CallExpression') {
      return
    }
    if (node.callee?.type !== 'MemberExpression') {
      return
    }
    const { object, property } = node.callee
    if (
      !object ||
      !property ||
      property.type !== 'Identifier' ||
      object.type !== 'Identifier'
    ) {
      return
    }

    // Static: Foo.bar(args) → FooBar(args)
    if (TRACKED_GLOBALS.has(object.name)) {
      // Skip data-property / accessor statics that aren't callable
      // primordials (e.g. Error.prepareStackTrace — V8 setter). Same
      // suppression as audit.mts so audit/codemod stay in lock-step.
      if (
        INTENTIONAL_NON_PRIMORDIAL_STATICS.has(
          `${object.name}.${property.name}`,
        )
      ) {
        return
      }
      // Skip statics whose return type narrows on the literal call site
      // (e.g. Symbol.for returns `unique symbol`). Rewriting through a
      // primordial alias collapses to plain `symbol` and breaks
      // computed-key class members downstream.
      if (TYPE_NARROWING_STATIC_CALLS.has(`${object.name}.${property.name}`)) {
        return
      }
      const expected = staticPrimordialName(object.name, property.name)
      if (!exported.has(expected)) {
        return
      }
      // Replace `Foo.bar` (the whole MemberExpression callee) with the
      // primordial name (or its aliased form). Args list stays intact.
      // For nullable primordials (e.g. Buffer.* in cross-env builds where
      // BufferCtor may be `undefined`), add a `!` non-null assertion
      // when emitting into a TypeScript source — the call site's
      // existence proves the runtime is Node, but the type still says
      // `T | undefined`. Plain JS sources don't get the assertion.
      const needsBang = isTsFile && nullable && nullable.has(expected)
      rewrites.push({
        start: toChar(node.callee.start),
        end: toChar(node.callee.end),
        replacement: localName(expected) + (needsBang ? '!' : ''),
      })
      usedPrimordials.add(expected)
      return
    }

    // Prototype: receiver disambiguation.
    let receiverType = UNAMBIGUOUS_PROTOTYPE_METHODS.get(property.name)
    if (!receiverType) {
      // Skip when the property name is a known Node built-in module
      // static method (path.isAbsolute, fs.readFile, etc.). Same
      // suppression as audit.mts to keep audit/codemod in lock-step.
      if (NODE_MODULE_STATIC_METHODS.has(property.name)) {
        return
      }
      // Hard cases (.test, .then, .exec, .catch, .finally): widely
      // duck-typed by user libraries. Try the static guess first;
      // fall back to AI-deferred classification when --ai-disambiguate
      // is on. See ambiguous-methods.mts for the rationale.
      if (isAmbiguousMethod(property.name)) {
        const guess = guessReceiverType(object.name)
        if (guess) {
          // Static signal won — drop into the same path as a
          // non-ambiguous guessed receiver below.
          if (!includeGuessed) {
            skipped += 1
            return
          }
          receiverType = guess
        } else if (aiDisambiguate) {
          // Defer: capture the call site for a post-walk async pass.
          // Ambiguous-method callers must consult Claude before deciding
          // whether to rewrite.
          pendingAmbiguous.push({
            calleeStart: toChar(node.callee.start),
            calleeEnd: toChar(node.callee.end),
            firstArgStart:
              node.arguments.length > 0 ? toChar(node.arguments[0].start) : -1,
            lastArgEnd:
              node.arguments.length > 0
                ? toChar(node.arguments.at(-1).end)
                : toChar(node.callee.end),
            methodName: property.name,
            objectEnd: toChar(object.end),
            objectStart: toChar(object.start),
            offset: node.callee.start,
            receiverName: object.name,
          })
          return
        } else {
          skipped += 1
          return
        }
      } else {
        const guess = guessReceiverType(object.name)
        if (!guess) {
          return
        }
        if (!includeGuessed) {
          skipped += 1
          return
        }
        receiverType = guess
      }
    }
    const expected = prototypePrimordialName(receiverType, property.name)
    if (!exported.has(expected)) {
      return
    }
    // Rewrite `obj.method(args)` → `Primordial(obj, args)`.
    // Need to span from start of `node.callee` through the closing `)`.
    // node.end is unreliable on bundles (acorn-wasm parser bug — see
    // repairEndPositions above), so we don't trust it for the outermost
    // span. Instead: take the start of the call (= node.callee.start)
    // and scan forward from after the last argument's end to find the
    // matching `)`. Whitespace, line comments, and trailing commas
    // between the last arg and `)` are tolerated.
    const objSrc = src.slice(toChar(object.start), toChar(object.end))
    const argsSrc =
      node.arguments.length > 0
        ? src.slice(
            toChar(node.arguments[0].start),
            toChar(node.arguments.at(-1).end),
          )
        : ''
    const callStart = toChar(node.callee.start)
    const lastArgEnd =
      node.arguments.length > 0
        ? toChar(node.arguments.at(-1).end)
        : toChar(node.callee.end)
    const callEnd = findClosingParen(src, lastArgEnd)
    if (callEnd < 0) {
      // Couldn't find `)` — bail on this rewrite rather than corrupt.
      return
    }
    const needsBang = isTsFile && nullable && nullable.has(expected)
    const fnName = localName(expected) + (needsBang ? '!' : '')
    const replacement = argsSrc
      ? `${fnName}(${objSrc}, ${argsSrc})`
      : `${fnName}(${objSrc})`
    rewrites.push({
      start: callStart,
      end: callEnd,
      replacement,
    })
    usedPrimordials.add(expected)
  })

  return { skipped }
}
