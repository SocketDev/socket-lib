/**
 * @file Write a managed `export VAR='<value>'` block to the user's shell rc
 *   ("run commands") file. macOS only for now. `rc` is the historical Unix
 *   suffix for shell-startup files (`.bashrc`, `.zshrc`, `.cshrc`) — short for
 *   "run commands", a convention from MIT's CTSS (1965) carried through Multics
 *   into Unix. This module writes a managed block into that file so the value
 *   is exported into every subsequent shell session. Use case: `readSecret()`
 *   from `./keychain` round-trips through the OS credential store on every
 *   call. On macOS each call triggers a Keychain auth prompt unless the
 *   keychain item's ACL allows the calling process. That's the right shape for
 *   tools that read the secret once per process — but if you wire
 *   `readSecret()` into a shell rc file directly, the user gets an auth prompt
 *   on every new shell. Claude Code's Bash tool spawns a fresh shell per
 *   command, which means continuous prompt flood. Solution: write the literal
 *   value into ~/.zshenv (or equivalent) **once**, at install time, so every
 *   subsequent shell session picks up the env var without re-reading the
 *   keychain. The keychain is still the canonical store; this helper is just a
 *   cached materialization that lives in the rc file. API: write({ service,
 *   exports, notes?, legacySentinels? }) → { rcPath, outcome: 'inserted' |
 *   'updated' | 'unchanged' } | undefined clear(service, legacySentinels?) →
 *   boolean (true when a block was found and removed) Block layout (idempotent
 *   — re-running with the same exports returns `outcome: 'unchanged'`):
 *
 *   # BEGIN <service> env (managed)
 *
 *   # Token persisted by <installer>.
 *
 *   # Rotate via: <rotate-command>
 *
 *   export VAR_1='<value>' export VAR_2='<value>'
 *
 *   # END <service> env (managed)
 *
 *   Target file by shell: zsh → ~/.zshenv (sourced by every zsh, including
 *   non-interactive) bash → ~/.bashrc (or ~/.bash_profile fallback) For zsh we
 *   deliberately pick .zshenv (not .zshrc) because tools that spawn
 *   non-interactive shells (Claude Code, IDE plugins, CI runners) skip .zshrc
 *   and would miss the export.
 */

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { getHome } from '../env/home'

import { ObjectEntries } from '../primordials/object'

import { RegExpCtor } from '../primordials/regexp'

import { StringPrototypeEndsWith } from '../primordials/string'

