#!/usr/bin/env node
// Claude Code PreToolUse hook — readme-fleet-shape-guard.
//
// Blocks Edit/Write of the root README.md when the resulting content
// violates the canonical fleet skeleton:
//
//   (a) Missing or out-of-order canonical section. The 5 level-2
//       sections must appear in this order:
//         Why this repo exists / Install / Usage / Development / License
//
//   (b) Mentions `socket-wheelhouse` outside fenced code blocks.
//       socket-wheelhouse is a private repo; the link 404s for outside
//       readers.
//
//   (c) Invokes a command against a sibling-repo relative path.
//       `node ../socket-foo/scripts/...` and similar shapes assume the
//       reader has the sibling repo checked out at exactly the right
//       relative level — almost never true for an outside user.
//
// Only fires on the REPO-ROOT README.md (basename === 'README.md' AND
// directory is repo root). Nested READMEs (packages/, docs/, .claude/,
// etc.) are scoped docs with their own shape; this hook is silent for
// them.
//
// Bypass phrase: `Allow readme-fleet-shape bypass`. Reading recent user
// turns follows the same pattern as no-revert-guard, plan-location-guard.
//
// Companion to:
//   - scripts/sync-scaffolding/checks/readme-skeleton-drift.mts
//     (sync-time check, no autofix)
//   - template/.config/fleet/markdownlint-rules/socket-{readme-required-sections,
//     no-private-wheelhouse-leak, no-relative-sibling-script}.mjs
//     (lint-time check)
//
// This hook is the edit-time enforcement — it fires when the README is
// being written, catching the failure mode at its earliest surface.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { block, defineHook, editGuard, runHook } from '../_shared/guard.mts'
import { bypassPhrasePresent } from '../_shared/transcript.mts'

const BYPASS_PHRASE = 'Allow readme-fleet-shape bypass'
const BYPASS_LOOKBACK_USER_TURNS = 8

const REQUIRED_SECTIONS = [
  'Why this repo exists',
  'Install',
  'Usage',
  'Development',
  'License',
] as const

const WHEELHOUSE_LEAK_RE = /socket-wheelhouse/i
const SIBLING_PATH_RES: readonly RegExp[] = [
  /\b(?:bun|deno|node|npm|pnpm|yarn)\s+\.\.\/[\w@-]+\//,
  /(?:^|\s)\.\.\/socket-[\w-]+\//i,
  /(?:^|\s)\.\.\/sdxgen\//,
  /(?:^|\s)\.\.\/stuie\//,
]

/**
 * Repo-root README detection. The hook only fires on the root README.md, not
 * nested READMEs. The check is path-shape only — basename match + parent
 * directory ≠ another README's parent.
 */
export function isRootReadme(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  if (path.basename(normalized) !== 'README.md') {
    return false
  }
  const dir = path.dirname(normalized)
  // Nested-README markers: any path segment that says "this is a
  // scoped doc, not the repo root."
  const segments = dir.split('/').filter(Boolean)
  const SCOPED_PARENTS = new Set([
    '.claude',
    'apps',
    'crates',
    'docs',
    'examples',
    'hooks',
    'lib',
    'packages',
    'pkg-node',
    'scripts',
    'src',
    'template',
    'test',
    'tools',
  ])
  for (const seg of segments) {
    if (SCOPED_PARENTS.has(seg)) {
      return false
    }
  }
  return true
}

/**
 * Compute the post-edit text for an Edit (splice old_string → new_string
 * against the on-disk file) or a Write (just `content`). Returns undefined when
 * the post-edit text can't be reliably computed (Edit against a file that
 * doesn't exist, or old_string not found).
 */
export function computePostEditText(
  toolName: string,
  filePath: string,
  newString: string | undefined,
  oldString: string | undefined,
  content: string | undefined,
): string | undefined {
  if (toolName === 'Write') {
    return content
  }
  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    if (!existsSync(filePath)) {
      // Edit against a non-existent file is unusual; let it through.
      return undefined
    }
    let onDisk: string
    try {
      onDisk = readFileSync(filePath, 'utf8')
    } catch {
      return undefined
    }
    if (oldString === undefined || newString === undefined) {
      return undefined
    }
    const idx = onDisk.indexOf(oldString)
    if (idx === -1) {
      return undefined
    }
    return (
      onDisk.slice(0, idx) + newString + onDisk.slice(idx + oldString.length)
    )
  }
  return undefined
}

