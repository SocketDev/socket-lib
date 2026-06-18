# Cascaded fleet hook + shared-module catalog

Reference catalog for the fleet hooks, `_shared` helpers, oxlint rules, and
reminder family that cascade byte-identical to every fleet repo via the
directory entries in `scripts/repo/sync-scaffolding/manifest/identical-files.mts`
(`.claude/hooks/fleet`, `.config/oxlint-plugin/fleet`, `scripts/fleet`, …). These
are NOT per-array-element annotations — each item below ships via its parent
directory mirror, not its own `IDENTICAL_FILES` entry. This catalog lives here
(not inline) so the manifest stays under the file-size cap; edit it when adding
or changing a cascaded hook/rule.

## Hook config + `_shared` helpers

- **Claude Code hook config** — wires every fleet hook into its lifecycle event.
  NOT byte-copied (settings.json is handled by `checks/settings-merge.mts` as a
  partial-canonical file): the fleet portion comes from the template's
  settings.json, but each fleet repo can additionally wire `hooks/repo/<name>/`
  entries via the per-hook `hook.json` declaration. The fixer merges template +
  repo declarations so cascades don't clobber local hook wiring. See
  `cascade-preserve-repo-hook-wiring.md`.
- **`hooks/_shared`** — helpers consumed by multiple Bash-tool hooks:
  - `fleet-repos.mts` — single source of fleet membership (the broad
    pushable/importable set, wider than the cascade roster). Shared by
    cross-repo-guard + no-non-fleet-push-guard so the two can't drift on which
    repos count as "ours". Exports `FLEET_REPO_NAMES` + `isFleetRepo()` +
    `slugFromRemoteUrl()`.
  - `shell-command.mts` — AST-ish shell parser (wraps shell-quote) shared by the
    structure-sensitive Bash guards. Replaces regex command detection so
    `$var`/eval/`$(…)` indirection is seen, not evaded. shell-quote is a
    fleet-wide catalog devDep (resolves from root node_modules, the ancestor
    every hook + _shared walks up to).
  - `transcript.mts` — centralizes `readStdin()` + the JSONL user-turn parser (3
    shape variants) used by every hook that needs the `Allow <X> bypass` phrase
    scan. Before extraction the parser was copy-pasted across no-revert-guard /
    no-fleet-fork-guard / excuse-detector.
  - `foreign-paths.mts` — shared parallel-agent heuristic (`readTouchedPaths` +
    `listForeignDirtyPaths`) used by parallel-agent-on-stop-reminder,
    parallel-agent-staging-guard, and overeager-staging-guard.
  - `payload.mts` — canonical types for the PreToolUse JSON payload (`tool_name`,
    `tool_input`). Provides `ToolCallPayload`, `ToolInput`, and `readCommand` /
    `readFilePath` / `readWriteContent` narrowing helpers. Replaces 7 hand-rolled
    `tool_input` type variants that lived in individual hooks.
  - `hook-env.mts` — `isHookDisabled(slug)` + `hookLog(slug, ...lines)`.
    Standardizes the `SOCKET_<SLUG>_DISABLED` env-var convention plus the
    prefixed-stderr writer hooks have been duplicating by hand.
  - `token-patterns.mts` — canonical catalog of secret-bearing env-var key names.
    Shared by token-guard (Bash) and no-token-in-dotenv-guard (Edit|Write); both
    scan for the same vendor / generic shapes. Categorized by vendor (Socket, LLM
    providers, GitHub, Linear, Notion, AWS, Stripe, etc.) so consumers can opt
    out per category; `ALL_TOKEN_KEY_PATTERNS` is the default union.
  - `wheelhouse-root.mts` — walks up from cwd to find the socket-wheelhouse
    checkout. Used by the user-global wheelhouse-dispatch hook so wheelhouse-only
    hooks (new-hook-claude-md-guard, drift-check-reminder) can fire from any
    fleet-repo session. Must cascade since the dispatcher imports it via the
    resolved wheelhouse path.
  - `stop-reminder.mts` — shared scaffold for the Stop-hook reminder family.
    Provides a `runStopReminder(config)` that handles stdin parse, code-fence
    stripping, pattern sweep, and stderr emit. Must cascade alongside the
    reminder hooks or imports fail at hook startup.
  - `_shared/acorn/` — shared acorn-wasm parser for hooks that need structural
    JS/TS parsing (error-message-quality-reminder relies on `findThrowNew`). The
    `.wasm` blob + bindgen + sync wrapper must cascade as a unit.

## Reminder family (Stop hooks)

Stop hooks that emit informational stderr (never block) when the most-recent
assistant turn matches a pattern. All share `_shared/stop-reminder.mts`. Listed
in `.claude/settings.json` under the Stop block; missing any breaks every Stop
hook in the repo. Members include comment-tone, perfectionist,
parallel-agent-on-stop-reminder, squash-history-reminder,
stale-process-sweeper, sweep-ds-store, auth-rotation-reminder, excuse-detector,
dont-blame-user-reminder (BLOCKING), no-orphaned-staging, dirty-worktree-stop,
dont-stop-mid-queue-reminder, drift-check-reminder, plan-review-reminder,
commit-pr-reminder, pointer-comment-reminder, path-regex-normalize-reminder,
prefer-rebase-over-revert-reminder, public-surface-reminder,
enterprise-push-property-reminder.

