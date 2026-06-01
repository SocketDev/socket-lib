/**
 * @file AI-deferred disambiguation drain pass for the codemod. After the sync
 *   AST walk collects ambiguous-method call sites (`.test`, `.then`, `.exec`,
 *   etc.) whose receiver couldn't be guessed statically, this pass consults the
 *   locked-down Claude disambiguator per site and appends the surviving
 *   rewrites. Split out from `codemod.mts` so the Claude-SDK-touching async
 *   phase stays in its own domain. Off by default — only reached when
 *   `--ai-disambiguate` is on.
 */

import { buildSnippet, disambiguateReceiver } from './disambiguate.mts'
import { prototypePrimordialName } from './globals.mts'
import { findClosingParen } from './source-text.mts'

/**
 * One ambiguous call site captured during the sync walk. Byte ranges are
 * snapshotted up-front because the AST is freed when the walk ends.
 */
export interface PendingAmbiguous {
  methodName: string
  receiverName: string
  calleeStart: number
  calleeEnd: number
  firstArgStart: number
  lastArgEnd: number
  objectStart: number
  objectEnd: number
  offset: number
}

/**
 * One rewrite span: replace `[start, end)` in the source with `replacement`.
 */
export interface Rewrite {
  start: number
  end: number
  replacement: string
}

/**
 * Drain pending ambiguous sites by deferring to Claude. Sequential to keep API
 * throughput predictable. On a verdict that names a candidate type, append the
 * rewrite using the same shape as the sync path (object, args, closing-paren
 * scan), recording the introduced primordial in `usedPrimordials`.
 *
 * Pushes surviving rewrites into `rewrites` and returns how many sites were
 * skipped (no verdict) so the caller can fold the count into its own total.
 */
export async function drainPendingAmbiguous(options: {
  src: string
  relPath: string
  targetRoot: string
  pendingAmbiguous: PendingAmbiguous[]
  exported: Set<string>
  isTsFile: boolean
  nullable: Set<string> | undefined
  localName: (name: string) => string
  rewrites: Rewrite[]
  usedPrimordials: Set<string>
}): Promise<{ skipped: number }> {
  const {
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
  } = options
  let skipped = 0
  const lineStarts: number[] = []
  lineStarts.push(0)
  for (let i = 0; i < src.length; i += 1) {
    if (src.charCodeAt(i) === 10) {
      lineStarts.push(i + 1)
    }
  }
  const lineColAt = (offset: number): { line: number; column: number } => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (lineStarts[mid]! <= offset) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return { line: lo + 1, column: offset - lineStarts[lo]! + 1 }
  }
  for (let i = 0, { length } = pendingAmbiguous; i < length; i += 1) {
    const item = pendingAmbiguous[i]!
    const { column, line } = lineColAt(item.offset)
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
  return { skipped }
}
