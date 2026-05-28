/* oxlint-disable socket/sort-source-methods -- codemod helpers ordered by AST walk phase; module-level config / pattern tables between them block autofix. */
/**
 * @file Codemod: rewrite call sites to use primordials. Strategy: collect all
 *   rewrite spans (start/end positions in source) per file, then apply them
 *   back-to-front so earlier positions don't shift after replacement. After
 *   rewriting, prepend an import block for every primordial introduced. What
 *   gets rewritten:
 *
 *   - `Object.keys(x)` → `ObjectKeys(x)` (static method)
 *   - `Math.ceil(n)` → `MathCeil(n)` (static method)
 *   - `JSON.parse(s)` → `JSONParse(s)` (static method)
 *   - `new TypeError(msg)` → `new TypeErrorCtor(msg)` (constructor)
 *   - With `--include-guessed` or unambiguous-method match: `arr.map(fn)` →
 *     `ArrayPrototypeMap(arr, fn)` (prototype method) What is NOT rewritten:
 *   - Patterns whose primordial isn't exported yet — they show up in `prim gaps`
 *     and need a surface addition first.
 *   - Property-only access (`Symbol.iterator`) — out of scope; it's a constant
 *     reference, not a call. Default mode is dry-run. `--apply` actually writes
 *     the files.
 */

