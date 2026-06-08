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

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'

import { parse } from 'acorn'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import type { PlannedRewrite, ValidationFinding } from './validate.mts'
import { validateRewrites } from './validate.mts'

import type { PendingAmbiguous, Rewrite } from './ai-disambiguate-pass.mts'
import { drainPendingAmbiguous } from './ai-disambiguate-pass.mts'
import { collectRewrites } from './collect-rewrites.mts'
import { applyPrimordialsImports } from './import-emit.mts'
import {
  atomicWrite,
  buildByteToCharMap,
  repairEndPositions,
} from './source-text.mts'

const DEFAULT_PRIMORDIALS_IMPORT_SPECIFIER = '@socketsecurity/lib/primordials'

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
    // Per-file planned rewrites, kept across the run regardless of
    // validate / apply mode. The CLI's `--diff` flag reads this to render
    // unified diffs in dry-run mode without re-walking the tree.
    plans: PlannedRewrite[]
    validationFailed?: boolean | undefined
    validationFindings?: readonly ValidationFinding[] | undefined
  } = {
    filesChanged: 0,
    rewriteCount: 0,
    skipped: 0,
    files: [],
    plans: [],
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
  // Plans live on `result.plans` so the CLI can render diffs after the
  // codemod returns. The two-phase apply still reads from this same list
  // — single source of truth.
  const plans = result.plans
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
      if (fileResult.newSource !== undefined) {
        // Always collect plans, not just in two-phase mode. The CLI's
        // `--diff` flag reads them from `result.plans` to render the
        // unified diff in dry-run mode without re-walking the tree.
        // Memory cost is bounded: each plan carries the file's
        // full new content, which we already computed.
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

  const rewrites: Rewrite[] = []
  const usedPrimordials = new Set<string>()

  // Sites where the property name is in AMBIGUOUS_PROTOTYPE_METHODS
  // and the receiver-name guess didn't fire. Drained post-walk by
  // an async pass that calls the locked-down Claude disambiguator.
  // Snapshots the byte ranges up-front because the AST is freed
  // when the walk ends.
  const pendingAmbiguous: PendingAmbiguous[] = []

  // Sync classification pass: walk the AST and record every applicable
  // rewrite span. See collect-rewrites.mts for the per-node logic. Ambiguous
  // sites that need the AI fallback are pushed onto `pendingAmbiguous`.
  let { skipped } = collectRewrites({
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
  })

  // Drain pending ambiguous sites by deferring to Claude. Off unless
  // --ai-disambiguate is on. See ai-disambiguate-pass.mts for the per-site
  // verdict + rewrite-append logic; it shares the sync path's rewrite shape.
  if (aiDisambiguate && pendingAmbiguous.length > 0) {
    const drained = await drainPendingAmbiguous({
      exported,
      isTsFile,
      localName,
      nullable,
      pendingAmbiguous,
      relPath,
      rewrites,
      src,
      targetRoot,
      usedPrimordials,
    })
    skipped += drained.skipped
  }

  if (rewrites.length === 0) {
    return { rewrites: 0, importAdded: false, skipped }
  }

  // Dedupe + apply the collected rewrites back-to-front, then emit the
  // primordials import / require block for every primordial introduced.
  // See applyPrimordialsImports in source-text.mts for the dedupe rationale.
  const { importAdded, newSource } = applyPrimordialsImports(
    src,
    rewrites,
    usedPrimordials,
    importStyle,
    absPath,
  )

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