## Guards + blockers

The bulk of the catalog is PreToolUse(Edit|Write|Bash) blockers and the few
PostToolUse rewriters. Each names its event, what it blocks, and its bypass
phrase (where one exists):

- **parallel-agent-edit-guard** — PreToolUse(Edit/Write/NotebookEdit) block on
  writing a foreign dirty file (another live agent is editing it).
- **parallel-agent-staging-guard** — PreToolUse(Bash) block on sweep/destructive
  git ops while foreign dirty paths are present.
- **token-guard** — refuses Bash that leaks secrets to stdout (env dumps,
  unredacted `.env` reads, curl with Authorization to raw stdout, literal
  token-shape in command).
- **trust-downgrade-guard** — PreToolUse(Bash + Edit|Write) for any action that
  weakens a supply-chain trust gate (trustPolicy override, minimumReleaseAge=0,
  `--dangerously-*`, dropping blockExoticSubdeps). Bypass: `Allow trust-downgrade bypass`.
- **path-guard** — refuses `.mts`/`.cts` edits that construct a multi-stage build
  path inline or traverse into a sibling package's build output. Pairs with
  `scripts/fleet/check/paths-are-canonical.mts`.
- **paths-mts-inherit-guard** — PreToolUse(Edit|Write) for sub-package
  `scripts/fleet/paths.mts` whose content doesn't `export *` from the nearest
  ancestor. Repo-root exempt. Bypass: `Allow paths-mts-inherit bypass`.
- **plan-location-guard** — PreToolUse(Edit|Write|MultiEdit) for plan-shaped `.md`
  writes to tracked locations; plans belong at `<repo-root>/.claude/plans/`.
  Bypass: `Allow plan-location bypass`.
- **plugin-patch-format-guard** — PreToolUse(Edit|Write) for
  `scripts/fleet/plugin-patches/*.patch`: enforces filename shape, the four
  `# @plugin/@plugin-version/@sha/@description` keys, and a plain `diff -u` body.
- **pull-request-target-guard** — PreToolUse(Edit|Write) for workflow YAML
  combining `pull_request_target` + fork-HEAD checkout + execute-fork-code.
  Bypass: `Allow pr-target-execution bypass`.
- **readme-fleet-shape-guard** — PreToolUse(Edit|Write|MultiEdit) for root
  README.md violating the canonical skeleton. Bypass: `Allow readme-fleet-shape bypass`.
- **workflow-uses-comment-guard** — PreToolUse(Edit|Write) for `uses: <action>@<sha>`
  lines lacking the `# <tag-or-branch> (YYYY-MM-DD)` staleness comment.
- **marketplace-comment-guard** — PreToolUse(Edit|Write) for edits to
  `.claude-plugin/marketplace.json` + sibling README that desync the SHA-pin pair.
- **check-new-deps** — PreToolUse(Edit|Write) refusing new dependency additions
  without a Socket score check.
- **cross-repo-guard** — PreToolUse(Edit|Write) refusing path references to another
  fleet repo (`../<fleet-repo>/…` or `…/projects/<fleet-repo>/…`); import via
  `@socketsecurity/lib/<subpath>` instead.
- **gitmodules-comment-guard** — PreToolUse(Edit|Write) reminder ensuring each
  `[submodule]` has a `# name-version` annotation.
- **lock-step-ref-reminder** — PreToolUse(Edit|Write) breadcrumb for malformed
  `Lock-step` comment shapes + stale opted-in references. Spec:
  `docs/agents.md/fleet/parser-comments.md` §5–6.
- **logger-guard** — PreToolUse(Edit|Write) refusing direct stream writes
  (`process.std{err,out}.write`, `console.*`) in source; suggests `getDefaultLogger()`.
- **no-revert-guard** — PreToolUse(Bash) refusing destructive git
  (checkout/restore/reset/stash/clean) + hook bypasses (--no-verify,
  DISABLE_PRECOMMIT_*, --no-gpg-sign, force-push) unless the canonical
  `Allow <X> bypass` phrase is in a recent user turn.
- **no-ext-issue-ref-guard** — PreToolUse(Bash) refusing commit / `gh` message
  bodies that reference a non-SocketDev `<owner>/<repo>#<num>` (stops upstream spam).
- **no-non-fleet-push-guard** — PreToolUse(Bash) refusing `git push` to a repo not
  in `FLEET_REPO_NAMES`.
- **no-experimental-strip-types-guard** — PreToolUse(Bash) refusing
  `--experimental-strip-types` (stable since Node 22.6, default-on in 24+).
- **prefer-rebase-over-revert-reminder** — PreToolUse(Bash) reminder nudging toward
  `git reset --soft` / `git rebase -i` when `git revert` targets an unpushed commit.
