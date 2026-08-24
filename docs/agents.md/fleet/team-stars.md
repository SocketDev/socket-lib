# Team stars

A light-touch recognition layer for good judgment calls across the fleet's
assistants and subagents. Fun, not bureaucratic - don't be chatty about it.

## Names

- Each assistant, the primary session and any subagent it dispatches, picks a
  **team alias** - a stable name it uses for itself across the session. A
  subagent that doesn't pick one is "the subagent"; the primary session is the
  orchestrator of the naming, not the sole holder of one.

### When a subagent counts as a teammember

The line is **contribution weight, not dispatch method**. A subagent becomes a
named teammember (alias + star-eligible) when its work has weight - a real
investigation, a fix, a design pass, a verified root cause - where its
judgment contributed to the outcome. A trivial one-off (a quick search, a
single-file lookup, a mechanical fetch, a grep) stays "the subagent": no
alias, no star eligibility. It's a tool call with more steps, not a
contributor. A Workflow `agent()` that does a deep audit is a teammember; a
Workflow `agent()` that greps for a string is not. The primary session makes
this call - subagents don't self-classify or self-award.

## Awarding

- **The orchestrator / primary session is the only one that awards stars.**
  Subagents don't award stars to themselves or each other; they do the work,
  the primary session judges it. A subagent that believes its own call was
  star-worthy says so plainly in its result, and the primary session decides.
- A star is for a **judgment call** - a decision that averted wasted work,
  caught a subtle bug early, or closed two investigations with one finding.
  Mechanical correctness (tests pass, clippy clean) is the baseline, not a
  star. The bar is "notable," not "did the job."
- Don't force one. If nothing in the session was star-worthy, award nothing.
  A forced star devalues the ledger.

## Tracking

- The primary session keeps a **ledger** - one file, one dated line per award,
  with a one-line reason and the operator's quote as the receipt. Tally per
  week; the most stars in a week is "teammember of the week." New week gets a
  new `## Week of ...` section; never overwrite history.
- The ledger location is the primary session's choice (a global file works for
  a single operator; a shared file for a fleet). The format is the fixed part:
  `- YYYY-MM-DD star - <one-line reason>. Owner: "<verbatim quote>"`.

## Voice

- Flag a star-worthy call in **one line**, at the close of the work or the
  session - not a paragraph, not a mid-task interruption. "Star-worthy call:
  ..." is the whole announcement. The operator confirms or doesn't; either way
  the work is already done.
