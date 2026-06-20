#!/usr/bin/env node
// Claude Code PreToolUse hook — no-clipboard-access-guard.
//
// Blocks a script / hook / Bash command from reading or writing the system
// clipboard. The clipboard is a cross-process exfil + overwrite surface: a
// secret copied there leaks to any app, and an OSC-52 escape written to the
// terminal can silently overwrite (or, on permissive terminals, read) it. The
// fleet's own tooling never needs clipboard access, so any attempt is either a
// mistake or a poisoning fingerprint.
//
// Two surfaces, gated on tool_name:
//
//   1. Bash — a clipboard CLI in the command line. AST-parsed via the
//      fleet shell parser (findInvocation), not a loose regex, so a path
//      fragment like `pbcopyrc` or a quoted literal doesn't false-fire:
//        macOS:   pbcopy, pbpaste
//        Linux:   xclip, xsel, wl-copy, wl-paste
//        Windows: clip, clip.exe
//
//   2. Edit / Write — source that emits an OSC-52 clipboard escape
//      (`ESC ] 52 ; ...`) in any of its literal spellings (\x1b / \033 /
//       / the raw control byte). That's the sequence the earlier
//      Terminal "attempted to access the clipboard" denial came from.
//
// Bypass: `Allow clipboard-access bypass` in a recent user turn — for a
// genuine, operator-driven clipboard need (rare).

import { block, defineHook, runHook } from '../_shared/guard.mts'
import type { ToolCallPayload } from '../_shared/payload.mts'
import { findInvocation } from '../_shared/shell-command.mts'
import { bypassPhrasePresent } from '../_shared/transcript.mts'

const BYPASS_PHRASE = 'Allow clipboard-access bypass'

// Pre-flight skip set: the dispatcher only imports this guard when the raw
// payload contains one of these. Every block path requires one — a clipboard
// binary name (`clip` also covers `clip.exe`) for the Bash arm, or the `]52;`
// OSC-52 prefix (present under every escape spelling) for the Edit/Write arm.
export const triggers: readonly string[] = [
  ']52;',
  'clip',
  'pbcopy',
  'pbpaste',
  'wl-copy',
  'wl-paste',
  'xclip',
  'xsel',
]

// Clipboard CLIs, by platform, with the label surfaced in the error.
const CLIPBOARD_BINARIES: ReadonlyArray<{
  readonly binary: string
  readonly platform: string
}> = [
  { binary: 'clip', platform: 'Windows' },
  { binary: 'clip.exe', platform: 'Windows' },
  { binary: 'pbcopy', platform: 'macOS' },
  { binary: 'pbpaste', platform: 'macOS' },
  { binary: 'wl-copy', platform: 'Linux' },
  { binary: 'wl-paste', platform: 'Linux' },
  { binary: 'xclip', platform: 'Linux' },
  { binary: 'xsel', platform: 'Linux' },
]

// OSC-52 clipboard escape in any literal spelling a source file might carry:
// the raw ESC byte, or an escaped \x1b / \033 / , immediately followed
// by `]52;`. Matching the prefix is enough — the payload after `52;` is the
// clipboard data and need not be parsed.
const OSC52_RE = /(?:\x1b|\\x1b|\\u001b|\\033|\\e)\]52;/i

// The clipboard CLI invoked in a Bash command line, or undefined when none.
export function clipboardBinaryIn(command: string): string | undefined {
  for (let i = 0, { length } = CLIPBOARD_BINARIES; i < length; i += 1) {
    const entry = CLIPBOARD_BINARIES[i]!
    if (findInvocation(command, { binary: entry.binary })) {
      return entry.binary
    }
  }
  return undefined
}

// True when `text` emits an OSC-52 clipboard escape.
export function hasOsc52(text: string): boolean {
  return OSC52_RE.test(text)
}

// Decide what (if anything) to block for a payload. Returns the block reason,
// or undefined to pass. Pure — the test drives it directly.
export function clipboardViolation(
  payload: ToolCallPayload,
): string | undefined {
  const toolName = payload.tool_name
  const input = payload.tool_input
  if (!input) {
    return undefined
  }
  if (toolName === 'Bash') {
    const command = input.command
    if (typeof command === 'string') {
      const binary = clipboardBinaryIn(command)
      if (binary) {
        return `Bash command invokes the clipboard tool \`${binary}\``
      }
    }
    return undefined
  }
  if (toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write') {
    const text = input.content ?? input.new_string
    if (typeof text === 'string' && hasOsc52(text)) {
      return 'content writes an OSC-52 clipboard escape sequence'
    }
  }
  return undefined
}

export const check = (payload: ToolCallPayload) => {
  const reason = clipboardViolation(payload)
  if (!reason) {
    return undefined
  }
  if (
    payload.transcript_path &&
    bypassPhrasePresent(payload.transcript_path, BYPASS_PHRASE)
  ) {
    return undefined
  }
  return block(
    [
      '[no-clipboard-access-guard] Blocked: clipboard access',
      '',
      `  ${reason}.`,
      '',
      '  The system clipboard is a cross-process exfil + overwrite surface;',
      '  fleet tooling never needs it. A secret copied there leaks to every',
      '  app, and an OSC-52 escape can silently overwrite or read it.',
      '',
      `  If you genuinely need clipboard access, type the phrase in a new`,
      `  message: ${BYPASS_PHRASE}`,
    ].join('\n'),
  )
}

export const hook = defineHook({
  check,
  event: 'PreToolUse',
  matcher: ['Bash'],
  triggers,
  type: 'guard',
})
await runHook(hook, import.meta.url)