- **no-meta-comments-guard** — PreToolUse(Edit|Write) refusing task/plan/removed-code
  comments (`// Plan:`, `// As requested`, `// removed X`).
- **no-disable-lint-rule-guard** — PreToolUse(Edit|Write) refusing `"rule": "off"`/`"warn"`.
  Bypass: `Allow disable-lint-rule bypass`.
- **extension-build-current-reminder** — PreToolUse(Bash) reminder pairing
  trusted-publisher-extension `src/**` commits with a build. Bypass:
  `Allow extension-build-current bypass`.
- **no-file-scope-oxlint-disable-guard** — PreToolUse(Edit|Write) refusing
  file-scope `oxlint-disable`; forces per-call-site `oxlint-disable-next-line <rule> -- <reason>`.
- **no-underscore-ident-guard** — PreToolUse(Edit|Write) refusing new
  underscore-prefixed identifiers.
- **no-orphaned-staging** — Stop reminder listing staged-uncommitted paths.
- **overeager-staging-guard** — PreToolUse(Bash) refusing `git add` far from a
  commit step. Every repo MUST ship the dir (settings.json `Bash` matcher load contract).
- **private-name-reminder** — PreToolUse(Bash) refusing literal personal identifiers
  (canonical list at `.claude/private-names.json`).
- **new-hook-claude-md-guard** — PreToolUse(Edit|Write) refusing a new
  `.claude/hooks/<name>/index.mts` unless CLAUDE.md cites `(enforced by …)`.
- **no-blind-keychain-read-guard** — PreToolUse(Bash) refusing direct keychain
  READ calls (`security find-generic-password`, `secret-tool lookup`, …). Bypass:
  `Allow blind-keychain-read bypass`.
- **no-empty-commit-guard** — PreToolUse(Bash) refusing `--allow-empty` /
  `--keep-redundant-commits`. Bypass: `Allow empty-commit bypass`.
- **no-token-in-dotenv-guard** — PreToolUse(Edit|Write) refusing a real API token
  in `.env`/`.envrc`. Bypass: `Allow dotenv-token bypass`. Uses
  `_shared/token-patterns.mts`.
- **setup-security-tools** — Stop health-check for broken SFW shims + edition
  mismatches; reports, never auto-installs. Platform-aware token/shim repair
  (macOS Keychain / Linux secret-tool / Windows CredentialManager).
- **setup-firewall / setup-claude-scanners / setup-basics-tools / setup-misc-tools**
  — four scoped install entrypoints importing from the umbrella's `lib/installers.mts`.
- **setup-signing** — detect signing method (1Password SSH agent → `~/.ssh` keys →
  GPG) and configure git commit signing.
- **claude-md-section-size-guard** — PreToolUse(Edit|Write) capping per-`###`-section
  body length in the fleet block (default 8 body lines; override
  `CLAUDE_MD_FLEET_SECTION_MAX_LINES`).
- **claude-md-size-guard** — PreToolUse(Edit|Write) refusing fleet-block edits over 40KB.
- **commit-author-guard** — PreToolUse(Bash) refusing commits whose author email
  drifts from the canonical GitHub identity. Bypass: `Allow commit-author bypass`.
- **commit-message-format-guard** — PreToolUse(Bash) enforcing Conventional Commits
  + banning AI attribution. Bypass: `Allow commit-format bypass` / `Allow ai-attribution bypass`.
- **default-branch-guard** — PreToolUse(Bash) refusing hard-coded `main`/`master` in
  scripting contexts. Bypass: `Allow default-branch bypass`.
- **version-bump-order-guard** — PreToolUse(Bash) refusing `git tag vX.Y.Z` when HEAD
  isn't a bump commit.
- **markdown-filename-guard** — PreToolUse(Edit|Write) refusing non-canonical markdown
  filenames (SCREAMING_CASE allowlist at root/docs/.claude only).
- **no-fleet-fork-guard** — PreToolUse(Edit|Write|MultiEdit) refusing edits to
  fleet-canonical paths in downstream repos. Bypass: `Allow fleet-fork bypass`.
- **release-workflow-guard** — PreToolUse(Bash) refusing `gh workflow run/dispatch`
  against publish/release workflows unless dry-run-verified.
- **scan-label-in-commit-guard** — PreToolUse(Bash) refusing commit bodies with
  scan-report labels (B1/M9/H3/L4). Bypass: `Allow scan-label-in-commit bypass`.

## CLAUDE.md offshoot references

Long-form expansions of the fleet-canonical CLAUDE.md rules live under
`docs/agents.md/fleet/`, which cascades via the `docs/agents.md/fleet` directory
entry (per-file entries redundant — the rm-and-copy dir mirror covers them).
`no-local-fork-canonical.md` is among them (linked by both no-fleet-fork-guard
and the CLAUDE.md fleet block). The old `docs/agents.md/wheelhouse/` tier is
retired (tombstoned in `REMOVED_FILES`); downstream repos may add their own
`docs/agents.md/<repo>/` subdirectory for repo-specific docs.
