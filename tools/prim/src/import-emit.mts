/**
 * @file Primordials import/require emission for the codemod. Pure functions
 *   over source strings: locate the insertion point below leading
 *   shebang/JSDoc, merge-or-insert the `import { … } from '<specifier>'` (ESM)
 *   or `const { … } = require('<specifier>')` (CJS) block, and apply a batch of
 *   collected rewrite spans before emitting that block. Split out from
 *   `source-text.mts` so the AST/byte mechanics and the import-block authoring
 *   stay in separate domains.
 */

/**
 * Apply collected rewrites to `src`, then emit the primordials import block.
 *
 * Dedupes rewrite spans by `[start, end]` (acorn-wasm's compact_serialize can
 * surface the same node multiple times in the JSON tree), sorts them
 * back-to-front so applied positions stay valid, splices each replacement into
 * the source, and finally inserts (or merges into) the import / require block
 * for every primordial introduced.
 *
 * When `importStyle.splitByLeaf` is set, one import is emitted per leaf with
 * the leaf-resolved specifier; otherwise a single barrel import is emitted with
 * the resolved (string or per-file function) specifier.
 *
 * Returns the rewritten source plus whether an import was added.
 */
export function applyPrimordialsImports(
  src: string,
  rewrites: Array<{ start: number; end: number; replacement: string }>,
  usedPrimordials: Set<string>,
  importStyle,
  absPath: string,
): { newSource: string; importAdded: boolean } {
  const aliasPrefix = importStyle?.aliasPrefix ?? ''
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
  for (let i = 0, { length } = rewrites; i < length; i += 1) {
    const r = rewrites[i]!
    const key = `${r.start}:${r.end}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(r)
  }
  deduped.sort((a, b) => b.start - a.start)
  let out = src
  for (let i = 0, { length } = deduped; i < length; i += 1) {
    const r = deduped[i]!
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
    const idents = [...usedPrimordials].toSorted()
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
    for (const leaf of [...byLeaf.keys()].toSorted()) {
      const leafIdents = byLeaf.get(leaf).toSorted()
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
    const result2 = ensureImports(newSource, [...usedPrimordials].toSorted(), {
      kind: importStyle.kind,
      specifier: resolvedSpecifier,
      aliasPrefix,
    })
    newSource = result2.newSource
    importAdded = result2.importAdded
  }
  return { newSource, importAdded }
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
    const merged = [...have].toSorted().map(renderEntry).join(', ')
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
 * Escape a string for use inside a regex character class / pattern.
 */
export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