import {
  closeSync,
  fsyncSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'

import { parse } from 'acorn-wasm'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import type { PlannedRewrite, ValidationFinding } from './validate.mts'
import { validateRewrites } from './validate.mts'

import { isAmbiguousMethod } from './ambiguous-methods.mts'
import { buildSnippet, disambiguateReceiver } from './disambiguate.mts'
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

const DEFAULT_PRIMORDIALS_IMPORT_SPECIFIER = '@socketsecurity/lib/primordials'

/**
 * Output format for the inserted primordials import: { kind: 'esm' }: emits
 * `import { X, Y } from '<specifier>'`. Default; used when the target is ESM
 * source code. { kind: 'cjs' }: emits `const { X, Y } =
 * require('<specifier>')`. Used when the target is CJS bundled output
 * (dist/external/*.js).
 *
 * `specifier` is either a static string or a `(absFilePath) => string`
 * function. The function form lets callers compute a per-file relative path to
 * the primordials module — e.g. absFile === '.../dist/external/tar-fs.js' →
 * '../primordials.js' absFile === '.../dist/external/@npmcli/x/y.js' →
 * '../../../primordials.js'
 *
 * `aliasPrefix` (optional) renames the imported identifiers in the destructure
 * list. Useful for the bundle-transform path: bundled externals frequently
 * declare local `var ObjectDefineProperty = …` shadows from esbuild's CJS
 * interop runtime, which would collide with a top-level `const {
 * ObjectDefineProperty } = require(…)`. Setting `aliasPrefix: '_p_'` rewrites
 * all primordial references in the file to `_p_ObjectDefineProperty(…)` and
 * emits the require as `const { ObjectDefineProperty: _p_ObjectDefineProperty }
 * = …`, avoiding any clash with the bundle's own identifiers.
 *
 * `splitByLeaf` (optional) groups identifiers by leaf name and emits one import
 * / require per leaf. Used after the primordials split, where consumers no
 * longer share a single barrel — instead each primordial lives in
 * `@socketsecurity/lib/primordials/<leaf>`. `exportToLeaf` maps every export
 * name to its leaf; `leafSpecifier` receives the consumer's absolute path plus
 * the leaf name and returns the import target. When `splitByLeaf` is set, the
 * top-level `specifier` is ignored.
 *
 * @typedef {{
 *   kind: 'esm' | 'cjs'
 *   specifier: string | ((absFile: string) => string)
 *   aliasPrefix?: string
 *   splitByLeaf?: {
 *     exportToLeaf: Map<string, string>
 *     leafSpecifier: (absFile: string, leaf: string) => string
 *   }
 * }} ImportStyle
 */

/**
 * @typedef {Object} CodemodResult
 *
 * @property {number} filesChanged
 * @property {number} rewriteCount
 * @property {number} skipped Rewrites declined (e.g. guessed-receiver without
 *   --include-guessed).
 * @property {{ file: string; rewrites: number; importAdded: boolean }[]} files
 */

/**
 * @param {Object} opts
 * @param {string} opts.targetRoot
 * @param {string} opts.scanDir
 * @param {Set<string>} opts.exported
 * @param {boolean} opts.apply
 * @param {boolean} opts.includeGuessed
 * @param {boolean} [opts.aiDisambiguate] When true, defer ambiguous prototype
 *   methods (.test, .then, etc.) to Claude with a locked-down read-only tool
 *   surface. Off by default — opt-in via CLI flag. Requires ANTHROPIC_API_KEY
 *   in env.
 * @param {ImportStyle} [opts.importStyle] Defaults to ESM with the
 *   '@socketsecurity/lib/primordials' specifier.
 *
 * @returns {Promise<CodemodResult>}
 */
export async function applyCodemod({
  aiDisambiguate = false,
  apply,
  exported,
  importStyle = {
    kind: 'esm',
    specifier: DEFAULT_PRIMORDIALS_IMPORT_SPECIFIER,
  },
  includeGuessed,
  localPrimordialsPath,
  nullable = new Set(),
  scanDir,
  targetRoot,
  validate = true,
}) {
  const result: {
    filesChanged: number
    rewriteCount: number
    skipped: number
    files: Array<{ file: string; rewrites: number; importAdded: boolean }>
    validationFailed?: boolean
    validationFindings?: readonly ValidationFinding[]
  } = {
    filesChanged: 0,
    rewriteCount: 0,
    skipped: 0,
    files: [],
  }

  // Normalize the primordials root via lib's normalizePath so the
  // containment check is consistent with the rest of the codebase
  // (forward slashes everywhere, including Windows). Without this,
  // a Windows-style `C:\repo\src\primordials` would never `startsWith`
  // a posix-style `C:/repo/src/primordials/array.ts` from the walker.
  const primordialsRoot = localPrimordialsPath
    ? `${normalizePath(path.resolve(localPrimordialsPath))}/`
    : undefined
  // Two-phase apply, when `validate !== false`:
  //   Phase 1 (compute): walk files with apply=false. Each rewriteFile call
  //     computes the new content + returns it WITHOUT writing.
  //   Phase 2 (validate): run cross-batch checks (self-import, inside-root,
  //     unparseable). If anything fails, abort — leave the working tree
  //     pristine. The user sees the report instead of 40 dirty files.
  //   Phase 3 (apply): every plan that survived validation gets written via
  //     atomicWrite. Per-file atomicity + batch-level validation = effectively
  //     transactional.
  //
  // When `validate === false` (caller opts out) OR `apply === false` (caller
  // is in dry-run), we skip the two-phase split and walk inline. Same code
  // path as before; lets the consumer choose speed over safety when they
  // know what they're doing.
  const useTwoPhase = apply && validate !== false
  const plans: PlannedRewrite[] = []
  const reportEntries: typeof result.files = []
  for (const abs of walkDir(scanDir)) {
    // Skip files that ARE the primordials surface — rewriting their
    // `Number.parseInt(...)` to `NumberParseInt(...)` then adding an
    // `import { NumberParseInt } from './number'` produces a
    // self-import when the file IS `primordials/number.ts`. The
    // primordials leaves use local references; they're the source of
    // truth, not consumers of it.
    if (primordialsRoot && normalizePath(abs).startsWith(primordialsRoot)) {
      continue
    }
    const rel = path.relative(targetRoot, abs)
    // Compute pass: when two-phase is on, force `apply: false` so the
    // rewriter computes the new content but doesn't write. We persist
    // ourselves AFTER validation.
    const fileResult = await rewriteFile({
      absPath: abs,
      aiDisambiguate,
      apply: useTwoPhase ? false : apply,
      exported,
      importStyle,
      includeGuessed,
      nullable,
      relPath: rel,
      targetRoot,
    })
    if (fileResult.rewrites > 0) {
      result.filesChanged += 1
      result.rewriteCount += fileResult.rewrites
      reportEntries.push({
        file: rel,
        rewrites: fileResult.rewrites,
        importAdded: fileResult.importAdded,
      })
      if (useTwoPhase && fileResult.newSource !== undefined) {
        plans.push({
          absPath: abs,
          relPath: rel,
          newSource: fileResult.newSource,
        })
      }
    }
    result.skipped += fileResult.skipped
  }

  if (useTwoPhase) {
    const findings = validateRewrites(plans, { primordialsRoot })
    if (findings.length > 0) {
      // Reject the batch. Caller (cli.mts) sees the findings + bails.
      // Working tree stays pristine — that's the whole point of the
      // two-phase split.
      result.validationFailed = true
      result.validationFindings = findings
      return result
    }
    // All checks green — commit the planned writes. Per-file atomic;
    // any individual write failure aborts the rest (leaving partial
    // state, but every file so far is internally consistent).
    for (let i = 0, { length } = plans; i < length; i += 1) {
      const plan = plans[i]!
      atomicWrite(plan.absPath, plan.newSource)
    }
  }
  result.files = reportEntries

  return result
}

// Codemod handles plain JavaScript and TypeScript. For .ts/.mts/.cts
// sources, we type-strip with Node's `module.stripTypeScriptTypes` in
// `mode: 'strip'` — that mode REPLACES type annotations with whitespace,
// preserving the original byte offsets. AST positions from parsing the
// stripped text therefore map 1:1 to the raw source, so rewrites apply
// to the raw text directly and types stay intact in the output.
const REWRITABLE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])
const TS_EXTENSIONS = new Set(['.cts', '.mts', '.ts', '.tsx'])