interface ShapeFinding {
  kind: 'missing-section' | 'wheelhouse-leak' | 'relative-sibling'
  detail: string
}

export function findShapeViolations(text: string): ShapeFinding[] {
  const lines = text.split('\n')
  const findings: ShapeFinding[] = []

  const headings: string[] = []
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const m = /^##\s+(?<heading>.+?)\s*$/.exec(lines[i] ?? '')
    if (m && m.groups?.heading) {
      headings.push(m.groups.heading)
    }
  }
  let cursor = 0
  for (let r = 0, { length } = REQUIRED_SECTIONS; r < length; r += 1) {
    const want = REQUIRED_SECTIONS[r]
    let found = -1
    for (let h = cursor; h < headings.length; h += 1) {
      if (headings[h] === want) {
        found = h
        break
      }
    }
    if (found === -1) {
      findings.push({
        kind: 'missing-section',
        detail: `Missing canonical section "## ${want}" (or out of order)`,
      })
      break
    }
    cursor = found + 1
  }

  let inFence = false
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i] ?? ''
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      continue
    }
    if (WHEELHOUSE_LEAK_RE.test(line)) {
      findings.push({
        kind: 'wheelhouse-leak',
        detail: `Line ${i + 1} mentions socket-wheelhouse: ${line.trim().slice(0, 120)}`,
      })
      break
    }
  }

  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i] ?? ''
    let matched = false
    for (let j = 0, jl = SIBLING_PATH_RES.length; j < jl; j += 1) {
      if (SIBLING_PATH_RES[j]!.test(line)) {
        matched = true
        break
      }
    }
    if (matched) {
      findings.push({
        kind: 'relative-sibling',
        detail: `Line ${i + 1} invokes a sibling-relative path: ${line.trim().slice(0, 120)}`,
      })
      break
    }
  }

  return findings
}

export const check = editGuard((filePath, content, payload) => {
  if (!isRootReadme(filePath)) {
    return undefined
  }

  const tool = payload.tool_name!
  const input = payload.tool_input
  const newString =
    typeof input?.new_string === 'string' ? input.new_string : undefined
  const oldString =
    typeof input?.old_string === 'string' ? input.old_string : undefined

  const postEdit = computePostEditText(
    tool,
    filePath,
    newString,
    oldString,
    content,
  )
  if (postEdit === undefined) {
    return undefined
  }

  const findings = findShapeViolations(postEdit)
  if (findings.length === 0) {
    return undefined
  }

  if (
    bypassPhrasePresent(
      payload.transcript_path,
      BYPASS_PHRASE,
      BYPASS_LOOKBACK_USER_TURNS,
    )
  ) {
    return undefined
  }

  const lines: string[] = [
    `🚨 readme-fleet-shape-guard: blocked Edit/Write of root README.md.`,
    ``,
    `File: ${filePath}`,
    ``,
    `Violations:`,
  ]
  for (let i = 0, { length } = findings; i < length; i += 1) {
    lines.push(`  - ${findings[i]!.detail}`)
  }
  lines.push(``)
  lines.push(
    `Per the fleet "Canonical README" rule (CLAUDE.md → Canonical README),`,
  )
  lines.push(`root README.md must follow the skeleton at:`)
  lines.push(`  socket-wheelhouse/template/README.md`)
  lines.push(``)
  lines.push(`Required sections in order:`)
  for (let i = 0, { length } = REQUIRED_SECTIONS; i < length; i += 1) {
    lines.push(`  ${i + 1}. ## ${REQUIRED_SECTIONS[i]}`)
  }
  lines.push(``)
  lines.push(
    `One-shot bypass (rare): user types "${BYPASS_PHRASE}" verbatim in a recent message.`,
  )
  lines.push(``)
  return block(lines.join('\n'))
})

export const hook = defineHook({
  check,
  event: 'PreToolUse',
  matcher: ['Edit', 'Write', 'MultiEdit'],
  type: 'guard',
})
await runHook(hook, import.meta.url)
