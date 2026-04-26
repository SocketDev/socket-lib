/**
 * @fileoverview Codemod: rewrite call sites to use primordials.
 *
 * Strategy: collect all rewrite spans (start/end positions in source)
 * per file, then apply them back-to-front so earlier positions don't
 * shift after replacement. After rewriting, prepend an import block
 * for every primordial introduced.
 *
 * What gets rewritten:
 *   - `Object.keys(x)` → `ObjectKeys(x)` (static method)
 *   - `Math.ceil(n)`   → `MathCeil(n)`  (static method)
 *   - `JSON.parse(s)`  → `JSONParse(s)` (static method)
 *   - `new TypeError(msg)` → `new TypeErrorCtor(msg)` (constructor)
 *   - With `--include-guessed` or unambiguous-method match:
 *     `arr.map(fn)` → `ArrayPrototypeMap(arr, fn)` (prototype method)
 *
 * What is NOT rewritten:
 *   - Patterns whose primordial isn't exported yet — they show up in
 *     `prim gaps` and need a surface addition first.
 *   - Property-only access (`Symbol.iterator`) — out of scope; it's a
 *     constant reference, not a call.
 *
 * Default mode is dry-run. `--apply` actually writes the files.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse } from 'acorn-wasm'

import {
  NODE_MODULE_STATIC_METHODS,
  TRACKED_GLOBALS,
  UNAMBIGUOUS_PROTOTYPE_METHODS,
  ctorPrimordialName,
  guessReceiverType,
  prototypePrimordialName,
  staticPrimordialName,
} from './globals.mts'

const DEFAULT_PRIMORDIALS_IMPORT_SPECIFIER = '@socketsecurity/lib/primordials'

/**
 * Output format for the inserted primordials import:
 *   { kind: 'esm' }: emits `import { X, Y } from '<specifier>'`. Default;
 *     used when the target is ESM source code.
 *   { kind: 'cjs' }: emits `const { X, Y } = require('<specifier>')`.
 *     Used when the target is CJS bundled output (dist/external/*.js).
 *
 * `specifier` is either a static string or a `(absFilePath) => string`
 * function. The function form lets callers compute a per-file relative
 * path to the primordials module — e.g.
 *   absFile === '.../dist/external/tar-fs.js' → '../primordials.js'
 *   absFile === '.../dist/external/@npmcli/x/y.js' → '../../../primordials.js'
 *
 * @typedef {{ kind: 'esm' | 'cjs', specifier: string | ((absFile: string) => string) }} ImportStyle
 */

/**
 * @typedef {Object} CodemodResult
 * @property {number} filesChanged
 * @property {number} rewriteCount
 * @property {number} skipped         Rewrites declined (e.g. guessed-receiver without --include-guessed).
 * @property {Array<{ file: string; rewrites: number; importAdded: boolean }>} files
 */

/**
 * @param {Object} opts
 * @param {string} opts.targetRoot
 * @param {string} opts.scanDir
 * @param {Set<string>} opts.exported
 * @param {boolean} opts.apply
 * @param {boolean} opts.includeGuessed
 * @param {ImportStyle} [opts.importStyle] Defaults to ESM with the
 *   '@socketsecurity/lib/primordials' specifier.
 * @returns {Promise<CodemodResult>}
 */
export async function applyCodemod({
  targetRoot,
  scanDir,
  exported,
  apply,
  includeGuessed,
  importStyle = {
    kind: 'esm',
    specifier: DEFAULT_PRIMORDIALS_IMPORT_SPECIFIER,
  },
}) {
  const result = {
    filesChanged: 0,
    rewriteCount: 0,
    skipped: 0,
    files: [],
  }

  for (const abs of walkDir(scanDir)) {
    const rel = path.relative(targetRoot, abs)
    const fileResult = rewriteFile({
      absPath: abs,
      relPath: rel,
      exported,
      includeGuessed,
      apply,
      importStyle,
    })
    if (fileResult.rewrites > 0) {
      result.filesChanged += 1
      result.rewriteCount += fileResult.rewrites
      result.files.push({
        file: rel,
        rewrites: fileResult.rewrites,
        importAdded: fileResult.importAdded,
      })
    }
    result.skipped += fileResult.skipped
  }

  return result
}

// Codemod only handles plain JavaScript. Rewriting TypeScript would
// require source-mapping between stripped-types and original byte
// offsets — out of scope. The audit (`prim audit`) does walk TS files,
// so users can see migration candidates in source even if the codemod
// can't auto-rewrite them yet.
const REWRITABLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx'])