export function buildBlock(options: WriteOptions): {
  begin: string
  end: string
  body: string
  full: string
} {
  // Symmetric BEGIN/END sentinels — the `(managed)` suffix is on
  // both so a `BEGIN → END` text-substitution swap produces the
  // matching END string for migration regexes.
  options = { __proto__: null, ...options } as typeof options
  const begin = `# BEGIN ${options.service} env (managed)`
  const end = `# END ${options.service} env (managed)`
  const noteLines = (options.notes ?? []).map(line => `# ${line}`)
  const exportLines = ObjectEntries(options.exports).map(
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
 * Remove the managed block from the user's shell rc file. Used by an uninstall
 * / clear flow. Returns `true` when a block was found and removed, `false` when
 * no block was present.
 */
export function clear(
  service: string,
  legacySentinels: readonly string[] = [],
): boolean {
  if (os.platform() !== 'darwin') {
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
  for (let i = 0, { length } = sentinelsToStrip; i < length; i += 1) {
    const begin = sentinelsToStrip[i]!
    const end = begin.replace(/\bBEGIN\b/, 'END')
    const endStripped = end.replace(/\s*\(managed\)\s*$/, '')
    const endAlt =
      end === endStripped
        ? escapeRegExp(end)
        : `(?:${escapeRegExp(end)}|${escapeRegExp(endStripped)})`
    const re = new RegExpCtor(
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
    writeRcFile(rcPath, existing.replace(/\n{3,}/g, '\n\n'))
  }
  return removedAny
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface WriteOptions {
  /**
   * Logical service name. Used to compose the BEGIN/END sentinels (`# BEGIN
   * <service> env (managed)`) so multiple tools can manage independent blocks
   * in the same rc file without stepping on each other.
   */
  service: string
  /**
   * Map of env-var name → literal value to export. Each entry becomes a single
   * POSIX `export NAME='value'` line.
   */
  exports: Record<string, string>
  /**
   * Optional doc-comment lines added at the top of the managed block (e.g.
   * "Rotate via: my-installer --rotate"). Each entry is prefixed with `# `
   * automatically.
   */
  notes?: readonly string[] | undefined
  /**
   * Legacy sentinel BEGIN strings to sweep before writing the new block. Used
   * during a rename/migration so an older managed block is removed rather than
   * ignored. Each entry should be the literal BEGIN line; the function
   * tolerates any line endings up to the matching END (same prefix with `END`
   * replacing `BEGIN`).
   */
  legacySentinels?: readonly string[] | undefined
  /**
   * Override the auto-detected shell. By default the helper reads `$SHELL` and
   * targets the matching rc file:
   *
   * - Zsh → `~/.zshenv`
   * - Bash → `~/.bashrc` (or `~/.bash_profile` if `~/.bashrc` is absent)
   * - Fish → `~/.config/fish/config.fish`
   *
   * Useful when an installer is running under a different shell than the user
   * normally uses (e.g. invoked from a sudo /bin/sh but the user is a zsh
   * user).
   */
  shell?: 'zsh' | 'bash' | 'fish' | undefined
  /**
   * Override the auto-picked rc path entirely. Use this when the user has a
   * non-standard layout (chezmoi, dotfile managers, a separate
   * `~/.zshenv.local` they source from `~/.zshenv`, etc.). The file is created
   * if missing.
   */
  rcPath?: string | undefined
}

export type WriteResult =
  | {
      rcPath: string
      outcome: 'inserted' | 'updated' | 'unchanged'
    }
  | {
      rcPath: undefined
      outcome: 'skipped'
      reason: 'unsupported-platform' | 'unknown-shell'
    }

export function pickRcFile(
  shellOverride?: 'zsh' | 'bash' | 'fish',
): string | undefined {
  const home = getHome()
  if (!home) {
    return undefined
  }
  const shellPath = process.env['SHELL'] ?? ''
  const shell: 'zsh' | 'bash' | 'fish' | undefined =
    shellOverride ??
    (StringPrototypeEndsWith(shellPath, 'zsh')
      ? 'zsh'
      : StringPrototypeEndsWith(shellPath, 'bash')
        ? 'bash'
        : StringPrototypeEndsWith(shellPath, 'fish')
          ? 'fish'
          : undefined)
  if (shell === 'zsh') {
    return path.join(home, '.zshenv')
  }
  if (shell === 'bash') {
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
  if (shell === 'fish') {
    return path.join(home, '.config', 'fish', 'config.fish')
  }
  return undefined
}

export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

/**
 * Insert or update the managed env-var block in the user's shell run-commands
 * file (`~/.zshenv` for zsh, `~/.bashrc` / `~/.bash_profile` for bash,
 * `~/.config/fish/config.fish` for fish). macOS only — Linux + Windows return
 * `{outcome: 'skipped', reason: 'unsupported-platform'}` so callers can fall
 * back to a copy- pasteable instruction without special-casing an `undefined`
 * return.
 *
 * The block is matched by BEGIN/END sentinels, so it coexists with other
 * managed blocks (homebrew, nvm, etc.). Idempotent: re-running with the same
 * exports produces `outcome: 'unchanged'` and doesn't touch the file.
 *
 * `legacySentinels` lets a consumer migrate the block from an older BEGIN
 * string. Each legacy block (matched by `BEGIN <legacy>` → `END <legacy>`) is
 * stripped before the new block is written.
 *
 * `shell` and `rcPath` override the auto-detected target — useful for chezmoi /
 * dotfile-manager users or installers running under a non-default shell.
 */
export function write(options: WriteOptions): WriteResult {
  options = { __proto__: null, ...options } as typeof options
  if (os.platform() !== 'darwin') {
    return {
      rcPath: undefined,
      outcome: 'skipped',
      reason: 'unsupported-platform',
    }
  }
  const rcPath = options.rcPath ?? pickRcFile(options.shell)
  if (!rcPath) {
    return { rcPath: undefined, outcome: 'skipped', reason: 'unknown-shell' }
  }
  const { begin, end, full: desiredBlock } = buildBlock(options)

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
  for (const legacyBegin of options.legacySentinels ?? []) {
    const legacyEnd = legacyBegin.replace(/\bBEGIN\b/, 'END')
    const legacyEndStripped = legacyEnd.replace(/\s*\(managed\)\s*$/, '')
    const endAlt =
      legacyEnd === legacyEndStripped
        ? escapeRegExp(legacyEnd)
        : `(?:${escapeRegExp(legacyEnd)}|${escapeRegExp(legacyEndStripped)})`
    const legacyRe = new RegExpCtor(
      `\n*${escapeRegExp(legacyBegin)}[\\s\\S]*?${endAlt}\n?`,
      'g',
    )
    working = working.replace(legacyRe, '\n')
  }

  const blockRe = new RegExpCtor(
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
    writeRcFile(rcPath, rewritten.replace(/\n{3,}/g, '\n\n'))
    return { rcPath, outcome: 'updated' }
  }

  // No existing canonical block. Append the new block to the
  // (possibly legacy-scrubbed) working copy and write the whole
  // thing back.
  const needsLeadingNewline =
    working.length > 0 && !StringPrototypeEndsWith(working, '\n\n')
  const prefix = needsLeadingNewline
    ? StringPrototypeEndsWith(working, '\n')
      ? '\n'
      : '\n\n'
    : ''
  const next = `${working}${prefix}${desiredBlock}\n`.replace(/\n{3,}/g, '\n\n')
  writeRcFile(rcPath, next)
  // If we scrubbed a legacy block, the outcome is logically an
  // "updated" (replaced the old shape) — but the API only has
  // 'inserted' / 'updated' / 'unchanged', and the new BEGIN/END
  // sentinel didn't exist on disk before, so 'inserted' is honest.
  return { rcPath, outcome: 'inserted' }
}

/**
 * Internal: write an rc file with 0o600 (owner-only). The rc file embeds a
 * literal SOCKET_API_KEY value so the shell rc can `export` it on session start
 * without re-prompting the keychain. The file must NEVER be readable by other
 * local users — `writeFileSync` with no `mode:` lands at `0o644` on first
 * create (default umask 022), exposing the token on multi-user macOS / Linux
 * machines. We unconditionally chmod after write so existing files with looser
 * permissions also get tightened.
 */
export function writeRcFile(rcPath: string, contents: string): void {
  writeFileSync(rcPath, contents, { mode: 0o600 })
  try {
    chmodSync(rcPath, 0o600)
  } catch {
    // chmod may fail on a filesystem that doesn't support POSIX modes
    // (FAT32-on-USB, some network mounts). The writeFileSync mode is
    // already the best we can do there.
  }
}
