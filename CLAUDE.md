# CLAUDE.md

**MANDATORY**: Act as principal-level engineer. Follow these guidelines exactly.

## USER CONTEXT

- Identify users by git credentials; use their actual name, never "the user"
- Use "you/your" when speaking directly; use names when referencing contributions

## PARALLEL CLAUDE SESSIONS - WORKTREE REQUIRED

**This repo may have multiple Claude sessions running concurrently against the same checkout, against parallel git worktrees, or against sibling clones.** Several common git operations are hostile to that and silently destroy or hijack the other session's work.

- **FORBIDDEN in the primary checkout** (the one another Claude may be editing):
  - `git stash` — shared stash store; another session can `pop` yours.
  - `git add -A` / `git add .` — sweeps files belonging to other sessions.
  - `git checkout <branch>` / `git switch <branch>` — yanks the working tree out from under another session.
  - `git reset --hard` against a non-HEAD ref — discards another session's commits.
- **REQUIRED for branch work**: spawn a worktree instead of switching branches in place. Each worktree has its own HEAD, so branch operations inside it are safe.

  ```bash
  # From the primary checkout — does NOT touch the working tree here.
  git worktree add -b <task-branch> ../<repo>-<task> main
  cd ../<repo>-<task>
  # edit, commit, push from here; the primary checkout is untouched.
  cd -
  git worktree remove ../<repo>-<task>
  ```

- **REQUIRED for staging**: surgical `git add <specific-file> [<file>…]` with explicit paths. Never `-A` / `.`.
- **If you need a quick WIP save**: commit on a new branch from inside a worktree, not a stash.

The umbrella rule: never run a git command that mutates state belonging to a path other than the file you just edited.

## PRE-ACTION PROTOCOL

**MANDATORY**: Review CLAUDE.md before any action. No exceptions.

- Before ANY structural refactor on a file >300 LOC: remove dead code first, commit separately
- Multi-file changes: phases of ≤5 files, verify each before the next
- Study existing code before building — working code is a better spec than any description
- Work from raw error data, not theories
- On "yes", "do it", or "go": execute immediately, no plan recap

## VERIFICATION PROTOCOL

1. Run the actual command — execute, don't assume
2. State what you verified, not just "looks good"
3. **FORBIDDEN**: Claiming "Done" when tests show failures
4. Run type-check/lint if configured; fix ALL errors before reporting done
5. Re-read every modified file; confirm nothing references removed items
6. Fix warnings when you find them (lint, type-check, build, runtime) — don't leave them for later

## CONTEXT & EDIT SAFETY

- After 10+ messages: re-read files before editing
- Read files >500 LOC in chunks
- Before every edit: re-read. After every edit: re-read to confirm
- When renaming: search direct calls, type refs, string literals, dynamic imports, re-exports, tests
- Tool results over 50K chars are silently truncated — narrow scope and re-run if results seem incomplete
- For tasks touching >5 files: use sub-agents with worktree isolation

## JUDGMENT PROTOCOL

- Flag misconceptions before executing
- Flag adjacent bugs: "I also noticed X — want me to fix it?"
- **Default to perfectionist mindset**: when you have latitude to choose, pick the maximally correct option — no shortcuts, no cosmetic deferrals. Fix state that _looks_ stale even if not load-bearing. If pragmatism is the right call, the user will ask for it explicitly. "Works now" ≠ "right."

## SCOPE PROTOCOL

- Do not add features or improvements beyond what was asked
- Simplest approach first; flag architectural flaws and wait for approval

## COMPLETION PROTOCOL

- Finish 100% before reporting — never claim done at 80%
- Fix forward, don't revert (reverting requires explicit user approval)
- After EVERY code change: build, test, verify, commit as one atomic unit

## SELF-EVALUATION

- Present two views before calling done: what a perfectionist would reject vs. what a pragmatist would ship — and let the user decide. If the user gives no signal, default to perfectionist: do the fuller fix.
- If a fix fails twice: stop, re-read top-down, state where the mental model was wrong

## SELF-IMPROVEMENT

- After ANY correction: log the pattern to memory so the same mistake is never repeated
- Convert mistakes into strict rules — enforce them

## FILE SYSTEM AS STATE

- Write intermediate results, plans, and status to files in `.claude/` (gitignored)
- Don't hold large analysis in context — write it down, reference it later

## HOUSEKEEPING

- Offer to checkpoint before risky changes
- Flag files >400 LOC for potential splitting

## ERROR MESSAGES

An error message is UI. The reader should be able to fix the problem from the message alone, without opening your source.

Every message needs four ingredients, in order:

1. **What** — the rule that was broken (e.g. "must be lowercase"), not the fallout ("invalid").
2. **Where** — the exact file, line, key, field, or CLI flag. Not "somewhere in config".
3. **Saw vs. wanted** — the bad value and the allowed shape or set.
4. **Fix** — one concrete action, in imperative voice (`rename the key to …`, not `the key was not renamed`).

