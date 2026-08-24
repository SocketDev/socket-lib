# Agent actions go through fleet scripts

Companion to the `### Agent actions go through fleet scripts` rule in
`template/base/CLAUDE.md`. The inline section gives the headline; this file
holds the principle, the why, and the ASK contract.

## The principle

An AI agent performs an action ONLY through the fleet's codified scripts
(`scripts/fleet/*`), hooks, and skills - the scripts ARE the law (see
[`code-is-law`](code-is-law.md)). If no script covers the action, the agent
does NOT improvise a one-off shell command or ad-hoc edit: it surfaces the gap
and ASKs the operator before proceeding. Improvising outside the scripts
bypasses the reviewed, tested, cascaded path and the CI that gates it.

## The why

The fleet's scripts are the canonical, reviewed, tested surface for every
operation the repo depends on (build, bump, cascade, publish, checks, external
tools, changelog). They encode the disciplines `code-is-law` codifies - a
discipline only holds when an executable enforcer makes the wrong move fail. An
agent that improvises around them re-introduces the policy-on-paper state
`code-is-law` exists to end: the action ran, but no enforcer fired, so the next
agent or cascade silently drops or contradicts it.

The ASK contract exists because gaps are real: a new action with no script yet
is not a license to improvise, it is a signal to codify. Surfacing the gap lets
the operator decide whether to add a script (the durable fix) or authorize the
one-off explicitly, a recorded exception rather than a silent shortcut.

## The ASK contract

When the agent reaches a step no fleet script covers:

1. STOP. Do not run an ad-hoc shell command or hand-edit to achieve it.
2. Call out the gap: name the action, the scripts you checked, and why none
   applies.
3. ASK the operator: "No fleet script covers X. Add a script, or authorize
   this one-off?" Wait for the answer.
4. If the operator authorizes the one-off, proceed and note it. If they say
   "add a script," codify the action (a `scripts/fleet/*.mts` entry) so the
   next agent has the law to follow.

## Enforcement

Compliance is behavioral - the agent follows the principle - but the law it
must use is itself enforced: the fleet scripts, hooks, and checks ARE the
codified enforcers, and `scripts/fleet/check/working-tree-is-clean.mts` catches
the abandoned ad-hoc edits that result when an agent improvises and does not
commit. A bypass phrase or `--no-verify` the operator did not type is itself a
violation; the push-protected-branch and bypass-phrase guards block it.
<!-- enforcement: human-review - the agent's compliance is behavioral (use the scripts, ASK on gaps); the scripts + working-tree-is-clean check + the push/bypass guards are the law it must use -->
