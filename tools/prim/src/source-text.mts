/**
 * @file Source-text mechanics for the primordials codemod. Pure functions over
 *   raw source strings and parsed ASTs: atomic file writes, closing-paren
 *   scanning, acorn-wasm end-position repair, byte→char offset mapping, and AST
 *   walking. The codemod orchestration in `codemod.mts` consumes these; keeping
 *   them here isolates the byte-level details from the rewrite-planning logic.
 *   Import/require block emission lives in `import-emit.mts`.
 */

import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'

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
    } else if (code < 0x8_00) {
      byteLen = 2
    } else if (code < 0x1_00_00) {
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