function* walkDir(
  dir,
  skipDirs = ['external', 'node_modules', '.cache'],
  skipFiles = ['primordials.js', 'primordials.mjs', 'primordials.cjs'],
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
 */
function rewriteFile({
  absPath,
  relPath,
  exported,
  includeGuessed,
  apply,
  importStyle,
}) {
  const src = readFileSync(absPath, 'utf8')
  let ast
  try {
    ast = parse(src, {
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

  // acorn-wasm reports byte offsets, not char offsets. JS string slice
  // is char-indexed, so on sources with multi-byte UTF-8 chars (CJK,
  // emoji, accented Latin), positions silently mis-align and rewrites
  // corrupt the file. Build a byte→char map once, then translate every
  // AST start/end before slicing. ASCII-only sources skip the
  // conversion entirely (the map is identity).
  const byteToChar = buildByteToCharMap(src)
  const toChar = (off: number): number =>
    byteToChar === null ? off : (byteToChar[off] ?? off)

  const rewrites = []
  const usedPrimordials = new Set()
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
      // Replace `Foo` (the identifier) with `Ctor`.
      rewrites.push({
        start: toChar(callee.start),
        end: toChar(callee.end),
        replacement: ctor,
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
      const expected = staticPrimordialName(object.name, property.name)
      if (!exported.has(expected)) {
        return
      }
      // Replace `Foo.bar` (the whole MemberExpression callee) with the
      // primordial name. Args list stays intact.
      rewrites.push({
        start: toChar(node.callee.start),
        end: toChar(node.callee.end),
        replacement: expected,
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
    const expected = prototypePrimordialName(receiverType, property.name)
    if (!exported.has(expected)) {
      return
    }
    // Rewrite `obj.method(args)` → `Primordial(obj, args)`.
    // We need: replace from start of `node.callee` to end of `node` with
    // `Primordial(<obj source>, <args source>)`.
    const objSrc = src.slice(toChar(object.start), toChar(object.end))
    const argsSrc =
      node.arguments.length > 0
        ? src.slice(
            toChar(node.arguments[0].start),
            toChar(node.arguments.at(-1).end),
          )
        : ''
    const replacement = argsSrc
      ? `${expected}(${objSrc}, ${argsSrc})`
      : `${expected}(${objSrc})`
    rewrites.push({
      start: toChar(node.start),
      end: toChar(node.end),
      replacement,
    })
    usedPrimordials.add(expected)
  })

  if (rewrites.length === 0) {
    return { rewrites: 0, importAdded: false, skipped }
  }

  // Apply rewrites back-to-front to preserve earlier positions.
  rewrites.sort((a, b) => b.start - a.start)
  let out = src
  for (const r of rewrites) {
    out = out.slice(0, r.start) + r.replacement + out.slice(r.end)
  }

  // Add the import/require block. Find the last existing import (or
  // require, in CJS mode) and insert after it; if none, prepend.
  const resolvedSpecifier =
    typeof importStyle.specifier === 'function'
      ? importStyle.specifier(absPath)
      : importStyle.specifier
  const { newSource, importAdded } = ensureImports(
    out,
    [...usedPrimordials].sort(),
    { kind: importStyle.kind, specifier: resolvedSpecifier },
  )

  if (apply) {
    writeFileSync(absPath, newSource)
  }

  return { rewrites: rewrites.length, importAdded, skipped }
}

/**
 * Build a sparse byte-offset → char-offset map for `src`. Returns
 * `null` when the source is pure ASCII (every byte == every char) so
 * the caller can fast-path identity translation.
 *
 * The returned array has one entry per UTF-8 byte position: arr[B]
 * gives the char index that byte starts. Bytes inside a multi-byte
 * codepoint share the char index of the codepoint's lead byte.
 */
function buildByteToCharMap(src: string): number[] | null {
  // Scan: any code unit ≥ 0x80 implies a multi-byte UTF-8 representation.
  let hasNonAscii = false
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) >= 0x80) {
      hasNonAscii = true
      break
    }
  }
  if (!hasNonAscii) {
    return null
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
 * Walk an AST manually since acorn-wasm's `simple` walker can't pass
 * structured visitors that we want to share with codemod. This walker
 * visits every node depth-first.
 */
function walkAst(node, visit) {
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
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Insert (or merge into) the primordials import statement.
 *
 * In ESM mode emits `import { X, Y } from '<specifier>'`. In CJS mode
 * emits `const { X, Y } = require('<specifier>')`. If a matching import
 * (same shape, same specifier) already exists in `src`, the new
 * identifiers are merged into its destructure list and we re-sort the
 * keys; otherwise the new statement is inserted after the last existing
 * import/require, or prepended if neither exists.
 *
 * Returns the rewritten source and a boolean indicating whether anything
 * was added/changed (vs already-present-and-complete).
 */
function ensureImports(src, identifiers, importStyle) {
  const { kind, specifier } = importStyle
  const escSpec = escapeRegex(specifier)
  const existingRe =
    kind === 'esm'
      ? new RegExp(
          `import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escSpec}['"]\\s*;?`,
        )
      : new RegExp(
          `(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*require\\(\\s*['"]${escSpec}['"]\\s*\\)\\s*;?`,
        )
  const existing = src.match(existingRe)
  if (existing) {
    const have = new Set(
      existing[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    )
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
    const merged = [...have].sort().join(', ')
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
  const list = identifiers.join(', ')
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
 * Find the byte offset right after the last import / require statement
 * at module scope. Returns 0 if neither is found, so callers can prepend.
 */
function findInsertionPoint(src) {
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
  return lastEnd
}
