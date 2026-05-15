/**
 * @fileoverview Materialize a secret into the user's shell-startup
 * file as a literal `export VAR='<value>'` block. macOS only for
 * now.
 *
 * Use case: `readSecret()` round-trips through the OS keychain on
 * every call. On macOS each call triggers a Keychain auth prompt
 * unless the keychain item's ACL allows the calling process. That's
 * the right shape for tools that read the secret once per process
 * — but if you wire `readSecret()` into a shell rc file, the user
 * gets an auth prompt on every new shell. Claude Code's Bash tool
 * spawns a fresh shell per command, which means continuous prompt
 * flood.
 *
 * Solution: write the literal value into ~/.zshenv (or equivalent)
 * **once**, at install time, so every subsequent shell session
 * picks up the env var without re-reading the keychain. The
 * keychain is still the canonical store; this helper is just a
 * cache materialization.
 *
 * Block layout (idempotent — re-running updates in place):
 *
 *   # BEGIN <service> env (managed)
 *   # Token persisted by <installer>.
 *   # Rotate via: <rotate-command>
 *   export VAR_1='<value>'
 *   export VAR_2='<value>'
 *   # END <service> env
 *
 * Target file by shell:
 *   zsh  → ~/.zshenv  (sourced by every zsh, including non-interactive)
 *   bash → ~/.bashrc (or ~/.bash_profile fallback)
 *
 * For zsh we deliberately pick .zshenv (not .zshrc) because tools
 * that spawn non-interactive shells (Claude Code, IDE plugins, CI
 * runners) skip .zshrc and would miss the export.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import path from 'node:path'
import process from 'node:process'

export interface MaterializeOptions {
  /**
   * Logical service name. Used to compose the BEGIN/END sentinels
   * (`# BEGIN <service> env (managed)`) so multiple tools can
   * manage independent blocks in the same rc file without
   * stepping on each other.
   */
  service: string
  /**
   * Map of env-var name → literal value to export. Each entry
   * becomes a single POSIX `export NAME='value'` line.
   */
  exports: Record<string, string>
  /**
   * Optional doc-comment lines added at the top of the managed
   * block (e.g. "Rotate via: my-installer --rotate"). Each entry
   * is prefixed with `# ` automatically.
   */
  notes?: readonly string[]
  /**
   * Legacy sentinel BEGIN strings to sweep before writing the new
   * block. Used during a rename/migration so an older managed
   * block is removed rather than ignored. Each entry should be the
   * literal BEGIN line; the function tolerates any line endings
   * up to the matching END (same prefix with `END` replacing
   * `BEGIN`).
   */
  legacySentinels?: readonly string[]
}

export interface MaterializeResult {
  rcPath: string
  outcome: 'inserted' | 'updated' | 'unchanged'
}

