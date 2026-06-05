/**
 * @file Rule H scanner for .mts / .cts source files. Rule H — repo root
 *   re-derived inline by walking up from the module's own location with a
 *   hardcoded `..` count, instead of importing the single `REPO_ROOT` owner
 *   from `paths.mts`. A `path.join(...)` / `path.resolve(...)` whose first
 *   argument is a module anchor (`__dirname`, an inline
 *   `path.dirname(fileURLToPath(import.meta.url))`, or a `here` identifier
 *   bound to that expression in the same file) and whose remaining arguments
 *   are all `'..'` literals is the fragile pattern that silently broke when
 *   73c691d9 moved scripts a directory deeper and left the counts stale.
 *
 *   The predicate is pattern-only — it fires regardless of whether the count
 *   happens to be correct for the file's current depth, because even a correct
 *   count violates "1 path, 1 reference": repo root must come from the one
 *   constructed value, never re-derived. Resolving the actual depth would
 *   re-introduce the fragility the rule eliminates.
 *
 *   Exemption is DELIBERATELY tighter than the shared `isExempt`: only
 *   `paths.mts` (the `resolveRepoRoot` home) is allowed to walk to root. The
 *   shared list also skips the whole `check/paths/` and `path-guard/` trees,
 *   which is correct for the stage-token rules (A/B) but would let Rule H go
 *   vacuously green on the exact files that carried the original bug.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { REPO_ROOT_ANCHOR_IDENTIFIERS } from '../../../../.claude/hooks/fleet/path-guard/segments.mts'
import { extractPathCalls } from './scan-code.mts'
import { pushFinding } from './state.mts'

// Only `paths.mts` may construct the repo root by walking up. Everything else
// imports the constructed `REPO_ROOT` (or a derived constant) from it.
export const REPO_ROOT_EXEMPT_RE = /(?:^|\/)paths\.(?:cts|js|mts)$/

export function isRepoRootExempt(relPath: string): boolean {
  return REPO_ROOT_EXEMPT_RE.test(relPath.split(path.sep).join('/'))
}

// `here` counts as a module anchor only when the file binds it to
// `path.dirname(fileURLToPath(import.meta.url))` — the fleet convention. The
// bare name is too common (loop vars, segment cursors) to assume.
const HERE_BINDING_RE =
  /\bhere\b\s*=\s*path\.dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)/

/**
 * Split a `path.join`/`path.resolve` argument substring into ordered top-level
 * argument tokens. Commas inside nested parens, brackets, braces, or string
 * literals don't split. Each token is trimmed; string-literal tokens keep
 * their surrounding quotes so the caller can tell `'..'` (a literal) from `..`
 * (which never appears bare).
 */
export function splitTopLevelArgs(args: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let inString: '"' | "'" | '`' | undefined = undefined
  let start = 0
  for (let i = 0, { length } = args; i < length; i += 1) {
    const ch = args[i]!
    if (inString) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === inString) {
        inString = undefined
      }
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1
    } else if (ch === ',' && depth === 0) {
      tokens.push(args.slice(start, i).trim())
      start = i + 1
    }
  }
  const tail = args.slice(start).trim()
  if (tail.length > 0) {
    tokens.push(tail)
  }
  return tokens
}

// A `'..'` / `".."` literal token (the only segment a repo-root walk uses
// after the anchor).
const DOTDOT_TOKEN_RE = /^(['"])\.\.\1$/

/**
 * Is `token` a module anchor — `__dirname`, an inline
 * `path.dirname(fileURLToPath(import.meta.url))`, or a `here` identifier when
 * `hereIsAnchor` says the file binds it to that expression?
 */
export function isAnchorToken(token: string, hereIsAnchor: boolean): boolean {
  if (token === '__dirname') {
    return true
  }
  if (token === 'here') {
    return hereIsAnchor
  }
  // Inline `path.dirname(fileURLToPath(import.meta.url))` — whitespace-tolerant.
  return /^path\.dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)$/.test(
    token,
  )
}

export function scanRepoRootFile(repoRoot: string, relPath: string): void {
  if (isRepoRootExempt(relPath)) {
    return
  }
  const full = path.join(repoRoot, relPath)
  let content: string
  try {
    content = readFileSync(full, 'utf8')
  } catch {
    return
  }
  const hereIsAnchor = HERE_BINDING_RE.test(content)
  const lines = content.split('\n')
  const lineOffsets: number[] = [0]
  for (let i = 0, { length } = content; i < length; i += 1) {
    if (content[i] === '\n') {
      lineOffsets.push(i + 1)
    }
  }
  const offsetToLine = (offset: number): number => {
    let lo = 0
    let hi = lineOffsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (lineOffsets[mid]! <= offset) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return lo + 1
  }

  for (const call of extractPathCalls(content)) {
    const tokens = splitTopLevelArgs(call.args)
    if (tokens.length < 2) {
      continue
    }
    if (!isAnchorToken(tokens[0]!, hereIsAnchor)) {
      continue
    }
    // Every argument after the anchor must be a `'..'` literal — that's a
    // walk-to-root. A filename or sub-path after the anchor (sibling-file
    // reference like `path.join(__dirname, 'token.mts')`) is legitimate and
    // must not fire.
    const restAllDotDot = tokens
      .slice(1)
      .every(tok => DOTDOT_TOKEN_RE.test(tok))
    if (!restAllDotDot) {
      continue
    }
    const line = offsetToLine(call.offset)
    const snippet = (lines[line - 1] ?? '').trim()
    pushFinding({
      rule: 'H',
      file: relPath,
      line,
      snippet,
      message: 'Repo root re-derived inline by walking up from the module.',
      fix: "Import the constructed REPO_ROOT from paths.mts (e.g. `import { REPO_ROOT } from './paths.mts'`) instead of counting `..` from __dirname. 1 path, 1 reference.",
    })
  }
}
