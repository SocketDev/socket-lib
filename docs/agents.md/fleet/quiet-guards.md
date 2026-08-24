# Quiet guards and pithy output

Guard output exists for one reader at one moment: the operator (or agent) who
must act. Anything beyond that is noise that buries the next signal. The
fleet's output budget, by surface:

## The rule

- **Pass-path silence.** A hook that is not blocking prints nothing. No
  success banners, no always-on reminders, no "scanned N files" chatter.
  Recorders write their state file and exit.
- **A nudge is one line.** `[<nudge-name>] <what> - <the one action>`. No
  multi-line "Sanctioned moves" menus, no doctrine paragraphs - the linked
  doc carries the why.
- **A block is at most 3 lines.** `<guard>: <what + why, one line>` (no
  glyph - a -guard verdict already reads as a refusal from its own shape), an
  optional fact line (file/actor/count), `Fix: <one line>` - then the
  dispatcher's own `Bypass:` line. Hooks never re-print, reword, or drop the
  framework's bypass text.
- **A human gate is the one allowed block.** It keeps the 🖐 shape and both
  lanes, but every line is one short line and `Mind:` appears only when a
  restriction shapes the lanes. Detail: [`human-gates`](human-gates.md).
- **Errors are terse.** What happened, then the fix - one short line each.
  The four ingredients stay; the essay goes. Detail:
  [`error-messages`](error-messages.md).
- **A lint message is one line, ≤120 chars.** The rule name carries the
  domain; the message carries the fix.
- **Tests assert identity, not prose.** Error assertions use the error
  class, a `code`, or a short stable token (<60 chars). An exact full-message
  assertion couples the suite to wording and is rewritten on sight.
- **Liveness means the process exists.** A guard that treats another actor
  as live must verify the pid, not only a fresh timestamp - a dead session's
  ledger blocking edits is guard noise of the worst kind (a false block).

## Why

The 15-line guard block was the norm: doctrine paragraphs, lettered menus of
sanctioned moves, the bypass buried at the bottom. Operators skimmed past
them, and the one line that mattered - the fix - sat in line 11. Separately,
`live-edit-collision-guard` blocked an edit on a session whose process had
exited minutes earlier: TTL-only liveness made a dead actor indistinguishable
from a live one. Both defects put the guard's convenience above the
reader's.

## Enforcement

- `scripts/fleet/check/guard-blocks-are-pithy.mts` gates the block shape on
  every hook source: at most 3 content lines beside an optional bypass line, a
  first line naming the hook, one `Fix:` line, and no spacer element, no
  indented tutorial, no em-dash. It reads `template/base/.claude/hooks` in the
  wheelhouse and the live `.claude/hooks` tree in a member, so a cascaded
  mirror is never gated where its fix does not live. The analyzer is
  `scripts/fleet/_shared/guard-block-shape.mts`.
- `test/repo/unit/human-gate.test.mts` locks the gate shape AND the per-line
  budget (160 chars) for every canonical gate.
- Hook tests assert block STRUCTURE (starts with `<hook-name>:`, contains
  `Fix:`, ≤3 lines) or a short stable token, never a full message.
- `socket/no-error-message-assertions` is that rule as lint. In a test file, an
  assertion whose subject is named for a message (`err.message`, `r?.message`,
  `msg`, `block`, `stderr`, …) may not compare against prose: six or more words
  in a pattern, or any multi-word literal under an equality matcher. An error
  CODE, an error TYPE, a verdict kind, and a short labelled token
  (`/^Fix:/`, `/no-tsx-guard:/`) stay legal, because those are the parts of a
  message the contract holds still. Report-only: whether the right replacement
  is the code, the kind, or a token is a judgment a fixer cannot make.
  Measured: one message sweep broke 196 assertions across 68 test files, every
  one of them a quoted sentence.
- `isActorLive` requires a live pid when the ledger carries one
  (`_shared/active-edits-ledger.mts`); a dead-pid ledger is stale regardless
  of TTL.
