#!/usr/bin/env node
// Claude Code PostToolUse hook — bundle-stale-reminder.
//
// renamed-from: bundle-stale-guard
//
// Mirrors extension-build-current-reminder. Fires after an Edit/Write whose
// path is a hook-bundle SOURCE: the `_dispatch/` dispatcher, the generated
// `dispatch-table.mts`, any bundled hook's `index.mts`, or anything under
// `_shared/`. When the edited source is NEWER than the built
// `_dispatch/bundle.cjs`, the bundle is stale and the operator is reminded to
// rebuild it with `node scripts/fleet/build-hook-bundle.mts`.
//
// The hook is a REMINDER, never a block: it only writes to stderr and always
// exits 0. PostToolUse can't reject the prior tool call anyway.
//
// Bypass: `Allow hook-bundle-current bypass` (silences the reminder when the
// rebuild is genuinely deferred). See docs/agents.md/fleet/hook-bundle.md.

import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { bypassPhrasePresent } from '../_shared/transcript.mts'

export interface BundleStalePayload {
  readonly cwd?: string | undefined
  readonly hook_event_name?: string | undefined
  readonly tool_input?: { readonly file_path?: unknown | undefined } | undefined
  readonly tool_name?: string | undefined
  readonly transcript_path?: string | undefined
}

// Read by scripts/fleet/make-hook-dispatch.mts to place this hook in the
// static dispatch table (the bundled fast-path). PostToolUse, Edit|Write.
export const DISPATCH_EVENT = 'PostToolUse'
export const DISPATCH_TOOLS: readonly string[] = ['Edit', 'Write']

const BYPASS_PHRASE = 'Allow hook-bundle-current bypass'
const BUNDLE_REL = '.claude/hooks/fleet/_dispatch/bundle.cjs'
const DISPATCH_DIR_FRAGMENT = '.claude/hooks/fleet/_dispatch/'
const SHARED_DIR_FRAGMENT = '.claude/hooks/fleet/_shared/'
const FLEET_HOOK_INDEX_RE =
  /\.claude\/hooks\/fleet\/[^/]+\/index\.mts$/

/**
 * Returns true when filePath is a source that the hook bundle is built from:
 * the dispatcher / dispatch-table under `_dispatch/`, any fleet hook's
 * `index.mts`, or anything under `_shared/`. Path is normalized to `/` first
 * so the match is the same on darwin / linux / win32.
 */
export function isBundledSource(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/')
  if (norm.endsWith(BUNDLE_REL) || norm.includes(`${DISPATCH_DIR_FRAGMENT}`)) {
    // The bundle output itself is not a source; only the .mts under _dispatch/.
    if (norm.endsWith(BUNDLE_REL)) {
      return false
    }
    return norm.endsWith('.mts')
  }
  if (norm.includes(SHARED_DIR_FRAGMENT) && norm.endsWith('.mts')) {
    return true
  }
  return FLEET_HOOK_INDEX_RE.test(norm)
}

/**
 * Walks up from `start` looking for a directory that contains `package.json`
 * AND the `.claude/hooks/fleet/` tree. Returns the path or undefined.
 */
export function findRepoRoot(start: string): string | undefined {
  let cur = start
  for (let i = 0; i < 12; i += 1) {
    if (
      existsSync(path.join(cur, 'package.json')) &&
      existsSync(path.join(cur, '.claude', 'hooks', 'fleet'))
    ) {
      return cur
    }
    const parent = path.dirname(cur)
    if (parent === cur) {
      return undefined
    }
    cur = parent
  }
  return undefined
}

/**
 * Returns true when the built bundle is missing, or older than the edited
 * source file (mtime comparison). A missing bundle is treated as stale.
 */
export function bundleIsStale(repoRoot: string, sourceAbsPath: string): boolean {
  const bundlePath = path.join(repoRoot, BUNDLE_REL)
  if (!existsSync(bundlePath)) {
    return true
  }
  try {
    const bundleMtime = statSync(bundlePath).mtimeMs
    const sourceMtime = statSync(sourceAbsPath).mtimeMs
    return sourceMtime > bundleMtime
  } catch {
    return false
  }
}

/**
 * Builds the multi-line stderr reminder.
 */
export function formatReminder(sourceRel: string): string {
  return (
    [
      `[bundle-stale-reminder] Edited a hook-bundle source without rebuilding the bundle.`,
      ``,
      `  Source:  ${sourceRel}`,
      `  Bundle:  ${BUNDLE_REL} (missing or older than the source)`,
      ``,
      `  Rebuild so warm hook dispatch loads current code:`,
      `    node scripts/fleet/build-hook-bundle.mts`,
      ``,
      `  Deferring the rebuild on purpose? Type "${BYPASS_PHRASE}".`,
    ].join('\n') + '\n'
  )
}

/**
 * Core hook logic, decoupled from process I/O so the dispatcher bundle can
 * call it directly. Returns the reminder text when the bundle is stale, or
 * undefined when there is nothing to say.
 */
export function run(payload: BundleStalePayload): string | undefined {
  if (
    payload.hook_event_name &&
    payload.hook_event_name !== 'PostToolUse'
  ) {
    return undefined
  }
  if (payload.tool_name !== 'Edit' && payload.tool_name !== 'Write') {
    return undefined
  }
  const filePath =
    typeof payload.tool_input?.file_path === 'string'
      ? payload.tool_input.file_path
      : ''
  if (!filePath || !isBundledSource(filePath)) {
    return undefined
  }
  if (bypassPhrasePresent(payload.transcript_path, BYPASS_PHRASE)) {
    return undefined
  }
  const cwd =
    typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const repoRoot = findRepoRoot(cwd) ?? findRepoRoot(path.dirname(filePath))
  if (!repoRoot) {
    return undefined
  }
  const sourceAbs = path.isAbsolute(filePath)
    ? filePath
    : path.join(repoRoot, filePath)
  if (!bundleIsStale(repoRoot, sourceAbs)) {
    return undefined
  }
  const sourceRel = path.relative(repoRoot, sourceAbs) || filePath
  return formatReminder(sourceRel)
}

async function readStdin(): Promise<string> {
  let raw = ''
  for await (const chunk of process.stdin) {
    raw += chunk
  }
  return raw
}

async function main(): Promise<void> {
  let raw: string
  try {
    raw = await readStdin()
  } catch {
    process.exit(0)
  }
  if (!raw.trim()) {
    process.exit(0)
  }
  let payload: BundleStalePayload
  try {
    payload = JSON.parse(raw) as BundleStalePayload
  } catch {
    process.exit(0)
  }
  const reminder = run(payload)
  if (reminder) {
    process.stderr.write(reminder)
  }
  // Reminder-only: never blocks.
  process.exit(0)
}

// Entrypoint-guarded: run main() only when invoked directly, NOT when the test
// or the dispatch bundle imports this module for its pure `run` helper.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    process.exit(0)
  })
}
