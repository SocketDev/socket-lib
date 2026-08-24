# Fix forward, not revert

Before reaching for a revert (`git checkout`, `git restore`, `git reset` to
discard work), **try fix forward first** - edit the file to the desired state
instead of discarding it. Reversion is the last resort, never the first.

## The rule

- **Fix forward is the first resort.** A stale file, a wrong edit, a half-applied
  change - edit it to the correct state. Discarding tracked work via
  `git checkout/restore/reset` loses context + can silently revert another
  session's newer work.
- **The revert bypass is break-glass, not a default move.** `no-revert-guard`
  (PreToolUse) blocks `git checkout/clean/reset/restore/rm/stash` that
  discard tracked work. The bypass is `Allow revert bypass` (or
  `Allow stale-tree bypass` for the stale-tree-clobber case), typed by the
  human - but reaching for it is an emergency escape, not a shortcut around a
  forward path you haven't tried yet. Exhaust the forward fix first, every
  time, even outside a fleet repo.
- **"unrelated histories" on a shallow clone is not a reason to reset.** A
  `git reset --hard <target>` that would fail with "unrelated histories" (a
  shallow clone's fetch boundary looks disconnected from the new remote tip)
  reconciles forward with `git fetch --unshallow` then `git merge --ff-only` -
  no bypass, no discarded work, same end state. `no-revert-guard`'s block
  message says this for any `reset --hard <target>`, fleet repo or not.
- **The stale-tree case.** When a concurrent session lands a newer version of a
  file, the working tree goes stale. `stale-tree-clobber-guard` blocks
  committing the stale version (a silent revert). The forward fix is to take
  HEAD's version + land your real change on top - not to discard the stale copy.

## Why

A revert discards work + context. The next session re-derives the same state
from a cold start. Fixing forward - editing to the desired state - preserves the
context that made the fix cheap. The `no-revert-guard` +
`stale-tree-clobber-guard` enforce this; this rule codifies the intent: **try
fix forward before the guard blocks, not after.**

Related: [`worktree-hygiene`](worktree-hygiene.md),
[`parallel-claude-sessions`](parallel-claude-sessions.md).
