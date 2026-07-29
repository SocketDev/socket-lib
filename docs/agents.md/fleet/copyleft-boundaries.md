# Copyleft boundaries

A copyleft upstream — AGPL, GPL, and their variants — may be **run** and
**observed**. Its implementation may never be **read**. That single line is the
whole rule; everything below is how the fleet makes it hold without relying on
anyone remembering it.

## Run yes, observe-tests yes, read-implementation never

- **Run it.** Executing a copyleft binary as a tool creates no derivative work.
  A scanner can shell out to it, diff its output, and gate on its exit code.
- **Observe it through its own tests.** A project's test suite and its fixture
  data describe *behavior*: which inputs it flags, which it does not. Reading
  those to build a coverage oracle — "do we detect everything they detect?" — is
  observation, not derivation.
- **Never read the implementation.** The detection tables, the regexes, the
  algorithms, the source files that produce the behavior. Reading them to write
  fleet code makes the fleet code a derivative work.

## Why derivation flips the license

Copyleft licenses attach to derived works, not to users. Running an AGPL tool
leaves the caller unaffected. Copying its detection table into a package, or
writing a new table *from* that table, makes the package a work derived from
AGPL source — and the AGPL then governs the package's own distribution terms.
For a published library that is not a licensing footnote, it is a
relicensing event forced on every downstream consumer.

The asymmetry is what makes this a guard rather than a guideline. Reading is
cheap, reversible-looking, and invisible in a diff; the consequence lands months
later at publish time, on a package nobody remembers the provenance of. So the
read is blocked at the moment it is attempted.

The motivating posture is `@socketsecurity/scan-patterns`: it pins
trufflesecurity/trufflehog (AGPL-3.0) as a **coverage oracle** behind a
tests-only sparse checkout, and derives its actual secret-detection tables from
gitleaks (MIT). Same domain, two upstreams, two very different relationships.

## The roster is the single source of truth

`.claude/hooks/fleet/_shared/copyleft-upstreams.mts` holds every copyleft
upstream and the one matcher that classifies a path, a URL, or a command. The
write-time guard and both commit-time belts import it, so they cannot drift
apart.

Each entry records:

| Field | Meaning |
| --- | --- |
| `owner` / `repo` | The GitHub slug; `repo` is also the `upstream/<repo>` submodule dir. |
| `spdx` | The **pinned expectation** — the license the guard enforces against. |
| `purl` | Versionless package URL, the identity Socket's license data is keyed by. |
| `verifiedVersion` | The version at which `spdx` was last confirmed. |
| `testPathPatterns` | The observable slice. Keep it tight. |
| `permissiveAlternative` | Where to derive from instead, when one is known. |

## Adding an upstream

1. **Verify the SPDX id twice.** Read it from the upstream repo's own `LICENSE`
   (`gh api repos/<owner>/<repo> --jq .license.spdx_id`), then corroborate it
   against Socket's license data for the purl. Never record a license from
   memory or from a package-index summary.
2. **Resolve the exact purl.** Confirm it actually returns an artifact before
   recording it — a purl that resolves to nothing makes the watchdog silently
   vacuous. Go modules keep their major-version suffix and a `v`-prefixed
   version: `pkg:golang/github.com/<owner>/<repo>/v3@v3.96.0`.
3. **Write the narrowest `testPathPatterns` that cover the suite.** Too broad
   re-opens the implementation; too narrow only costs an explicit bypass.
4. **Add the repo name to the guard's `triggers` array.** It is parsed
   statically out of the source, so it cannot be computed from the roster; a
   test asserts every roster entry appears there.
5. **Record the permissive alternative** if the fleet has one.

## The pinned SPDX is the contract; Socket's data is the watchdog

`spdx` is what the guard enforces. It is a pin, and pins go stale:
**trufflehog itself relicensed GPL-2.0 to AGPL-3.0 at v3.0.** An upstream that
changes license under a pin is the failure mode that poisons a derivation months
after the fact.

`copyleft-licenses-are-current.mts` is the standing watchdog. It reads Socket's
`LicenseDetails` for each entry's purl — `spdxDisj` in disjunctive normal form,
with a `match_strength` confidence and an `errorData` field — at two versions:
the recorded `verifiedVersion` as a regression anchor, and the upstream's newest
GitHub release tag as the drift probe, so a relicense surfaces the day it ships
rather than whenever someone next bumps a pin.

It is **offline-safe by contract**. No token, no network, an API error, an
unresolved purl, an empty payload, a `match_strength` below the floor, or a
non-empty `errorData` all yield UNVERIFIED — a loud notice, exit 0. It never
fails closed on connectivity and never reports a silent pass as if it had
verified something. Only a confident reading that disagrees with the pin fails
the gate, and the failure names both values. It runs on the release/CI tier via
`releaseStep`, so the interactive loop stays offline.

**A relicensing event means re-evaluating every derivation from that upstream**,
not just editing the pin. Update `spdx` and `verifiedVersion`, then go find what
was built while the old license was believed to apply.

## The tests-only sparse recipe

Materialize a copyleft upstream with its cone restricted to the observable
slice, so the implementation is never on disk to be read by accident:

```sh
git -C upstream/<repo> sparse-checkout set --no-cone \
  '**/*_test.go' '**/testdata/**' \
  'AUTHORS*' 'CONTRIBUTORS*' 'COPYING*' 'LICENSE*' 'NOTICE*' 'README*'
```

`copyleftSparseRecipe()` generates this line from the roster entry, and both the
guard's Fix line and the belt's remediation print that generated string — the
command an operator is handed is provably the command the matcher accepts.

Widening that cone is itself blocked: `git sparse-checkout disable` and
`reapply` are refused outright on a copyleft submodule, and `set` / `add` are
refused for any pattern not on the allowlist. Once the cone is wide, every later
read looks like an ordinary local file, so the cone is the real perimeter.

## Enforcement

- `.claude/hooks/fleet/no-copyleft-source-read/` — PreToolUse, blocks Read of an
  off-allowlist `upstream/<repo>/…` path; a Grep/Glob scope not confined to the
  tests slice; `gh api repos/<o>/<r>/contents/…` for a non-test path; a
  `curl`/`wget` of a raw blob, file view, or whole-tree archive; a `git
  show`/`cat-file`/`archive` of a non-test blob; a cone-widening `git
  sparse-checkout`; and a WebFetch of the same URLs. Bypass:
  `Allow copyleft-source-read bypass`.
- `scripts/fleet/check/copyleft-slices-are-tests-only.mts` — commit-time belt.
  Per copyleft submodule present: no non-test sparse pattern, no materialized
  non-test file, no tracked file citing it as a derivation source. Vacuous pass
  when the repo pins no copyleft upstream.
- `scripts/fleet/check/copyleft-licenses-are-current.mts` — release/CI-tier
  license watchdog described above.
