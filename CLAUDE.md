# CLAUDE.md

🚨 **MANDATORY**: Act as principal-level engineer with deep expertise in TypeScript, Node.js, and library development.

## 👤 USER CONTEXT

- **Identify users by git credentials**: Extract name from git commit author, GitHub account, or context
- 🚨 **When identity is verified**: ALWAYS use their actual name - NEVER use "the user" or "user"
- **Direct communication**: Use "you/your" when speaking directly to the verified user
- **Discussing their work**: Use their actual name when referencing their commits/contributions
- **Example**: If git shows "John-David Dalton <jdalton@example.com>", refer to them as "John-David"
- **Other contributors**: Use their actual names from commit history/context

## 📚 SHARED STANDARDS

**See canonical reference:** `../socket-registry/CLAUDE.md`

For all shared Socket standards (git workflow, testing, code style, imports, sorting, error handling, cross-platform, CI, etc.), refer to socket-registry/CLAUDE.md.

**Git Workflow Reminder**: When user says "commit changes" → create actual commits, use small atomic commits, follow all CLAUDE.md rules:
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) style: `<type>(<scope>): <description>`
- NO AI attribution in commit messages

**Package.json Scripts**: Prefer `pnpm run foo --<flag>` over multiple `foo:bar` scripts (see socket-registry/CLAUDE.md)

---

## 📝 EMOJI & OUTPUT STYLE

**Terminal Symbols** (based on `@socketsecurity/lib/logger` LOG_SYMBOLS):
- ✓ Success/checkmark - MUST be green (NOT ✅)
- ✗ Error/failure - MUST be red (NOT ❌)
- ⚠ Warning/caution - MUST be yellow (NOT ⚠️)
- ℹ Info - MUST be blue (NOT ℹ️)

**Color Requirements** (apply color to icon ONLY, not entire message):
```javascript
import colors from 'yoctocolors-cjs'

`${colors.green('✓')} ${msg}`   // Success
`${colors.red('✗')} ${msg}`     // Error
`${colors.yellow('⚠')} ${msg}`  // Warning
`${colors.blue('ℹ')} ${msg}`    // Info
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
- Prefer colored text-based symbols (✓✗⚠ℹ) for maximum terminal compatibility
- Always color-code symbols: green=success, red=error, yellow=warning, blue=info
- Use emojis sparingly for emphasis and delight
- Avoid emoji overload - less is more
- When in doubt, use plain text

---

## 🏗️ LIB-SPECIFIC

### Architecture
Socket utilities library - Core infrastructure for Socket.dev security tools

**Core Structure**:
- **Entry**: `src/index.ts` - Main export barrel
- **Constants**: `src/constants/` - Node.js, npm, package manager constants
- **Environment**: `src/env/` - Typed environment variable access
- **Utilities**: `src/lib/` - Core utility functions
- **Types**: `src/types.ts` - TypeScript type definitions
- **External**: `src/external/` - Vendored external dependencies
- **Scripts**: `scripts/` - Build and development scripts

**Path Aliases**:
- `#constants/*` → `src/constants/*`
- `#env/*` → `src/env/*`
- `#lib/*` → `src/lib/*`
- `#packages/*` → `src/lib/packages/*`
- `#types` → `src/types`
- `#utils/*` → `src/utils/*`

**Features**: Type-safe utilities, environment variable helpers, file system operations, package management utilities, path normalization, spawn utilities, CLI effects

### Commands
- **Build**: `pnpm build` (production build)
- **Watch**: `pnpm run build:watch` or `pnpm run dev` (development mode)
- **Test**: `pnpm test` (run tests)
- **Type check**: `pnpm run check` (TypeScript type checking)
- **Lint**: `pnpm run lint` (Biome linting)
- **Fix**: `pnpm run fix` (auto-fix formatting/lint issues)
- **Coverage**: `pnpm run cover` (test coverage)
- **Clean**: `pnpm run clean` (remove build artifacts)

### Build System

#### Compilation
- **Target**: TypeScript → CommonJS (ES2022)
- **Builder**: esbuild via `scripts/build-js.mjs`
- **Type generation**: tsgo (TypeScript Native Preview)
- **Output**: `dist/` directory

#### Build Scripts
All build scripts are Node.js modules (`.mjs`):
- `build-js.mjs` - Main JavaScript compilation
- `build-externals.mjs` - External dependency bundling
- `fix-commonjs-exports.mjs` - Post-build CommonJS export fixes
- `fix-default-imports.mjs` - Fix default import patterns
- `generate-package-exports.mjs` - Auto-generate package.json exports

🚨 **FORBIDDEN**: Shell scripts (`.sh`) - Always use Node.js scripts

#### Build Process
1. Clean previous build: `pnpm run clean`
2. Compile JavaScript: `pnpm run build:js`
3. Generate types: `pnpm run build:types`
4. Bundle externals: `pnpm run build:externals`
5. Fix exports: `pnpm run fix:exports`

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
  - ✅ `import { CI } from '#env/ci'`
  - ❌ `import { CI } from '../env/ci'`
- **External modules**: Regular imports
  - ✅ `import path from 'node:path'`

### Package Exports

#### Export Structure
All modules are exported via `package.json` exports field:
- **Constants**: `./constants/<name>` → `dist/constants/<name>.js`
- **Environment**: `./env/<name>` → `dist/env/<name>.js`
- **Libraries**: `./<name>` → `dist/lib/<name>.js`
- **Packages**: `./packages/<name>` → `dist/lib/packages/<name>.js`
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
- **Workflow**: `.github/workflows/ci.yml`
- **Reusable workflow**: References `SocketDev/socket-registry/.github/workflows/ci.yml@<SHA>`
- **🚨 MANDATORY**: Use full commit SHA, not tags
- **Format**: `@662bbcab1b7533e24ba8e3446cffd8a7e5f7617e # main`

### Development Workflow

#### Before Committing
1. `pnpm run fix` - Auto-fix formatting/lint issues
2. `pnpm run check` - Type check
3. `pnpm test` - Run tests (or `pnpm run cover` for coverage)

#### Watch Mode
Use `pnpm run build:watch` or `pnpm run dev` for development with automatic rebuilds.

#### Adding New Utilities
1. Create utility in appropriate `src/` subdirectory
2. Use path aliases for internal imports
3. Add type definitions
4. Add to `src/index.ts` if public API
5. Update `package.json` exports if direct export needed
6. Add tests in `test/` matching structure
7. Update types and build

### Common Patterns

#### Environment Variables
Access via typed helpers in `src/env/`:
```typescript
import { CI } from '#env/ci'
import { NODE_ENV } from '#env/node-env'
import { getEnv } from '#env/getters'
```

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
