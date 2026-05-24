# socket-lib architecture & tooling

Per-repo CLAUDE.md detail extracted to fit the 40KB whole-file cap. The CLAUDE.md `## 🏗️ Lib-Specific` section keeps the headline invariants; this file is the full surface.

## Architecture

Core infrastructure library for Socket.dev security tools.

- **Internal imports:** relative paths (e.g. `'../constants/packages'`). Path aliases are intentionally avoided.
- **Vendored externals:** `cacache`, `make-fetch-happen`, `fast-sort`, `pacote`, `adm-zip`, `tar-fs`, `picomatch` live in `src/external/` and are remapped via `tsconfig.json` `paths`. Import them by bare package name.

## Commands

- **Build:** `pnpm build` | **Watch:** `pnpm run dev`
- **Test:** `pnpm test` | **Coverage:** `pnpm run cover`
- **Check:** `pnpm run check` (tsgo type check)
- **Lint:** `pnpm run lint` (oxlint) | **Fix:** `pnpm run fix` (oxfmt)
- **Clean:** `pnpm run clean`

## Code quality tools

- **Linting:** oxlint v1.52+ with `.oxlintrc.json`. Inline disable: `// oxlint-disable-next-line rule-name`
- **Formatting:** oxfmt v0.37+ with `.oxfmtrc.json` (Prettier v3.8 compatible, semi, single quotes, 2-space, 80 width, trailing commas)

## Build system

- TypeScript → CommonJS (ES2022) via esbuild; types via tsgo (TypeScript Native Preview).
- Output: `dist/`
- Build scripts: all in `scripts/` as `.mts`. Shell scripts (`.sh`) FORBIDDEN.
- **Main build** (`pnpm build`): clean → build source + types + externals in parallel → fix exports.

## Package exports

All modules exported via `package.json` exports field. When adding modules, update exports or run `scripts/fix/generate-package-exports.mts`.

## Testing

**Framework:** Vitest (shared config from socket-registry, main config: `.config/vitest.config.mts`).

- Test files in `test/`, naming matches source.
- 🚨 **NEVER use `--` before test paths** — runs all tests.
- NEVER write source-code-scanning tests — verify behavior with real function calls.

🚨 **Vitest OOM with no per-test failure → infinite stream, not cumulative memory.** `FATAL ERROR: Ineffective mark-compacts near heap limit` + `tests 0ms`: one test is spinning. Top culprit: `Readable` with `this.push(undefined)` (only `null` ends the stream). Bisect with `pnpm exec vitest -t '<describe>'` **before** splitting files or raising heap. See `test/isolated/http-request-advanced-2.test.mts` for the canonical example.

## CI integration

Custom pipeline in `.github/workflows/ci.yml`: separate lint job (runs once), build caching (build once, artifacts shared), parallel execution, matrix tests Node 20/22/24 × Ubuntu/Windows. Single `ci-success` job for branch protection.

## Environment variables

Access via typed getter functions in `src/env/`. Each module exports a pure getter. Test rewiring via `src/env/rewire.ts` (`setEnv`, `clearEnv`, `resetEnv`) without modifying `process.env`.

## Working directory

🚨 **NEVER** use `process.chdir()` — pass `{ cwd }` options and absolute paths.