Length depends on the audience:

- **Library API errors** (thrown from a published package): terse. Callers may match on the message text, so every word counts. All four ingredients often fit in one sentence — e.g. `name "__proto__" cannot start with an underscore` covers rule, where (`name`), saw (`__proto__`), and implies the fix.
- **Validator / config / build-tool errors** (developer reading a terminal): verbose. Give each ingredient its own words so the reader can find the bad record without re-running the tool.
- **Programmatic errors** (internal assertions, invariant checks): terse, rule only. No end user will see it; short keeps the check readable.

Rules for every message:

- Imperative voice for the fix — `add "filename" to part 3`, not `"filename" was missing`.
- Never "invalid" on its own. `invalid filename 'My Part'` is fallout; `filename 'My Part' must be [a-z]+ (lowercase, no spaces)` is a rule.
- On a collision, name **both** sides, not just the second one found.
- Suggest, don't auto-correct. Silently fixing state hides the bug next time.
- Bloat check: if removing a word keeps the information, drop it.
- For allowed-set / conflict lists, use `joinAnd` / `joinOr` from `./arrays` — `must be one of: ${joinOr(allowed)}` reads better than a hand-formatted list.

Caught-value helpers from `./errors` (prefer these over hand-rolled checks):

- `isError(e)` — replaces `e instanceof Error`. Cross-realm-safe (ES2025 `Error.isError` with a shim fallback); catches Errors from worker threads and `vm` contexts that `instanceof` misses.
- `isErrnoException(e)` — replaces `'code' in err` / `typeof err.code === 'string'` guards. Narrows to `NodeJS.ErrnoException` for syscall/libuv failures (`'ENOENT'`, `'EACCES'`, …).
- `errorMessage(e)` — replaces every `e instanceof Error ? e.message : String(e)` and any fallback ending in `'Unknown error'`. Walks the `cause` chain, coerces primitives, and returns the shared `UNKNOWN_ERROR` sentinel when nothing else yields a usable string.
- `errorStack(e)` — cause-aware stack for Errors, `undefined` otherwise. Use with `logger.error(msg, { stack: errorStack(e) })`.

Examples:

- ✗ `Error: invalid config` → ✓ `config.json: part 3 is missing "filename". Add a lowercase filename (e.g. "parsing").`
- ✗ `Error: invalid component` → ✓ `npm "name" component is required`

See `docs/references/error-messages.md` for worked examples and anti-patterns.

## ABSOLUTE RULES

- Never create files unless necessary; always prefer editing existing files
- Forbidden to create docs unless requested
- 🚨 **NEVER use `npx`, `pnpm dlx`, or `yarn dlx`** — use `pnpm exec` or `pnpm run`
- **minimumReleaseAge**: NEVER add packages to `minimumReleaseAgeExclude` in CI. Locally, ASK before adding — the age threshold is a security control.

## DOCUMENTATION POLICY

**Allowed**: `README.md`, `CLAUDE.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/` (max 11 files), `.claude/` (functional only), `*/README.md` for complex subsystems only.

**Forbidden**: Migration/planning docs after completion, redundant guides, docs duplicating code comments, tutorial content, ADRs unless requested. After migrations or major refactors, DELETE planning documents.

## 📚 SHARED STANDARDS

