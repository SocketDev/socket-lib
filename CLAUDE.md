# CLAUDE.md

**MANDATORY**: Act as principal-level engineer. Follow these guidelines exactly.

## USER CONTEXT

- Identify users by git credentials; use their actual name, never "the user"
- Use "you/your" when speaking directly; use names when referencing contributions

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

## SCOPE PROTOCOL

- Do not add features or improvements beyond what was asked
- Simplest approach first; flag architectural flaws and wait for approval

## COMPLETION PROTOCOL

- Finish 100% before reporting — never claim done at 80%
- Fix forward, don't revert (reverting requires explicit user approval)
- After EVERY code change: build, test, verify, commit as one atomic unit

## SELF-EVALUATION

- Present two views before calling done: what a perfectionist would reject vs. what a pragmatist would ship
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

## ABSOLUTE RULES

- Never create files unless necessary; always prefer editing existing files
- Forbidden to create docs unless requested
- 🚨 **NEVER use `npx`, `pnpm dlx`, or `yarn dlx`** — use `pnpm exec` or `pnpm run`
- **minimumReleaseAge**: NEVER add packages to `minimumReleaseAgeExclude` in CI. Locally, ASK before adding — the age threshold is a security control.

## DOCUMENTATION POLICY

**Allowed**: `README.md`, `CLAUDE.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/` (max 10 files), `.claude/` (functional only), `*/README.md` for complex subsystems only.

**Forbidden**: Migration/planning docs after completion, redundant guides, docs duplicating code comments, tutorial content, ADRs unless requested. After migrations or major refactors, DELETE planning documents.

## 📚 SHARED STANDARDS

- Commits: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) `<type>(<scope>): <description>` — NO AI attribution
- Scripts: Prefer `pnpm run foo --flag` over `foo:bar` scripts
- Dependencies: After `package.json` edits, run `pnpm install`
- Backward Compatibility: 🚨 FORBIDDEN to maintain — actively remove when encountered
- Work Safeguards: MANDATORY commit + backup branch before bulk changes
- Safe Deletion: Use `safeDelete()` from `@socketsecurity/lib/fs` (NEVER `fs.rm/rmSync` or `rm -rf`)
- HTTP Requests: NEVER use `fetch()` — use `httpJson`/`httpText`/`httpRequest` from `@socketsecurity/lib/http-request`
- File existence: ALWAYS `existsSync` from `node:fs`. NEVER `fs.access`, `fs.stat`-for-existence, or an async `fileExists` wrapper. Import form: `import { existsSync, promises as fs } from 'node:fs'`.

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
