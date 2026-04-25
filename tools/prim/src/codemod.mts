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
  TRACKED_GLOBALS,
  UNAMBIGUOUS_PROTOTYPE_METHODS,
  ctorPrimordialName,
  guessReceiverType,
  prototypePrimordialName,
  staticPrimordialName,
} from './globals.mts'

const PRIMORDIALS_IMPORT_SPECIFIER = '@socketsecurity/lib/primordials'

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
 * @returns {Promise<CodemodResult>}
 */
export async function applyCodemod({
  targetRoot,
  scanDir,
  exported,
  apply,
  includeGuessed,
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
function rewriteFile({ absPath, relPath, exported, includeGuessed, apply }) {
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
        start: callee.start,
        end: callee.end,
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
        start: node.callee.start,
        end: node.callee.end,
        replacement: expected,
      })
      usedPrimordials.add(expected)
      return
    }

    // Prototype: receiver disambiguation.
    let receiverType = UNAMBIGUOUS_PROTOTYPE_METHODS.get(property.name)
    if (!receiverType) {
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
    const objSrc = src.slice(object.start, object.end)
    const argsSrc =
      node.arguments.length > 0
        ? src.slice(node.arguments[0].start, node.arguments.at(-1).end)
        : ''
    const replacement = argsSrc
      ? `${expected}(${objSrc}, ${argsSrc})`
      : `${expected}(${objSrc})`
    rewrites.push({
      start: node.start,
      end: node.end,
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

  // Add the import block. Find the last existing import statement and
  // insert after it; if none, prepend.
  const { newSource, importAdded } = ensureImports(
    out,
    [...usedPrimordials].sort(),
  )

  if (apply) {
    writeFileSync(absPath, newSource)
  }

  return { rewrites: rewrites.length, importAdded, skipped }
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
 * Insert `import { … } from '@socketsecurity/lib/primordials'` after
 * the last existing import. If an import from the same specifier
 * already exists, merge into it. Returns the new source and whether
 * the import was added (vs already-present-and-complete).
 */
function ensureImports(src, identifiers) {
  // Detect existing import from the primordials specifier.
  const existingRe = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${PRIMORDIALS_IMPORT_SPECIFIER}['"]`,
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
    const newImport = `import { ${merged} } from '${PRIMORDIALS_IMPORT_SPECIFIER}'`
    return {
      newSource: src.replace(existingRe, newImport),
      importAdded: true,
    }
  }

  // No existing import — insert after last import statement.
  const importLineRe = /^import\s.+?from\s+['"][^'"]+['"]\s*;?\s*$/gm
  let lastEnd = 0
  for (const m of src.matchAll(importLineRe)) {
    lastEnd = m.index + m[0].length
  }
  const newImport = `import { ${identifiers.join(', ')} } from '${PRIMORDIALS_IMPORT_SPECIFIER}'\n`
  if (lastEnd === 0) {
    // No imports at all — prepend.
    return { newSource: newImport + src, importAdded: true }
  }
  return {
    newSource: src.slice(0, lastEnd) + '\n' + newImport + src.slice(lastEnd),
    importAdded: true,
  }
}