- Commits: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) `<type>(<scope>): <description>` — NO AI attribution
- **Open PRs:** when adding commits to an OPEN PR, ALWAYS update the PR title and description to match the new scope. A title like `chore: foo` after you've added security-fix and docs commits to it is now a lie. Use `gh pr edit <num> --title "..." --body "..."` (or `--body-file`) and rewrite the body so it reflects every commit on the branch, grouped by theme. The reviewer should be able to read the PR description and know what's in it without scrolling commits.
- Scripts: Prefer `pnpm run foo --flag` over `foo:bar` scripts
- Dependencies: After `package.json` edits, run `pnpm install`
- Backward Compatibility: 🚨 FORBIDDEN to maintain — actively remove when encountered
- Work Safeguards: MANDATORY commit + backup branch before bulk changes
- Safe Deletion: Use `safeDelete()` from `@socketsecurity/lib/fs` (NEVER `fs.rm/rmSync` or `rm -rf`)
- HTTP Requests: NEVER use `fetch()` — use `httpJson`/`httpText`/`httpRequest` from `@socketsecurity/lib/http-request`
- File existence: ALWAYS `existsSync` from `node:fs`. NEVER `fs.access`, `fs.stat`-for-existence, or an async `fileExists` wrapper. Import form: `import { existsSync, promises as fs } from 'node:fs'`.
- `Promise.race` / `Promise.any`: NEVER pass a long-lived promise (interrupt signal, pool member) into a race inside a loop. Each call re-attaches `.then` handlers to every arm; handlers accumulate on surviving promises until they settle. For concurrency limiters, use a single-waiter "slot available" signal (resolved by each task's `.then`) instead of re-racing `executing[]`. See nodejs/node#17469 and `@watchable/unpromise`. Race with two fresh arms (e.g. one-shot `withTimeout`) is safe.

---

## EMOJI & OUTPUT STYLE

**Terminal symbols** (from `@socketsecurity/lib/logger` LOG_SYMBOLS): ✓ (green), ✗ (red), ⚠ (yellow), ℹ (blue), → (cyan). Color the icon only, not the message. Use `yoctocolors-cjs` (not ESM `yoctocolors`). Avoid emoji overload.

---

## 🏗️ LIB-SPECIFIC

### Architecture

Core infrastructure library for Socket.dev security tools.

- **Internal imports**: Relative paths (e.g., `'../constants/packages'`). Path aliases are intentionally avoided.
- **Vendored externals**: `cacache`, `make-fetch-happen`, `fast-sort`, `pacote`, `adm-zip`, `tar-fs`, `picomatch` live in `src/external/` and are remapped via `tsconfig.json` `paths`. Import them by bare package name.

### Commands

- **Build**: `pnpm build` | **Watch**: `pnpm run dev`
- **Test**: `pnpm test` | **Coverage**: `pnpm run cover`
- **Check**: `pnpm run check` (tsgo type check)
- **Lint**: `pnpm run lint` (oxlint) | **Fix**: `pnpm run fix` (oxfmt)
- **Clean**: `pnpm run clean`

## Agents & Skills

- `/security-scan` — AgentShield + zizmor security audit
- `/quality-scan` — comprehensive code quality analysis
- `/quality-loop` — scan and fix iteratively
- Agents: `code-reviewer`, `security-reviewer`, `refactor-cleaner` (in `.claude/agents/`)
- Shared subskills in `.claude/skills/_shared/`
- Pipeline state in `.claude/ops/queue.yaml`

### Code Quality Tools

- **Linting**: oxlint v1.52+ with `.oxlintrc.json`. Inline disable: `// oxlint-disable-next-line rule-name`
- **Formatting**: oxfmt v0.37+ with `.oxfmtrc.json` (Prettier v3.8 compatible, semi, single quotes, 2-space, 80 width, trailing commas)

### Build System

- TypeScript → CommonJS (ES2022) via esbuild; types via tsgo (TypeScript Native Preview)
- Output: `dist/`
- Build scripts: all in `scripts/` as `.mjs`. Shell scripts (`.sh`) FORBIDDEN.
- **Main build** (`pnpm build`): clean → build source + types + externals in parallel → fix exports

### Code Style

- **Files**: `.ts` source, `.d.ts` types, kebab-case, MANDATORY `@fileoverview` header
- **Imports**: MANDATORY `node:` prefix; order: node built-ins → external → `@socketsecurity/*` → internal relative → type imports (separate). Blank lines between groups, alphabetical within.
- **Semicolons**: OMIT
- **Types**: FORBIDDEN `any` — use `unknown` or specific types. Always separate `import type` from runtime imports.
- **Null-prototype objects**: `{ __proto__: null, ...props }`
- **Exports**: Named only. `export default` FORBIDDEN (breaks dual CJS/ESM). Enforced by oxlint `no-default-export` + build + CI validation.
- **Function order**: Files with 3+ exports require alphabetical ordering — private first (alphabetical), then exported (alphabetical). Constants/types before functions.

### 1 path, 1 reference

**A path is _constructed_ exactly once. Everywhere else _references_ the constructed value.**

Referencing a single computed path many times is fine — that's the whole point of computing it once. What's banned is _re-constructing_ the same path in multiple places, because that's where drift is born.

- **Within a package**: every script imports its own `scripts/paths.mts` (or `lib/paths.mts`). No `path.join('build', mode, ...)` outside that module.
- **Across packages**: when package B consumes package A's output, B imports A's `paths.mts` via the workspace `exports` field. Never `path.join(PKG, '..', '<sibling>', 'build', ...)`.
- **Workflows, Dockerfiles, shell scripts**: they can't `import` TS, so they construct the string once and reference it everywhere downstream. Workflows: a "Compute paths" step exposes `steps.paths.outputs.final_dir`; later steps read `${{ steps.paths.outputs.final_dir }}`. Dockerfiles/shell: assign once to a variable / `ENV`, reference by name thereafter. Each canonical construction carries a comment naming the source-of-truth `paths.mts`. **Re-building** the same path in a second step is the violation, not referring to the constructed value many times.
- **Comments**: may describe path _structure_ with placeholders ("`<mode>/<arch>`") but should not encode a complete literal path string. The import statement IS the comment.

Code execution takes priority over docs: violations in `.mts`/`.cts`, Makefiles, Dockerfiles, workflow YAML, and shell scripts are blocking. README and doc-comment violations are advisory unless they contain a fully-qualified path with no parametric placeholders.

**Three-level enforcement:**

- **Hook** — `.claude/hooks/path-guard/` blocks `Edit`/`Write` calls that would introduce a violation in a `.mts`/`.cts` file at edit time.
- **Gate** — `scripts/check-paths.mts` runs in `pnpm check`. Fails the build on any violation that isn't allowlisted in `.github/paths-allowlist.yml`.
- **Skill** — `/path-guard` audits the repo and fixes findings; `/path-guard check` reports only; `/path-guard install` drops the gate + hook + rule into a fresh repo.

The mantra is intentionally short so it sticks: **1 path, 1 reference**. When in doubt, find the canonical owner and import from it.

### Inclusive Language

Use precise, neutral terms over historical metaphors that imply hierarchy or exclusion. The substitutes are not euphemisms — they're more _accurate_ (a list of allowed values genuinely is an "allowlist"; "whitelist" is a metaphor that hides what the list does).

| Replace                          | With                                                |
| -------------------------------- | --------------------------------------------------- |
| `whitelist` / `whitelisted`      | `allowlist` / `allowed` / `allowlisted`             |
| `blacklist` / `blacklisted`      | `denylist` / `denied` / `blocklisted` / `blocked`   |
| `master` (branch, process, copy) | `main` (branch); `primary` / `controller` (process) |
| `slave`                          | `replica`, `worker`, `secondary`, `follower`        |
| `grandfathered`                  | `legacy`, `pre-existing`, `exempted`                |
| `sanity check`                   | `quick check`, `confidence check`, `smoke test`     |
| `dummy` (placeholder)            | `placeholder`, `stub`                               |

Apply across **code** (identifiers, comments, string literals), **docs** (READMEs, CLAUDE.md, markdown), **config files** (YAML, JSON), **commit messages**, **PR titles/descriptions**, and **CI logs** you control.

Two exceptions where the legacy term must remain (because changing it breaks something external):

- **Third-party APIs / upstream code**: when interfacing with an external API field literally named `whitelist`, keep the field name; rename your local variable. E.g. `const allowedDomains = response.whitelist`.
- **Vendored upstream sources**: don't rewrite vendored code (`vendor/**`, `upstream/**`, `**/fixtures/**`). Patch around it if needed.

When you encounter a legacy term during unrelated work, fix it inline — don't defer.

### Sorting

Sort lists alphanumerically (literal byte order, ASCII before letters). Apply this to:

- **Config lists** — `permissions.allow` / `permissions.deny` in `.claude/settings.json`, `external-tools.json` checksum keys, allowlists in workflow YAML.
- **Object key entries** — sort keys in plain JSON config + return-shape literals + internal-state objects. (Exception: `__proto__: null` always comes first, ahead of any data keys.)
- **Import specifiers** — sort named imports inside a single statement: `import { encrypt, randomDataKey, wrapKey } from './crypto.mts'`. Imports that say `import type` follow the same rule. Statement _order_ is the project's existing convention (`node:` → external → local → types) — that's separate from specifier order _within_ a statement.
- **Method / function source placement** — within a module, sort top-level functions alphabetically. Convention: private functions (lowercase / un-exported) sort first, exported functions second. The first-line `export` keyword is the divider.
- **Array literals** — when the array is a config list, allowlist, or set-like collection. Position-bearing arrays (e.g. argv, anything where index matters semantically) keep their meaningful order.

When in doubt, sort. The cost of a sorted list that didn't need to be is approximately zero; the cost of an unsorted list that did need to be is a merge conflict.

### Package Exports

All modules exported via `package.json` exports field. When adding modules, update exports or run `scripts/generate-package-exports.mjs`.

### Testing

**Framework**: Vitest (shared config from socket-registry, main config: `.config/vitest.config.mts`)

- Test files in `test/`, naming matches source
- 🚨 **NEVER use `--` before test paths** — runs all tests
- NEVER write source-code-scanning tests — verify behavior with real function calls

### CI Integration

Custom pipeline in `.github/workflows/ci.yml`: separate lint job (runs once), build caching (build once, artifacts shared), parallel execution, matrix tests Node 20/22/24 x Ubuntu/Windows. Single `ci-success` job for branch protection.

### Environment Variables

Access via typed getter functions in `src/env/`. Each module exports a pure getter. Test rewiring via `src/env/rewire.ts` (`setEnv`, `clearEnv`, `resetEnv`) without modifying `process.env`.

### Working Directory

🚨 **NEVER** use `process.chdir()` — pass `{ cwd }` options and absolute paths.
