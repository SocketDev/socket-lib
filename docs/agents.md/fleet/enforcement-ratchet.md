# Enforcement ratchet

The operator should not be the enforcement mechanism. Every rule an agent has to
be *reminded* of is a rule that wants a gate.

This is the backlog for getting there. It is not doctrine to read once - it is a
worklist, and a row leaves it only when the "enforces it today" column names
something that runs on its own.

## Why rows exist at all

`codifying-footguns` shipped with an over-long description, no catalog entry, and
a citation to a script members did not have. All three were already gated. None
of the gates ran until `check --all`, long after authoring.

That is the shape of most rows below: **the rule exists, the gate exists, and
nothing runs it at the moment the mistake is made.** Closing a row usually means
moving an existing check earlier, not writing a new rule.

## Adding an artifact

| Track | Enforces it today | Gap |
| --- | --- | --- |
| hooks (guard / nudge) | `hook-names-are-accurate`, `hook-main-is-entrypoint-guarded`, `hook-verdicts-are-typed`, `hooks-have-no-guard-nudge-overlap`, `hook-dirs-are-not-husks`, `guard-blocks-are-pithy`, `fleet-artifacts-are-complete` | - |
| `-at-edit` / `-at-commit` twins | `twin-enforcers-are-paired` | naming law is not checked at creation |
| lint rules (oxc + markdownlint) | `fleet-artifacts-are-complete`, oxlint plugin wiring in pre-commit | no per-rule test floor |
| skills | `skills-are-well-formed`, `skill-system-is-coherent`, `skill-delegations-resolve`, `mutating-skills-have-model` | the catalog budget is shared, so one long description costs every member |
| agents | `agents-are-well-formed`, `agents-have-rule-citations`, `agent-offload-routes-are-declared` | - |
| rules | `claude-md-rules-are-enforced`, `rule-citations-are-generic-at-commit` | - |
| output styles | `output-styles-are-well-formed` | - |

`artifact-gates.mts` maps each kind to the gates above (6 kinds, 18 gates), and
`artifact-gates-are-real` fails on a dangling gate name or an uncovered kind.
`artifact-gates-on-stop` runs the mapped gates at turn-end and refuses the stop
while any are red, so a malformed artifact no longer reaches the next session.

## Standards a new artifact must meet

| Track | Enforces it today | Gap |
| --- | --- | --- |
| test coverage floor | `fleet-artifacts-are-complete` for a part plus a test, `entry-scripts-are-born-tested`, `features-are-complete` | "has a test file" is not "is covered" |
| reproducibility / determinism | `no-module-eval-side-effects`, `no-top-level-await` | no gate on time, random or iteration-order dependence |
| reach for socket-lib first | the `prefer-*` oxlint family (`prefer-safe-delete`, `prefer-async-spawn`, `prefer-lib-predicates`, ...) | grows one rule at a time, reactively |
| comment discipline | `no-meta-comments-guard`, `terse-lint-disable-reason`, `max-comment-block-lines` | restating the obvious is not mechanically detectable; still operator-caught |

## Operating the fleet

| Track | Enforces it today | Gap |
| --- | --- | --- |
| commit + push as you go | `land-as-you-go-nudge`, `unpushed-main-nudge`, `commit-paths-are-named-guard` | the nudges are advisory; only the sweep is blocked |
| admin on a member, push to main | `push-admin.mts` probe, `fleet-admin` repo mode | the probe is not cached across sessions |
| avoiding `index.lock` | `git-lock-retry.mts`, `commit-paths.mts` (isolated index) | not every writer routes through them |
| faster GHCR publishing | `ghcr-publish.yml`, `fetch-fleet-pack.mts`, launcher and statusline prebuilt caches | no budget gate on publish wall-clock |
| releases and tags via workflows | `release-pipeline.mts`, `publish-pipeline.mts`, `github-release.yml` | the human 2FA gate is unavoidable; nothing else should be manual |
| build speed (c/c++, go, rust, ts) | per-toolchain caches in the setup actions | no measured budget, so a regression is invisible |
| disk pressure from sweeps | `safeDelete`, `prune-actions-caches` | no preflight free-space check |
| small git history | the `--thin` untrack set, `thin-untracks-are-recoverable`, the `fleet-pack` ignore block | no gate on committing a generated artifact |
| onboarding a repo lock-step | `onboard-pipeline.mts`, `sync-scaffolding` | onboarding does not fail on an unconverted process |
| codifying as you go | `codifying-disciplines`, `codifying-footguns`, `code-as-law-nudge` | the nudge fires; nothing verifies the artifact landed |

## How to close a row

1. Name the mistake as a property a machine can check.
2. Find the existing gate. Most rows already have one, so prefer moving it
   earlier over writing a second one.
3. A new artifact goes through the same narrow path as any other: the kind's
   gates in `artifact-gates.mts` apply to it too.
4. Clear the gap text when the column is true, not when the work feels done.
