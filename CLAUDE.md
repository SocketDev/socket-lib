# CLAUDE.md

**MANDATORY**: Act as principal-level engineer. Follow these guidelines exactly.

## CANONICAL REFERENCE

This is a reference to shared Socket standards. See `../socket-registry/CLAUDE.md` for canonical source.

## 👤 USER CONTEXT

- **Identify users by git credentials**: Extract name from git commit author, GitHub account, or context
- 🚨 **When identity is verified**: ALWAYS use their actual name - NEVER use "the user" or "user"
- **Direct communication**: Use "you/your" when speaking directly to the verified user
- **Discussing their work**: Use their actual name when referencing their commits/contributions
- **Example**: If git shows "John-David Dalton <jdalton@example.com>", refer to them as "John-David"
- **Other contributors**: Use their actual names from commit history/context

## PRE-ACTION PROTOCOL

**MANDATORY**: Review CLAUDE.md before any action. No exceptions.

## VERIFICATION PROTOCOL

**MANDATORY**: Before claiming any task is complete:

1. Test the solution end-to-end
2. Verify all changes work as expected
3. Run the actual commands to confirm functionality
4. Never claim "Done" without verification

## ABSOLUTE RULES

- Never create files unless necessary
- Always prefer editing existing files
- Forbidden to create docs unless requested
- Required to do exactly what was asked

## 📄 DOCUMENTATION POLICY

**Philosophy**: Minimize documentation clutter. Code should be self-documenting; docs should be intentional.

**Allowed documentation files**:

- `README.md` - Project overview, installation, basic usage only
- `CLAUDE.md` - AI assistant instructions
- `SECURITY.md` - Security policy (GitHub standard)
- `CHANGELOG.md` - Version history (auto-generated preferred)
- `docs/` - Concentrated API/usage documentation (10 files max, keep concise)
- `.claude/` - Claude Code commands/skills (functional, not documentation)
- `*/README.md` - Only for plugins/, scripts/, or complex subsystems requiring context

**Forbidden documentation**:

- ❌ Migration plans after migration completes
- ❌ Planning documents after implementation
- ❌ Redundant "getting started" guides
- ❌ Docs duplicating what's in code comments
- ❌ Tutorial content better suited for external blog posts
- ❌ Architecture decision records (ADRs) unless explicitly requested

**Maintenance protocol**:

1. **After completing migrations**: DELETE planning documents (e.g., `MIGRATION_PLAN_*.md`)
2. **After major refactors**: REMOVE implementation plans
3. **Quarterly review**: Audit and remove stale documentation
4. **Before adding docs**: Ask "Can this be a code comment instead?"

**Enforcement**:

- AI assistants MUST NOT create documentation files unless explicitly requested
- Code reviewers should challenge new documentation files
- Prefer inline code documentation (`@fileoverview`, JSDoc) over separate markdown files

## ROLE

Principal Software Engineer: production code, architecture, reliability, ownership.

## EVOLUTION

If user repeats instruction 2+ times, ask: "Should I add this to CLAUDE.md?"

## 📚 SHARED STANDARDS

**Canonical reference**: `../socket-registry/CLAUDE.md`

All shared standards (git, testing, code style, cross-platform, CI) defined in socket-registry/CLAUDE.md.

**Quick references**:

- Commits: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) `<type>(<scope>): <description>` - NO AI attribution
- Scripts: Prefer `pnpm run foo --flag` over `foo:bar` scripts
- Docs: Use `docs/` folder, lowercase-with-hyphens.md filenames, pithy writing with visuals
- Dependencies: After `package.json` edits, run `pnpm install` to update `pnpm-lock.yaml`
- Backward Compatibility: 🚨 FORBIDDEN to maintain - actively remove when encountered (see canonical CLAUDE.md)
- Work Safeguards: MANDATORY commit + backup branch before bulk changes
- Safe Deletion: Use `safeDelete()` from `@socketsecurity/lib/fs` (NEVER `fs.rm/rmSync` or `rm -rf`)

---

## 📝 EMOJI & OUTPUT STYLE

**Terminal Symbols** (based on `@socketsecurity/lib/logger` LOG_SYMBOLS):

- ✓ Success/checkmark - MUST be green (NOT ✅)
- ✗ Error/failure - MUST be red (NOT ❌)
- ⚠ Warning/caution - MUST be yellow (NOT ⚠️)
- ℹ Info - MUST be blue (NOT ℹ️)
- → Step/progress - MUST be cyan (NOT ➜ or ▶)

**Color Requirements** (apply color to icon ONLY, not entire message):

```javascript
import colors from 'yoctocolors-cjs'
;`${colors.green('✓')} ${msg}` // Success
`${colors.red('✗')} ${msg}` // Error
`${colors.yellow('⚠')} ${msg}` // Warning
`${colors.blue('ℹ')} ${msg}` // Info
`${colors.cyan('→')} ${msg}` // Step/Progress
```