export function* walkDir(
  dir,
  skipDirs = ['external', 'node_modules', '.cache'],
  skipFiles = [
    'primordials.cjs',
    'primordials.cts',
    'primordials.js',
    'primordials.mjs',
    'primordials.mts',
    'primordials.ts',
  ],
) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.includes(entry) || skipFiles.includes(entry)) {
      continue
    }
    const abs = path.join(dir, entry)
    const stat = statSync(abs)
    if (stat.isDirectory()) {
      yield* walkDir(abs, skipDirs, skipFiles)
    } else if (REWRITABLE_EXTENSIONS.has(path.extname(entry))) {
      yield abs
    }
  }
}

/**
 * Rewrite one file. Returns `{ rewrites, importAdded, skipped }`.
 *
 * Each rewrite is recorded as a `{ start, end, replacement, primordial }`
 * tuple, then applied right-to-left so positions stay valid.
 *
 * Async because the AI-deferred disambiguation pass for ambiguous methods
 * (.test, .then, etc.) calls into the locked-down Claude SDK. Sync codepath
 * when `aiDisambiguate` is false — same behavior as before.
 */
export async function rewriteFile({
  absPath,
  aiDisambiguate,
  apply,
  exported,
  importStyle,
  includeGuessed,
  nullable,
  relPath,
  targetRoot,
}) {
  // Local-name prefix for the inserted destructure. When set, an
  // imported `Foo` is referenced in source as `<prefix>Foo` and the
  // require becomes `const { Foo: <prefix>Foo, … } = require(…)`.
  // Empty string = no aliasing (matches the ESM-default behavior).
  const aliasPrefix = importStyle?.aliasPrefix ?? ''
  const localName = (name: string): string => aliasPrefix + name
  const src = readFileSync(absPath, 'utf8')
  // For TypeScript files, parse a type-stripped copy. `mode: 'strip'`
  // replaces type annotations with whitespace of the same byte length,
  // so AST start/end offsets from the stripped source map 1:1 back to
  // the raw source. We apply rewrites to `src` (raw, with types intact)
  // using positions from the parser's view of `parseSrc` (stripped).
  const ext = path.extname(absPath)
  const isTsFile = TS_EXTENSIONS.has(ext)
  let parseSrc = src
  if (isTsFile) {
    try {
      parseSrc = stripTypeScriptTypes(src, { mode: 'strip' })
    } catch {
      return { rewrites: 0, importAdded: false, skipped: 0 }
    }
  }
  let ast
  try {
    ast = parse(parseSrc, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: false,
      ranges: true,
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
      allowHashBang: true,
    })
  } catch {
    return { rewrites: 0, importAdded: false, skipped: 0 }
  }

  // Repair AST end positions. acorn-wasm's compact_serialize fast-paths
  // a small set of node kinds (Identifier, Literal, ImportDeclaration…)
  // and falls back to `(data >> 32) as u32` for everything else — but
  // for nodes whose `data` field stores a heap pointer or packed child
  // ids (CallExpression, VariableDeclaration, BlockStatement, …) the
  // high 32 bits aren't an end offset, so the emitted `end` is garbage
  // (often 0, sometimes a callee's NodeId, sometimes a stale value
  // bleeding from a sibling node).
  //
  // Until the wasm parser fix lands, repair here: walk depth-first,
  // and for any node with a broken end (end < start, or end < the
  // computed end of its rightmost descendant), substitute the
  // descendant-derived value. The recursion is bounded by AST depth
  // so the cost is linear in node count — same as the rewrite walk
  // we're about to do anyway.
  repairEndPositions(ast)

  // acorn-wasm reports byte offsets, not char offsets. JS string slice
  // is char-indexed, so on sources with multi-byte UTF-8 chars (CJK,
  // emoji, accented Latin), positions silently mis-align and rewrites
  // corrupt the file. Build a byte→char map once, then translate every
  // AST start/end before slicing. ASCII-only sources skip the
  // conversion entirely (the map is identity).
  const byteToChar = buildByteToCharMap(src)
  const toChar = (off: number): number =>
    byteToChar === undefined ? off : (byteToChar[off] ?? off)

  const rewrites = []
  const usedPrimordials = new Set()
  let skipped = 0

  // Sites where the property name is in AMBIGUOUS_PROTOTYPE_METHODS
  // and the receiver-name guess didn't fire. Drained post-walk by
  // an async pass that calls the locked-down Claude disambiguator.
  // Snapshots the byte ranges up-front because the AST is freed
  // when the walk ends.
  /**
   * @type {{
   *   methodName: string
   *   receiverName: string
   *   calleeStart: number
   *   calleeEnd: number
   *   firstArgStart: number
   *   lastArgEnd: number
   *   objectStart: number
   *   objectEnd: number
   *   offset: number
   * }[]}
   */
  const pendingAmbiguous = []

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

  // Drain pending ambiguous sites by deferring to Claude. Sequential
  // to keep API throughput predictable. On a verdict that names a
  // candidate type, append the rewrite using the same shape as the
  // sync path (object, args, closing-paren scan).
  if (aiDisambiguate && pendingAmbiguous.length > 0) {
    const lineStarts = []
    {
      lineStarts.push(0)
      for (let i = 0; i < src.length; i += 1) {
        if (src.charCodeAt(i) === 10) {
          lineStarts.push(i + 1)
        }
      }
    }
    const lineColAt = offset => {
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
    for (const item of pendingAmbiguous) {
      const { line, column } = lineColAt(item.offset)
      const verdict = await disambiguateReceiver({
        aiEnabled: true,
        column,
        filePath: relPath,
        line,
        methodName: item.methodName,
        receiverName: item.receiverName,
        snippet: buildSnippet(src, lineStarts, line),
        targetRoot,
      })
      if (!verdict.type) {
        skipped += 1
        continue
      }
      const expectedAi = prototypePrimordialName(verdict.type, item.methodName)
      if (!exported.has(expectedAi)) {
        continue
      }
      // Apply the same rewrite shape as the sync path.
      const objSrc = src.slice(item.objectStart, item.objectEnd)
      const argsSrc =
        item.firstArgStart >= 0
          ? src.slice(item.firstArgStart, item.lastArgEnd)
          : ''
      const callEnd = findClosingParen(src, item.lastArgEnd)
      if (callEnd < 0) {
        continue
      }
      const aiNeedsBang = isTsFile && nullable && nullable.has(expectedAi)
      const fnNameAi = localName(expectedAi) + (aiNeedsBang ? '!' : '')
      const replacementAi = argsSrc
        ? `${fnNameAi}(${objSrc}, ${argsSrc})`
        : `${fnNameAi}(${objSrc})`
      rewrites.push({
        start: item.calleeStart,
        end: callEnd,
        replacement: replacementAi,
      })
      usedPrimordials.add(expectedAi)
    }
  }

  if (rewrites.length === 0) {
    return { rewrites: 0, importAdded: false, skipped }
  }

  // Dedupe rewrites by [start, end] span. acorn-wasm's compact_serialize
  // can emit the same node object multiple times in the JSON tree
  // (children pointed at by sequential indices and by heap structs are
  // the same logical node), so a single physical Buffer.from(…) call
  // can show up 4× in the walk. Applying the same rewrite span 4×
  // works the first time (span [a, b] replaced once) but the 2nd, 3rd,
  // 4th iterations re-apply [a, b] in the already-rewritten string,
  // eating bytes past the new identifier and corrupting the file.
  // Dedupe before applying, then sort back-to-front.
  const seen = new Set<string>()
  const deduped: typeof rewrites = []
  for (const r of rewrites) {
    const key = `${r.start}:${r.end}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(r)
  }
  deduped.sort((a, b) => b.start - a.start)
  let out = src
  for (const r of deduped) {
    out = out.slice(0, r.start) + r.replacement + out.slice(r.end)
  }

  // Add the import/require block. Find the last existing import (or
  // require, in CJS mode) and insert after it; if none, prepend.
  let newSource = out
  let importAdded = false
  if (importStyle.splitByLeaf) {
    // Group identifiers by leaf, emit one import per leaf with the
    // leaf-resolved specifier.
    const { exportToLeaf, leafSpecifier } = importStyle.splitByLeaf
    const byLeaf = new Map()
    const idents = [...usedPrimordials].sort()
    for (const id of idents) {
      const leaf = exportToLeaf.get(id)
      if (!leaf) {
        // A used primordial not in the leaf map means the surface
        // catalog and the leaf map drifted — skip it (the codemod
        // already filtered to `exported`, so this is an internal-
        // consistency error if it fires).
        continue
      }
      let arr = byLeaf.get(leaf)
      if (!arr) {
        arr = []
        byLeaf.set(leaf, arr)
      }
      arr.push(id)
    }
    // Sort leaves so emitted blocks are deterministic.
    for (const leaf of [...byLeaf.keys()].sort()) {
      const leafIdents = byLeaf.get(leaf).sort()
      const leafSpec = leafSpecifier(absPath, leaf)
      const out2 = ensureImports(newSource, leafIdents, {
        kind: importStyle.kind,
        specifier: leafSpec,
        aliasPrefix,
      })
      newSource = out2.newSource
      if (out2.importAdded) {
        importAdded = true
      }
    }
  } else {
    const resolvedSpecifier =
      typeof importStyle.specifier === 'function'
        ? importStyle.specifier(absPath)
        : importStyle.specifier
    const result2 = ensureImports(newSource, [...usedPrimordials].sort(), {
      kind: importStyle.kind,
      specifier: resolvedSpecifier,
      aliasPrefix,
    })
    newSource = result2.newSource
    importAdded = result2.importAdded
  }

  // Only return newSource when it actually changed AND we have rewrites
  // applied. Callers in batch-validation mode read this to plan writes
  // after running cross-file checks (cycle detection, self-import veto)
  // without already having dirtied the working tree.
  const changed = newSource !== src
  if (apply && changed) {
    atomicWrite(absPath, newSource)
  }

  return {
    rewrites: rewrites.length,
    importAdded,
    skipped,
    newSource: changed ? newSource : undefined,
  }
}

/**
 * Atomic write: write to `<path>.tmp-<pid>-<rand>`, fsync, rename. Guarantees
 * concurrent readers see either the old content or the new — never the partial
 * write that triggers `Unexpected token` in vitest immediately after build.
 *
 * **Why:** Past incident — socket-lib CI macOS + ubuntu flake where
 * `dist/external/normalize-package-data.js` reported `SyntaxError: Unexpected
 * token '{'` at col 34 of line 4. Root cause: the transform-primordials codemod
 * `writeFileSync`'d every bundled file in `dist/external/` unconditionally;
 * test workers reading the same file mid-write saw a half-flushed buffer. Now
 * we (1) skip the write when content is unchanged (handled by the `newSource
 * !== src` guard at the call site) and (2) rename-in atomically when we do
 * write.
 */
export function atomicWrite(absPath: string, content: string): void {
  const tmpPath = `${absPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`
  let fd: number | undefined
  try {
    fd = openSync(tmpPath, 'w', 0o644)
    writeSync(fd, content)
    fsyncSync(fd)
  } catch (e) {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // ignore close error
      }
    }
    try {
      unlinkSync(tmpPath)
    } catch {
      // ignore unlink error
    }
    throw e
  }
  closeSync(fd)
  renameSync(tmpPath, absPath)
}

/**
 * Scan `src` forward from `from` (exclusive) until we hit the matching `)` for
 * an open call. Returns the char index AFTER the `)`, or -1 if no `)` is found
 * before EOF. Tolerates whitespace, line comments, block comments, and trailing
 * commas. Doesn't try to handle arbitrarily-nested expressions — callers pass
 * `from` set to the known end of the last argument, so we're scanning within
 * the remaining `<ws>* (,)? <ws>* )` slice.
 */
export function findClosingParen(src: string, from: number): number {
  let i = from
  while (i < src.length) {
    const c = src.charCodeAt(i)
    // Whitespace.
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
      i++
      continue
    }
    // Line comment.
    if (c === 0x2f && src.charCodeAt(i + 1) === 0x2f) {
      while (i < src.length && src.charCodeAt(i) !== 0x0a) {
        i++
      }
      continue
    }
    // Block comment.
    if (c === 0x2f && src.charCodeAt(i + 1) === 0x2a) {
      i += 2
      while (i < src.length - 1) {
        if (src.charCodeAt(i) === 0x2a && src.charCodeAt(i + 1) === 0x2f) {
          i += 2
          break
        }
        i++
      }
      continue
    }
    // Trailing comma.
    if (c === 0x2c) {
      i++
      continue
    }
    if (c === 0x29) {
      // `)` — return the position right after it.
      return i + 1
    }
    // Anything else means we're not at the call's end (probably the
    // last-arg end was wrong). Bail.
    return -1
  }
  return -1
}

/**
 * Repair AST end positions in place. Walks depth-first; for each node whose
 * `end` is missing or smaller than the computed end of its children, replaces
 * it with the maximum end seen across descendants.
 *
 * Workaround for acorn-wasm's compact_serialize emitting `0` (or other stale
 * data-field bits) as `end` for node kinds whose data field doesn't pack the
 * end position in its high 32 bits. Inner expression nodes (Identifier,
 * Literal, MemberExpression after the fix in this file's earlier session, etc.)
 * have correct ends; this function propagates those upward.
 *
 * Returns the (possibly repaired) end of `node` so parents can fold it into
 * their own computation.
 */
export function repairEndPositions(node) {
  if (!node || typeof node !== 'object') {
    return 0
  }
  if (Array.isArray(node)) {
    let m = 0
    for (const child of node) {
      const e = repairEndPositions(child)
      if (e > m) {
        m = e
      }
    }
    return m
  }
  if (typeof node.type !== 'string') {
    // Not an AST node (e.g. a literal value, a token list). Recurse
    // through nested objects/arrays so we still reach AST descendants.
    let m = 0
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key.startsWith('_')) {
        continue
      }
      const e = repairEndPositions(node[key])
      if (e > m) {
        m = e
      }
    }
    return m
  }

  let maxChildEnd = 0
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'range' ||
      key === 'start' ||
      key === 'end' ||
      key.startsWith('_')
    ) {
      continue
    }
    const e = repairEndPositions(node[key])
    if (e > maxChildEnd) {
      maxChildEnd = e
    }
  }

  // If the reported end is sane (>= start AND >= max-child-end), keep it.
  // Otherwise replace with the larger of (start, maxChildEnd).
  const reportedEnd = typeof node.end === 'number' ? node.end : 0
  const start = typeof node.start === 'number' ? node.start : 0
  const correctedEnd = Math.max(start, maxChildEnd)
  if (reportedEnd < correctedEnd) {
    node.end = correctedEnd
    return correctedEnd
  }
  return reportedEnd
}

/**
 * Build a sparse byte-offset → char-offset map for `src`. Returns `null` when
 * the source is pure ASCII (every byte == every char) so the caller can
 * fast-path identity translation.
 *
 * The returned array has one entry per UTF-8 byte position: arr[B] gives the
 * char index that byte starts. Bytes inside a multi-byte codepoint share the
 * char index of the codepoint's lead byte.
 */
export function buildByteToCharMap(src: string): number[] | undefined {
  // Scan: any code unit ≥ 0x80 implies a multi-byte UTF-8 representation.
  let hasNonAscii = false
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) >= 0x80) {
      hasNonAscii = true
      break
    }
  }
  if (!hasNonAscii) {
    return undefined
  }
  const buf = Buffer.from(src, 'utf8')
  const map = Array.from({ length: buf.length + 1 })
  let charIdx = 0
  let byteIdx = 0
  // Walk char-by-char; for each char compute its UTF-8 byte length
  // and stamp the char index into every byte slot it spans.
  for (let i = 0; i < src.length; i++) {
    const code = src.codePointAt(i)
    let byteLen
    if (code < 0x80) {
      byteLen = 1
    } else if (code < 0x800) {
      byteLen = 2
    } else if (code < 0x10000) {
      byteLen = 3
    } else {
      byteLen = 4
      // Surrogate pair: codePointAt returned the full codepoint at the
      // first surrogate, so skip the trailing surrogate in the next
      // iteration.
      i++
    }
    for (let j = 0; j < byteLen; j++) {
      map[byteIdx + j] = charIdx
    }
    byteIdx += byteLen
    charIdx += byteLen === 4 ? 2 : 1
  }
  // Sentinel for end-of-source positions (acorn-wasm sometimes reports
  // an end == buf.length).
  map[byteIdx] = charIdx
  return map
}

/**
 * Walk an AST manually since acorn-wasm's `simple` walker can't pass structured
 * visitors that we want to share with codemod. This walker visits every node
 * depth-first.
 */
export function walkAst(node, visit) {
  if (!node || typeof node !== 'object') {
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      walkAst(child, visit)
    }
    return
  }
  if (typeof node.type === 'string') {
    visit(node)
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key.startsWith('_')) {
      continue
    }
    walkAst(node[key], visit)
  }
}

/**
 * Escape a string for use inside a regex character class / pattern.
 */
export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Insert (or merge into) the primordials import statement.
 *
 * In ESM mode emits `import { X, Y } from '<specifier>'`. In CJS mode emits
 * `const { X, Y } = require('<specifier>')`. If a matching import (same shape,
 * same specifier) already exists in `src`, the new identifiers are merged into
 * its destructure list and we re-sort the keys; otherwise the new statement is
 * inserted after the last existing import/require, or prepended if neither
 * exists.
 *
 * Returns the rewritten source and a boolean indicating whether anything was
 * added/changed (vs already-present-and-complete).
 */
export function ensureImports(src, identifiers, importStyle) {
  const { kind, specifier } = importStyle
  const aliasPrefix: string = importStyle.aliasPrefix ?? ''
  // Render one identifier as a destructure entry: `Foo` if no alias,
  // `Foo: <prefix>Foo` if aliased.
  const renderEntry = (name: string): string =>
    aliasPrefix ? `${name}: ${aliasPrefix}${name}` : name
  // Parse a destructure entry back into the original imported name.
  // Handles both `Foo` and `Foo: Local` forms.
  const parseEntry = (entry: string): string => {
    const trimmed = entry.trim()
    const colonIdx = trimmed.indexOf(':')
    return colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx).trim()
  }
  const escSpec = escapeRegex(specifier)
  // Trailing `;?` is matched without leading `\s*` so the regex stops
  // at the optional semicolon — anything after (newline, the next
  // import) stays in `src` and isn't clobbered by the replacement.
  const existingRe =
    kind === 'esm'
      ? new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escSpec}['"];?`)
      : new RegExp(
          `(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*require\\(\\s*['"]${escSpec}['"]\\s*\\);?`,
        )
  const existing = src.match(existingRe)
  if (existing) {
    const have = new Set(existing[1].split(',').map(parseEntry).filter(Boolean))
    let addedAny = false
    for (const id of identifiers) {
      if (!have.has(id)) {
        have.add(id)
        addedAny = true
      }
    }
    if (!addedAny) {
      return { newSource: src, importAdded: false }
    }
    const merged = [...have].sort().map(renderEntry).join(', ')
    const replacement =
      kind === 'esm'
        ? `import { ${merged} } from '${specifier}'`
        : `const { ${merged} } = require('${specifier}')`
    return {
      newSource: src.replace(existingRe, replacement),
      importAdded: true,
    }
  }

  // No matching import — insert after the last existing import-or-require.
  // We match either ESM imports or CJS require-shaped declarations so the
  // inserted block lands alongside the existing module-loading prologue.
  const lastEnd = findInsertionPoint(src)
  const list = identifiers.map(renderEntry).join(', ')
  const newStmt =
    kind === 'esm'
      ? `import { ${list} } from '${specifier}'\n`
      : `const { ${list} } = require('${specifier}')\n`
  if (lastEnd === 0) {
    return { newSource: newStmt + src, importAdded: true }
  }
  return {
    newSource: src.slice(0, lastEnd) + '\n' + newStmt + src.slice(lastEnd),
    importAdded: true,
  }
}

