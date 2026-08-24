# Twin enforcers

A policy worth enforcing twice is enforced twice on purpose. An oxlint rule or
a Claude hook catches it while the edit is being made; a check re-scans
committed source for whatever was written before the guard existed, or landed
around it. Neither replaces the other. The guard cannot see a file that arrived
outside the Claude path, and the check cannot stop a mistake before it is
written.

## The naming law

A twin family shares one base, and the suffix says when the enforcer runs.

```text
<base>-at-edit      the oxlint rule or Claude hook, while the edit happens
<base>-at-commit    the check, over what is already committed
```

Nothing else in the name differs. `paths-are-normalized-before-match-at-edit`
and `paths-are-normalized-before-match-at-commit` are the worked example.

## Why the name and not a declaration

The relationship used to live in prose. Each check's header named its
counterpart in whatever phrasing its author reached for: "point-of-use",
"edit-time twin is", "write-time twin", "predicate from the `...` hook". That
does not survive contact.

Reading it back is unreliable. A reworded comment silently unpairs a family,
and a header carrying an `oxlint-disable` line for an unrelated rule reads as a
twin declaration. A scan over the fleet's checks recovered 5 families out of
roughly 14 that actually exist, and one of the 5 was a false pair.

More to the point, the prose only helps a reader who already found one half.
`normalize-path-before-match` and `paths-are-normalized-before-match` read as
unrelated enforcers, so finding either told you nothing about the other, and a
change to one left the other stale. That is how a suppression regex kept
matching a rule name that no longer existed.

The name is the one declaration that cannot drift from itself, so the name
carries the pairing. `check/twin-enforcers-are-paired.mts` derives the families
structurally and fails when one half has no twin.

## Migrating a family

Pick the base, rename both halves to it, and expect three couplings a file
rename does not show you:

1. **A check that suppresses on its twin's disable comment** matches that
   comment by rule name. Rename the comments without the regex and every
   annotated call site silently un-suppresses.
2. **A rule's `RuleTester` arm enables the rule by bare name.** Miss it and the
   test lints with a rule that no longer exists, so every invalid case finds
   nothing and passes for the wrong reason.
3. **A hook rename reaches further than a rule's.** The directory is a
   workspace package, so the lockfile moves too, and the dispatch table plus
   the snapshot chain have to be rebuilt: `build-hook-bundle.mts`, then
   `build-hook-snapshot.mts`, then `build-snapshot-launcher.mts`. The launcher
   prefers the pinned snapshot blob over every other path, so skipping the
   rebuild leaves hooks executing the old routing while the source tree looks
   correct.

Families still to migrate are listed in
`scripts/fleet/constants/twin-enforcer-migration.json`. The list only shrinks:
an entry whose family has been renamed is reported as stale, so it cannot
outlive the work.

| edit-time | commit-time |
| --- | --- |
| `config-refs-are-segregated-at-edit` | `config-refs-are-segregated-at-commit` |
| `gitignore-is-single-file-at-edit` | `gitignore-is-single-file-at-commit` |
| `golden-fixtures-are-named-golden-at-edit` | `golden-fixtures-are-named-golden-at-commit` |
| `markdown-filenames-are-canonical-at-edit` | `markdown-filenames-are-canonical-at-commit` |
| `upstream-gitlinks-are-absent-at-edit` | `upstream-gitlinks-are-absent-at-commit` |
| `private-paths-are-absent-at-edit`, `socket/no-private-path-in-source` | `private-paths-are-absent-at-commit` |
| `workflow-sha-pins-are-stamped-at-edit`, `socket/workflow-uses-has-stamp` | `workflow-sha-pins-are-stamped-at-commit` |
| `rule-citations-are-generic-at-edit` | `rule-citations-are-generic-at-commit` |
| `error-messages-are-thorough-at-edit` | `error-messages-are-thorough-at-commit` |
| `memories-are-codified-at-edit`, `uncodified-lesson-nudge` | `memories-are-codified-at-commit` |
| `env-kill-switches-are-absent-at-edit` | `env-kill-switches-are-absent-at-commit` |
| `path-regex-normalize-nudge` | `paths-are-normalized-before-match-at-commit` |

Three families already share a base and need only the suffixes:
`fetch-allowlist-is-respected-at-edit` / `fetch-allowlist-is-respected-at-commit`,
`package-manager-auto-update-is-disabled-at-edit` / `package-manager-auto-update-is-disabled-at-commit`,
and `brew-supply-chain-is-hardened-at-edit` / `brew-supply-chain-is-hardened-at-commit`.

## What is not a twin

Two enforcers sharing words in their names are not necessarily one policy, and
pairing them in the naming asserts something false.

`package-manager-auto-update-is-disabled-at-commit` asserts the knob is off **on this
machine**, through env vars, npmrc and chocolatey.config, all outside the repo,
and its twin is the `package-manager-auto-update-is-disabled-at-edit` hook. The rule
`no-package-manager-auto-update-reenable` scans **committed source literals**
for re-enable shapes. Three enforcers, two policies, and only one of them a
twin pair.