**Color Package**:

- Use `yoctocolors-cjs` (NOT `yoctocolors` ESM package)
- Pinned dev dependency in all Socket projects
- CommonJS compatibility for scripts and tooling

**Allowed Emojis** (use sparingly):

- 📦 Packages
- 💡 Ideas/tips
- 🚀 Launch/deploy/excitement
- 🎉 Major success/celebration

**General Philosophy**:

- Prefer colored text-based symbols (✓✗⚠ℹ→) for maximum terminal compatibility
- Always color-code symbols: green=success, red=error, yellow=warning, blue=info, cyan=step
- Use emojis sparingly for emphasis and delight
- Avoid emoji overload - less is more
- When in doubt, use plain text

---

## 🏗️ LIB-SPECIFIC

### Architecture

Core infrastructure library for Socket.dev security tools.

**Directory structure**:

```
src/
├── index.ts           # Main export barrel
├── types.ts           # TypeScript type definitions
├── constants/         # Node.js, npm, package manager constants
├── env/              # Typed environment variable access
├── packages/         # Package management utilities
├── external/         # Vendored external dependencies
└── utils/            # Shared utilities

dist/                 # Build output (CommonJS)
├── external/         # Bundled external dependencies
└── ...               # Compiled source files

scripts/              # Build and development scripts
test/                 # Test files
```

**Path aliases** (defined in `.config/tsconfig.external-aliases.json`):

```
#constants/* → src/constants/*
#env/*       → src/env/*
#lib/*       → src/*
#packages/*  → src/packages/*
#types       → src/types
#utils/*     → src/utils/*
```

### Commands

- **Build**: `pnpm build` (production build)
- **Watch**: `pnpm run dev` (development mode)
- **Test**: `pnpm test` (run tests)
- **Type check**: `pnpm run check` (TypeScript type checking)
- **Lint**: `pnpm run lint` (oxlint - 50-100x faster than ESLint)
- **Fix**: `pnpm run fix` (auto-fix formatting/lint issues with oxfmt)
- **Coverage**: `pnpm run cover` (test coverage)
- **Clean**: `pnpm run clean` (remove build artifacts)

### Code Quality Tools

#### Linting (oxlint)