/**
 * Find the byte offset right after the last import / require statement at
 * module scope. Returns the byte offset right after the leading file-level
 * JSDoc / shebang block when no import/require is found, so callers prepend
 * BELOW the `@fileoverview` block instead of clobbering it.
 */
export function findInsertionPoint(src) {
  // ESM: `import ... from '...'`.
  const importRe = /^import\s.+?from\s+['"][^'"]+['"]\s*;?\s*$/gm
  // CJS: `const|let|var ... = require('...')`. We don't try to handle
  // every degenerate form — the goal is to land near the existing
  // top-of-file require block, not perfectly classify every statement.
  const requireRe =
    /^(?:const|let|var)\s+[^=]+?=\s*require\(\s*['"][^'"]+['"]\s*\)\s*;?\s*$/gm
  let lastEnd = 0
  for (const m of src.matchAll(importRe)) {
    const end = m.index + m[0].length
    if (end > lastEnd) {
      lastEnd = end
    }
  }
  for (const m of src.matchAll(requireRe)) {
    const end = m.index + m[0].length
    if (end > lastEnd) {
      lastEnd = end
    }
  }
  if (lastEnd > 0) {
    return lastEnd
  }
  // No imports/requires — skip past leading shebang + leading JSDoc /
  // line-comment block so the inserted import lands BELOW the
  // `@fileoverview` doc, not above it.
  let pos = 0
  // Shebang line.
  if (src.startsWith('#!')) {
    const nl = src.indexOf('\n', pos)
    pos = nl === -1 ? src.length : nl + 1
  }
  // Leading whitespace.
  while (pos < src.length && /\s/.test(src[pos]!)) {
    pos++
  }
  // Leading block comment (`/** … */` or `/* … */`).
  if (src.startsWith('/*', pos)) {
    const close = src.indexOf('*/', pos)
    if (close !== -1) {
      pos = close + 2
      // Consume the trailing newline so the inserted import goes on a
      // fresh line.
      if (src[pos] === '\n') {
        pos++
      }
    } else {
      // Unterminated — fall back to prepend.
      pos = 0
    }
  } else if (src.startsWith('//', pos)) {
    // Leading line-comment block.
    while (src.startsWith('//', pos)) {
      const nl = src.indexOf('\n', pos)
      pos = nl === -1 ? src.length : nl + 1
    }
  } else {
    // No leading comment — prepend at top.
    pos = 0
  }
  return pos
}