function pickRcFile(): string | undefined {
  const home = homedir()
  const shell = process.env['SHELL'] ?? ''
  if (/zsh$/.test(shell)) {
    return path.join(home, '.zshenv')
  }
  if (/bash$/.test(shell)) {
    const bashrc = path.join(home, '.bashrc')
    if (existsSync(bashrc)) {
      return bashrc
    }
    const bashProfile = path.join(home, '.bash_profile')
    if (existsSync(bashProfile)) {
      return bashProfile
    }
    return bashrc
  }
  return undefined
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function buildBlock(opts: MaterializeOptions): {
  begin: string
  end: string
  body: string
  full: string
} {
  // Symmetric BEGIN/END sentinels — the `(managed)` suffix is on
  // both so a `BEGIN → END` text-substitution swap produces the
  // matching END string for migration regexes.
  const begin = `# BEGIN ${opts.service} env (managed)`
  const end = `# END ${opts.service} env (managed)`
  const noteLines = (opts.notes ?? []).map(line => `# ${line}`)
  const exportLines = Object.entries(opts.exports).map(
    ([name, value]) => `export ${name}=${shellSingleQuote(value)}`,
  )
  const body = [...noteLines, ...exportLines].join('\n')
  return {
    begin,
    end,
    body,
    full: `${begin}\n${body}\n${end}`,
  }
}

/**
 * Insert or update the managed env-var block in the user's shell
 * startup file. macOS only — Linux + Windows return `undefined`
 * (callers fall back to a copy-pasteable instruction).
 *
 * The block is matched by BEGIN/END sentinels, so it coexists with
 * other managed blocks (homebrew, nvm, etc.). Idempotent: re-running
 * with the same exports produces `outcome: 'unchanged'` and doesn't
 * touch the file.
 *
 * `legacySentinels` lets a consumer migrate the block from an older
 * BEGIN string. Each legacy block (matched by `BEGIN <legacy>` →
 * `END <legacy>`) is stripped before the new block is written.
 */
export function materializeToShellRc(
  opts: MaterializeOptions,
): MaterializeResult | undefined {
  if (platform() !== 'darwin') {
    return undefined
  }
  const rcPath = pickRcFile()
  if (!rcPath) {
    return undefined
  }
  const { begin, end, full: desiredBlock } = buildBlock(opts)

  let onDisk = ''
  if (existsSync(rcPath)) {
    onDisk = readFileSync(rcPath, 'utf8')
  }
  let working = onDisk

  // Sweep legacy sentinels first (migration support). The END line
  // is derived by replacing the first `BEGIN` with `END`; we also
  // accept the same string with a trailing ` (managed)` stripped,
  // since older sentinels were asymmetric (BEGIN had the qualifier,
  // END didn't).
  for (const legacyBegin of opts.legacySentinels ?? []) {
    const legacyEnd = legacyBegin.replace(/\bBEGIN\b/, 'END')
    const legacyEndStripped = legacyEnd.replace(/\s*\(managed\)\s*$/, '')
    const endAlt =
      legacyEnd === legacyEndStripped
        ? escapeRegExp(legacyEnd)
        : `(?:${escapeRegExp(legacyEnd)}|${escapeRegExp(legacyEndStripped)})`
    const legacyRe = new RegExp(
      `\n*${escapeRegExp(legacyBegin)}[\\s\\S]*?${endAlt}\n?`,
      'g',
    )
    working = working.replace(legacyRe, '\n')
  }

  const blockRe = new RegExp(
    `${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`,
  )
  const match = blockRe.exec(working)

  if (match) {
    if (match[0] === desiredBlock && working === onDisk) {
      // Existing block already canonical AND no legacy sweep happened.
      return { rcPath, outcome: 'unchanged' }
    }
    const rewritten =
      working.slice(0, match.index) +
      desiredBlock +
      working.slice(match.index + match[0].length)
    writeFileSync(rcPath, rewritten.replace(/\n{3,}/g, '\n\n'))
    return { rcPath, outcome: 'updated' }
  }

  // No existing canonical block. Append the new block to the
  // (possibly legacy-scrubbed) working copy and write the whole
  // thing back.
  const needsLeadingNewline = working.length > 0 && !working.endsWith('\n\n')
  const prefix = needsLeadingNewline
    ? working.endsWith('\n')
      ? '\n'
      : '\n\n'
    : ''
  const next = `${working}${prefix}${desiredBlock}\n`.replace(/\n{3,}/g, '\n\n')
  writeFileSync(rcPath, next)
  // If we scrubbed a legacy block, the outcome is logically an
  // "updated" (replaced the old shape) — but the API only has
  // 'inserted' / 'updated' / 'unchanged', and the new BEGIN/END
  // sentinel didn't exist on disk before, so 'inserted' is honest.
  return { rcPath, outcome: 'inserted' }
}

/**
 * Remove the managed block from the user's shell rc. Used by an
 * uninstall / clear flow. Returns `true` when a block was found
 * and removed, `false` when no block was present.
 */
export function unmaterializeFromShellRc(
  service: string,
  legacySentinels: readonly string[] = [],
): boolean {
  if (platform() !== 'darwin') {
    return false
  }
  const rcPath = pickRcFile()
  if (!rcPath || !existsSync(rcPath)) {
    return false
  }
  let existing = readFileSync(rcPath, 'utf8')
  let removedAny = false

  const sentinelsToStrip = [
    `# BEGIN ${service} env (managed)`,
    ...legacySentinels,
  ]
  for (const begin of sentinelsToStrip) {
    const end = begin.replace(/\bBEGIN\b/, 'END')
    const endStripped = end.replace(/\s*\(managed\)\s*$/, '')
    const endAlt =
      end === endStripped
        ? escapeRegExp(end)
        : `(?:${escapeRegExp(end)}|${escapeRegExp(endStripped)})`
    const re = new RegExp(
      `\n*${escapeRegExp(begin)}[\\s\\S]*?${endAlt}\n?`,
      'g',
    )
    const next = existing.replace(re, '\n')
    if (next !== existing) {
      removedAny = true
      existing = next
    }
  }

  if (removedAny) {
    writeFileSync(rcPath, existing.replace(/\n{3,}/g, '\n\n'))
  }
  return removedAny
}