- **Tool**: [oxlint](https://oxc.rs) v1.52+ - Rust-based linter (50-100x faster than ESLint)
- **Config**: `.oxlintrc.json` - 167+ rules with file-specific overrides
- **Features**:
  - TypeScript type-aware rules with `--type-aware` flag
  - ESLint plugin compatibility via `jsPlugins` (e.g., `eslint-plugin-sort-destructure-keys`)
  - Inline comments: `// oxlint-disable-next-line rule-name`
  - Categories: correctness, suspicious, pedantic, style, restriction
- **Performance**: ~100ms for full codebase lint

#### Formatting (oxfmt)

- **Tool**: [oxfmt](https://oxc.rs) v0.37+ - Rust-based formatter (3x faster than Biome, 30x faster than Prettier)
- **Config**: `.oxfmtrc.json` - Prettier v3.8 compatible
- **Settings**:
  - Semi: true
  - Single quotes: true
  - Tab width: 2
  - Print width: 80
  - Trailing commas: all
- **Performance**: ~20ms for full codebase format

#### Usage

- `pnpm run lint` - Run oxlint with type-aware rules
- `pnpm run fix` - Run oxfmt to auto-fix formatting
- `scripts/lint.mjs` - Orchestrates both tools with proper error handling

### Build System

#### Compilation

- **Target**: TypeScript → CommonJS (ES2022)
- **Builder**: esbuild via `scripts/build/js.mjs`
- **Type generation**: tsgo (TypeScript Native Preview)
- **Output**: `dist/` directory

#### Build Scripts

All build scripts are Node.js modules (`.mjs`) in `scripts/`:

- `build/js.mjs` - Main JavaScript compilation
- `build/externals.mjs` - External dependency bundling
- `fix/commonjs-exports.mjs` - Post-build CommonJS export fixes
- `fix/external-imports.mjs` - Fix external import patterns
- `fix/generate-package-exports.mjs` - Auto-generate package.json exports

🚨 **FORBIDDEN**: Shell scripts (`.sh`) - Always use Node.js scripts

#### Build Process

The main build command (`pnpm build`) orchestrates via `scripts/build/main.mjs`:

1. Clean previous build
2. Build in parallel: source code, types, and externals
3. Fix exports via `scripts/fix/main.mjs`

Individual commands:

- `pnpm run clean` - Clean build artifacts only
- `pnpm build` - Full build (default)

### Code Style - Lib-Specific

#### File Organization

- **Extensions**: `.ts` for TypeScript, `.d.ts` for type definitions
- **Naming**: kebab-case filenames (e.g., `cache-with-ttl.ts`)
- **Module headers**: 🚨 MANDATORY `@fileoverview` headers
- **Node.js imports**: 🚨 MANDATORY `node:` prefix
- **Semicolons**: ❌ OMIT (consistent with socket-registry)

#### Type Patterns

- **Type safety**: ❌ FORBIDDEN `any`; use `unknown` or specific types
- **Type imports**: Always separate `import type` from runtime imports
- **Null-prototype objects**: Use `{ __proto__: null, ...props }` pattern
- **Options pattern**: `const opts = { __proto__: null, ...options } as SomeOptions`

#### Import Organization

1. Node.js built-ins (with `node:` prefix)
2. External dependencies
3. `@socketsecurity/*` packages
4. Internal path aliases (`#constants/*`, `#env/*`, `#lib/*`, etc.)
5. Type imports (separate)

Blank lines between groups, alphabetical within groups.

#### Path Aliases Usage

- **Internal imports**: Always use path aliases for internal modules
  - ✅ `import { getCI } from '#env/ci'`
  - ❌ `import { getCI } from '../env/ci'`
- **External modules**: Regular imports
  - ✅ `import path from 'node:path'`

#### Export Patterns

- **Named exports ONLY**: 🚨 MANDATORY for all library modules
  - ✅ `export { value }` - Direct named export
  - ✅ `export { foo, bar, baz }` - Multiple named exports
  - ❌ `export default value` - FORBIDDEN (breaks dual CJS/ESM compatibility)
  - ❌ `export default X; export { X as 'module.exports' }` - FORBIDDEN (dual export pattern)
- **Rationale**: Dual-format (CJS/ESM) compatibility requires consistent named exports
  - Named exports work identically in both module systems
  - Default exports require `.default` access, breaking consistency
  - Build validation enforces this pattern (enabled in CI)
- **Enforcement**:
  - Oxlint linting rule: `"no-default-export": "error"`
  - Build-time validation: `scripts/validate/esm-named-exports.mjs`
  - CI validation: `scripts/validate/dist-exports.mjs`

#### Function Organization

- **Alphabetical ordering**: 🚨 MANDATORY for all files with 3+ exported functions
  - **Private functions first**: Non-exported helpers, getters, utilities (alphabetically sorted)
  - **Exported functions second**: All public API functions (alphabetically sorted)
  - **Constants/types before functions**: Interfaces, types, constants at top of file
- **Benefits**:
  - Predictable function location for navigation
  - Reduced merge conflicts when adding new functions
  - Easier code review (spot missing/duplicate exports)
  - Consistent structure across entire codebase
- **Example**:

  ```typescript
  // 1. Imports
  import { foo } from 'bar'

  // 2. Types/Constants
  export interface Options { ... }

  // 3. Private functions (alphabetical)
  function helperA() { ... }
  function helperB() { ... }

  // 4. Exported functions (alphabetical)
  export function publicA() { ... }
  export function publicB() { ... }
  export function publicC() { ... }
  ```

### Package Exports

#### Export Structure

All modules are exported via `package.json` exports field:

- **Constants**: `./constants/<name>` → `dist/constants/<name>.js`
- **Environment**: `./env/<name>` → `dist/env/<name>.js`
- **Libraries**: `./<name>` → `dist/<name>.js`
- **Packages**: `./packages/<name>` → `dist/packages/<name>.js`
- **Types**: `./types` → `dist/types.js`

#### Adding New Exports

When adding new modules, update `package.json` exports:

```json
"./module-name": {
  "types": "./dist/path/to/module.d.ts",
  "default": "./dist/path/to/module.js"
}
```

Or use `scripts/generate-package-exports.mjs` to auto-generate exports.

### Testing

**Vitest Configuration**: This repo uses the shared vitest configuration pattern documented in `../socket-registry/CLAUDE.md` (see "Vitest Configuration Variants" section). Main config: `.config/vitest.config.mts`

#### Test Structure

- **Directories**: `test/` - All test files
- **Naming**: Match source structure (e.g., `test/spinner.test.ts` for `src/spinner.ts`)
- **Framework**: Vitest
- **Coverage**: c8/v8 coverage via Vitest

#### Test Patterns

- Use descriptive test names
- Test both success and error paths
- Mock external dependencies appropriately
- Use path helpers for cross-platform tests

#### Running Tests

- **All tests**: `pnpm test`
- **Specific file**: `pnpm test path/to/file.test.ts`
- **Coverage**: `pnpm run cover`
- **🚨 NEVER USE `--` before test paths** - runs all tests

### External Dependencies

#### Vendored Dependencies

Some dependencies are vendored in `src/external/`:

- Type definitions for external packages
- Optimized versions of dependencies

#### Path Mappings

`tsconfig.json` includes path mappings for vendored deps:

```json
"paths": {
  "cacache": ["./src/external/cacache"],
  "make-fetch-happen": ["./src/external/make-fetch-happen"],
  "fast-sort": ["./src/external/fast-sort"],
  "pacote": ["./src/external/pacote"]
}
```

### CI Integration

#### Optimized CI Pipeline

**Workflow**: `.github/workflows/ci.yml` - Custom optimized pipeline

**Key Optimizations**:

- **Separate lint job**: Runs once (not 6x in matrix) - saves ~10s
- **Build caching**: Build runs once, artifacts cached for all jobs - eliminates 5 rebuilds (~8s saved)
- **Parallel execution**: Lint, build, test, type-check run in parallel where possible
- **Smart dependencies**: Type-check runs after build completes, tests wait for lint + build
- **Matrix strategy**: Tests run on Node 20/22/24 × Ubuntu/Windows (6 combinations)

**Performance**:

- Build time: ~1.6s (esbuild, parallelized)
- Test execution: ~5s (4582 tests, multi-threaded)
- Total CI time: ~40-60% faster than previous setup
- Status check job: Single required check for branch protection

**Job Structure**:

1. **lint** - Runs Biome linting (once, Node 22/Ubuntu)
2. **build** - Compiles source, caches dist + node_modules
3. **test** - Runs test suite on all matrix combinations (uses cached build)
4. **type-check** - TypeScript type checking (uses cached build)
5. **ci-success** - Aggregates all job results for branch protection

**Cache Strategy**:

```yaml
key: build-${{ github.sha }}-${{ runner.os }}
path: |
  dist
  node_modules
```

**Previous Setup** (for reference):

- Used reusable workflow: `SocketDev/socket-registry/.github/workflows/ci.yml@<SHA>`
- 🚨 MANDATORY: Use full commit SHA, not tags
- Format: `@662bbcab1b7533e24ba8e3446cffd8a7e5f7617e # main`

### Development Workflow

#### Before Committing

1. `pnpm run fix` - Auto-fix formatting/lint issues
2. `pnpm run check` - Type check
3. `pnpm test` - Run tests (or `pnpm run cover` for coverage)

#### Watch Mode

Use `pnpm run dev` for development with automatic rebuilds.

#### Adding New Utilities

1. Create utility in appropriate `src/` subdirectory
2. Use path aliases for internal imports
3. Add type definitions
4. Update `package.json` exports if direct export needed
5. Add tests in `test/` matching structure
6. Update types and build

### Common Patterns

#### Environment Variables

Access via typed getter functions in `src/env/`:

```typescript
import { getCI } from '#env/ci'
import { getNodeEnv } from '#env/node-env'
import { isTest } from '#env/test'
```

Each env module exports a pure getter function that accesses only its own environment variable. For fallback logic, compose multiple getters:

```typescript
import { getHome } from '#env/home'
import { getUserprofile } from '#env/windows'

const homeDir = getHome() || getUserprofile() // Cross-platform fallback
```

**Testing with rewiring:**
Environment getters support test rewiring without modifying `process.env`:

```typescript
import { setEnv, clearEnv, resetEnv } from '#env/rewire'
import { getCI } from '#env/ci'

// In test
setEnv('CI', '1')
expect(getCI()).toBe(true)

clearEnv('CI') // Clear single override
resetEnv() // Clear all overrides (use in afterEach)
```

This allows isolated tests without polluting the global process.env state.

#### File System Operations

Use utilities from `#lib/fs`:

```typescript
import { readJsonFile, writeJsonFile } from '#lib/fs'
```

#### Spawning Processes

Use spawn utility from `#lib/spawn`:

```typescript
import { spawn } from '#lib/spawn'
```

#### Path Operations

Use path utilities from `#lib/paths`:

```typescript
import { normalizePath } from '#lib/paths'
```

#### Working Directory

- **🚨 NEVER use `process.chdir()`** - use `{ cwd }` options and absolute paths instead
  - Breaks tests, worker threads, and causes race conditions
  - Always pass `{ cwd: absolutePath }` to spawn/exec/fs operations

### Debugging

#### Common Issues

- **Path alias resolution**: Ensure `tsconfig.json` paths match actual file structure
- **Module resolution**: Use `node:` prefix for Node.js built-ins
- **Build errors**: Check for missing exports in `package.json`
- **Test failures**: Verify path alias resolution in test environment

#### Build Debugging

- Check `dist/` output structure
- Verify CommonJS exports are correctly transformed
- Ensure type definitions are generated

### Notes

- This is a core utilities library - maintain high quality and test coverage
- Breaking changes impact all Socket.dev tools - coordinate carefully
- Cross-platform compatibility is critical
- Performance matters - this code runs frequently in security tools
