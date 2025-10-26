# Getting Started with Socket Lib Development

Welcome to @socketsecurity/lib! This guide will help you understand, use, and contribute to Socket's core infrastructure library.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/SocketDev/socket-lib.git
cd socket-lib

# Install dependencies
pnpm install

# Build the library
pnpm run build

# Run tests
pnpm test

# Run checks (lint + type check)
pnpm run check
```

You're ready to develop!

## Prerequisites

**Required:**
- **Node.js** 22.0.0 or higher
- **pnpm** 10.16.0 or higher

**Recommended:**
- **Git** 2.0 or higher
- **VSCode** with recommended extensions

**Install pnpm:**
```bash
npm install -g pnpm
# or
brew install pnpm
```

## What is Socket Lib?

@socketsecurity/lib is Socket's **core infrastructure library** providing:

- **183 TypeScript modules** with utilities, constants, and helpers
- **120+ granular exports** for tree-shakeable imports
- **68 typed environment variable getters** for safe env access
- **14 constant modules** (Node.js, npm, platform, packages)
- **Zero dependencies** (except @socketregistry/packageurl-js)
- **Full TypeScript support** with comprehensive type definitions
- **Cross-platform** Windows + POSIX compatibility

**Used by:** socket-sdk-js, socket-registry, socket-cli, and other Socket tools.

## Repository Structure

```
socket-lib/
├── docs/                   # Documentation
│   └── build.md            # Build system architecture
├── src/                    # TypeScript source (183 files, 1.5M)
│   ├── constants/          # 14 constant modules
│   ├── env/                # 68 environment variable getters
│   ├── packages/           # 12 package utilities
│   ├── stdio/              # 9 standard I/O utilities
│   ├── effects/            # 4 CLI visual effects
│   ├── external/           # 40+ vendored dependencies
│   ├── fs.ts               # File system utilities
│   ├── path.ts             # Path utilities
│   ├── git.ts              # Git utilities
│   ├── github.ts           # GitHub utilities
│   ├── logger.ts           # Logging utilities
│   ├── spawn.ts            # Process spawning
│   └── ... 60+ more modules
├── test/                   # Test files (36 tests)
├── dist/                   # Compiled output (6.7M)
├── scripts/                # Build scripts (13 scripts)
├── .config/                # Configuration files
├── plugins/                # Babel & Vitest plugins
├── data/                   # Static data files
├── CLAUDE.md               # Project standards
├── README.md               # Package documentation
└── package.json            # 120+ exports
```

## Development Workflow

### 1. Initial Setup

```bash
# Clone and install
git clone https://github.com/SocketDev/socket-lib.git
cd socket-lib
pnpm install
```

### 2. Build the Library

```bash
# Full build (esbuild + types + externals)
pnpm run build

# Watch mode (development)
pnpm run dev

# Clean build artifacts
pnpm run clean
```

**Build stages:**
1. TypeScript → CommonJS (esbuild)
2. Generate type declarations (tsgo)
3. Bundle external dependencies
4. Apply post-build fixes

See [docs/build.md](./build.md) for detailed architecture.

### 3. Run Tests

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test fs.test.ts

# Run with coverage
pnpm run cover
```

**36 test files covering:**
- File system operations
- Path utilities
- Package parsing
- Environment variables
- HTTP requests
- And more...

### 4. Verify Changes

```bash
# Run all checks (lint + type check)
pnpm run check

# Auto-fix issues
pnpm run fix

# Type check only
pnpm run type
```

### 5. Before Committing

Pre-commit hooks automatically run:
- Linting on staged files
- Type checking
- Affected tests

## Understanding the Library Structure

### Core Modules (Top-Level)

**File Operations:**
- `fs.ts` - File system utilities (read/write/exists/copy)
- `path.ts` - Path utilities (normalize, join, resolve)
- `bin.ts` - Binary/executable detection

**Package Management:**
- `packages/*.ts` - 12 package utilities
- `packages/parse-package-spec.ts` - Parse package specifiers
- `packages/get-package-name.ts` - Extract package names
- `packages/resolve-package.ts` - Resolve package paths

**Environment:**
- `env/*.ts` - 68 typed environment getters
- `env/node-env.ts` - NODE_ENV getter
- `env/ci.ts` - CI environment detection
- `env/debug.ts` - Debug mode

**External Integrations:**
- `git.ts` - Git operations (status, diff, log)
- `github.ts` - GitHub API utilities
- `http-request.ts` - HTTP client
- `spawn.ts` - Process spawning

**Utilities:**
- `logger.ts` - Logging with colors
- `json.ts` - Safe JSON parse/stringify
- `strings.ts` - String manipulation
- `arrays.ts` - Array utilities
- `objects.ts` - Object utilities
- `validation.ts` - Data validation

### Constants (14 Modules)

**Import constants:**
```typescript
// Node.js paths and versions
import { NODE_VERSION, NODE_MODULES } from '@socketsecurity/lib/constants/node'

// Package files
import { PACKAGE_JSON, TSCONFIG_JSON } from '@socketsecurity/lib/constants/packages'

// NPM registry
import { NPM_REGISTRY_URL } from '@socketsecurity/lib/constants/npm'

// Platform detection
import { IS_WINDOWS, IS_MACOS } from '@socketsecurity/lib/constants/platform'
```

### Environment Variables (68 Typed Getters)

**Safe environment access:**
```typescript
import { NODE_ENV } from '@socketsecurity/lib/env/node-env'
import { CI } from '@socketsecurity/lib/env/ci'
import { DEBUG } from '@socketsecurity/lib/env/debug'

// Typed values with proper defaults
console.log(NODE_ENV)  // 'production' | 'development' | 'test'
console.log(CI)        // boolean
console.log(DEBUG)     // boolean | string
```

**Available categories:**
- Node.js environment (`NODE_ENV`, `NODE_OPTIONS`)
- CI detection (GitHub Actions, GitLab, etc.)
- Build tools (Webpack, Vite, Rollup)
- Testing (Vitest, Jest)
- Debugging and profiling

### Standard I/O Utilities (9 Modules)

**CLI output helpers:**
```typescript
import { header, footer } from '@socketsecurity/lib/stdio'
import { progress } from '@socketsecurity/lib/stdio/progress'
import { spinner } from '@socketsecurity/lib/stdio/spinner'

header('Build Process')
const spin = spinner('Building...').start()
// ... build work ...
spin.stop()
footer('Build Complete')
```

### Effects (4 Modules)

**Visual CLI effects:**
```typescript
import { gradient } from '@socketsecurity/lib/effects/gradient'
import { rainbow } from '@socketsecurity/lib/effects/rainbow'

console.log(gradient('Socket Security'))
console.log(rainbow('Build Successful!'))
```

## Common Development Tasks

### Adding a New Utility Module

**1. Create the module** in `src/`:

```typescript
// src/my-utility.ts

/**
 * @fileoverview My utility description.
 */

import { validateInput } from './validation.js'

/**
 * Does something useful.
 *
 * @throws {Error} When input is invalid
 */
export function myUtility(input: string): string {
  validateInput(input)
  return input.toUpperCase()
}
```

**2. Add export to `package.json`:**

```json
{
  "exports": {
    "./my-utility": {
      "types": "./dist/my-utility.d.ts",
      "default": "./dist/my-utility.js"
    }
  }
}
```

**Note:** Exports are auto-generated by `scripts/generate-package-exports.mjs`.

**3. Write tests** in `test/`:

```typescript
// test/my-utility.test.ts

import { describe, it, expect } from 'vitest'
import { myUtility } from '../src/my-utility.ts'

describe('myUtility', () => {
  it('should transform input', () => {
    expect(myUtility('hello')).toBe('HELLO')
  })

  it('should throw on invalid input', () => {
    expect(() => myUtility('')).toThrow('invalid')
  })
})
```

**4. Build and test:**

```bash
pnpm run build
pnpm test my-utility.test.ts
```

### Adding a New Constant

**1. Add to appropriate file** in `src/constants/`:

```typescript
// src/constants/packages.ts

export const MY_CONSTANT = 'my-value' as const
```

**2. Export type if needed:**

```typescript
export type MyConstantType = typeof MY_CONSTANT
```

**3. Update tests:**

```typescript
// test/unit/constants/packages.test.ts

import { MY_CONSTANT } from '../../../src/constants/packages.ts'

it('should export MY_CONSTANT', () => {
  expect(MY_CONSTANT).toBe('my-value')
})
```

### Adding a New Environment Variable Getter

**1. Create getter** in `src/env/`:

```typescript
// src/env/my-env-var.ts

/**
 * @fileoverview MY_ENV_VAR environment variable getter.
 */

/**
 * Get MY_ENV_VAR environment variable.
 */
export const MY_ENV_VAR = process.env.MY_ENV_VAR ?? 'default-value'
```

**2. Add to exports:**

```json
{
  "exports": {
    "./env/my-env-var": {
      "types": "./dist/env/my-env-var.d.ts",
      "default": "./dist/env/my-env-var.js"
    }
  }
}
```

**3. Document usage:**

Update README with example usage.

### Vendoring External Dependencies

**Why vendor?** Some dependencies need modifications or have issues.

**1. Add package to `scripts/build-externals.mjs`:**

```javascript
const EXTERNAL_PACKAGES = [
  'my-package',
  // ... existing packages
]
```

**2. Copy source to `src/external/`:**

```bash
cp -r node_modules/my-package src/external/my-package
```

**3. Modify as needed:**

Edit `src/external/my-package/index.ts` with fixes.

**4. Export from `src/external/index.ts`:**

```typescript
export * from './my-package/index.js'
```

**5. Rebuild externals:**

```bash
pnpm run build
```

## Testing Guide

### Test Structure

```
test/
├── fs.test.ts              # File system utilities
├── path.test.ts            # Path utilities
├── packages.test.ts        # Package utilities
├── http-request.test.ts    # HTTP client
├── spawn.test.ts           # Process spawning
├── git.test.ts             # Git operations
├── bin.test.ts             # Binary detection
├── json.test.ts            # JSON utilities
├── strings.test.ts         # String utilities
└── unit/
    └── constants/          # Constant tests
```

### Test Patterns

**Basic test:**
```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from '../src/my-module.ts'

describe('myFunction', () => {
  it('should work correctly', () => {
    const result = myFunction('input')
    expect(result).toBe('expected')
  })
})
```

**File system test:**
```typescript
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('should read file', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'test-'))
  try {
    // Test with tmpDir...
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})
```

**Environment variable test:**
```typescript
it('should use env variable', () => {
  const original = process.env.MY_VAR
  try {
    process.env.MY_VAR = 'test-value'
    // Test...
  } finally {
    if (original !== undefined) {
      process.env.MY_VAR = original
    } else {
      delete process.env.MY_VAR
    }
  }
})
```

### Running Tests

```bash
# All tests
pnpm test

# Specific test
pnpm test fs.test.ts

# Watch mode
pnpm test --watch

# Coverage
pnpm run cover
```

**Test runner:** Vitest 4.0.3 with threads pool.

## Build System

The build system is multi-stage:

```
TypeScript Source
      ↓
   esbuild (ES2022 → CommonJS)
      ↓
   tsgo (Generate .d.ts files)
      ↓
   Bundle External Dependencies
      ↓
   Post-build Fixes
      ↓
   dist/ Output
```

**Key files:**
- `scripts/build.mjs` - Main orchestrator
- `scripts/build-externals.mjs` - External bundling
- `scripts/fix-commonjs-exports.mjs` - Export fixes
- `scripts/fix-external-imports.mjs` - Import path fixes
- `.config/esbuild.config.mjs` - Build configuration

See [docs/build.md](./build.md) for complete details.

## Code Style

**No semicolons:**
```typescript
const result = myFunction()  // ✓ No semicolon
export { result }            // ✓ No semicolon
```

**Other style rules:**
- `@fileoverview` headers on all files (MANDATORY)
- Type imports: `import type { Foo } from './types.js'`
- Node.js imports: `import path from 'node:path'` (with `node:` prefix)
- Alphabetical sorting (imports, exports, properties)
- No `any` type (use `unknown`)
- `__proto__: null` first in object literals

See [CLAUDE.md](../CLAUDE.md) for complete standards.

## Cross-Platform Compatibility

**CRITICAL:** All code must work on Windows + POSIX.

**Best practices:**
```typescript
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'

// ✓ Use path.join()
const filePath = join('dir', 'file.txt')

// ✗ NEVER hard-code slashes
const filePath = 'dir/file.txt'  // Breaks on Windows

// ✓ Use os.tmpdir()
const tmp = join(tmpdir(), 'my-app')

// ✓ Use path.sep for separator
const parts = filePath.split(sep)
```

**Test on both platforms** when possible.

## Project Standards

**Read CLAUDE.md** - Essential reading! Contains:
- Code style and organization
- Testing requirements
- Cross-platform compatibility (CRITICAL)
- Git workflow
- Documentation standards

**Key highlights:**

**Commit messages:**
```
feat(fs): add readJsonFile utility

- Implement safe JSON file reading
- Add error handling for parse failures
- Include comprehensive tests
```

**Pre-commit hooks:**
- Linting on staged files
- Type checking
- Affected tests

## Troubleshooting

### Build Issues

**Problem:** Build fails with esbuild error

**Solution:**
```bash
pnpm run clean
rm -rf node_modules/.cache dist
pnpm run build
```

**Problem:** External dependencies not bundling

**Solution:**
```bash
# Rebuild externals specifically
node scripts/build-externals.mjs
pnpm run build
```

### Test Issues

**Problem:** Tests fail with module not found

**Solution:**
```bash
# Ensure build is current
pnpm run build
pnpm test
```

**Problem:** File system tests fail on Windows

**Solution:** Use `path.join()` and `path.sep`, never hard-coded paths.

### Type Issues

**Problem:** TypeScript errors after changes

**Solution:**
```bash
pnpm run type  # See specific errors
# Fix type errors
pnpm run check  # Verify all passes
```

### Import/Export Issues

**Problem:** Module not exported

**Solution:**
```bash
# Regenerate exports
node scripts/generate-package-exports.mjs
pnpm run build
```

## Documentation

### Updating Documentation

**Build System** (`docs/build.md`):
- Already comprehensive
- Update when build process changes

**API Documentation** (future):
- Document new modules in README
- Add usage examples
- Include TypeScript types

**Getting Started** (this doc):
- Update when workflow changes
- Add new common tasks
- Keep examples current

## Advanced Topics

### Granular Exports

The library exports **120+ individual modules** for tree-shaking:

```typescript
// ✓ Import only what you need
import { readJsonFile } from '@socketsecurity/lib/fs'

// ✗ Don't import entire library
import * as lib from '@socketsecurity/lib'
```

**Benefits:**
- Smaller bundle sizes
- Faster build times
- Clear dependencies

### Type Definitions

All types are exported:

```typescript
import type {
  PackageJson,
  TsConfig,
  LockFile,
  PurlComponents,
} from '@socketsecurity/lib/types'
```

**Custom types:**
```typescript
export type MyType = {
  field: string
}
```

### Vendored Dependencies

**Why vendor?**
- Critical fixes needed
- Unmaintained packages
- Custom modifications
- Bundle size optimization

**Located in:** `src/external/`

**Current vendored packages:** 40+ including utilities, parsers, and helpers.

## Next Steps

1. **Read the documentation:**
   - [build.md](./build.md) - Build system architecture
   - [CLAUDE.md](../CLAUDE.md) - Project standards
   - [package.json](../package.json) - Explore 120+ exports

2. **Explore the codebase:**
   - `src/` - 183 source modules
   - `src/constants/` - 14 constant modules
   - `src/env/` - 68 environment getters
   - `src/packages/` - 12 package utilities
   - `test/` - 36 test files

3. **Pick a task:**
   - Browse open issues on GitHub
   - Add a new utility
   - Improve documentation
   - Add test coverage
   - Fix a bug

4. **Join the community:**
   - Follow [@SocketSecurity](https://twitter.com/SocketSecurity) on Twitter
   - Follow [@socket.dev](https://bsky.app/profile/socket.dev) on Bluesky

## Quick Reference

### Essential Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm run build` | Full build |
| `pnpm run dev` | Watch mode |
| `pnpm test` | Run tests |
| `pnpm run cover` | Test coverage |
| `pnpm run check` | Lint + type check |
| `pnpm run fix` | Auto-fix issues |
| `pnpm run clean` | Clean artifacts |

### Module Categories

| Category | Count | Location |
|----------|-------|----------|
| Total modules | 183 | `src/` |
| Constants | 14 | `src/constants/` |
| Environment vars | 68 | `src/env/` |
| Package utilities | 12 | `src/packages/` |
| I/O utilities | 9 | `src/stdio/` |
| Visual effects | 4 | `src/effects/` |
| External deps | 40+ | `src/external/` |

### Key Files

| What | Where |
|------|-------|
| File system | `src/fs.ts` |
| Path utilities | `src/path.ts` |
| Package utilities | `src/packages/*.ts` |
| Git operations | `src/git.ts` |
| HTTP client | `src/http-request.ts` |
| Logger | `src/logger.ts` |
| Constants | `src/constants/*.ts` |
| Env getters | `src/env/*.ts` |
| Tests | `test/*.test.ts` |
| Build docs | `docs/build.md` |
| Standards | `CLAUDE.md` |

### Help Resources

- **Main README**: [../README.md](../README.md)
- **Build Architecture**: [build.md](./build.md)
- **Project Standards**: [../CLAUDE.md](../CLAUDE.md)
- **Package Exports**: [../package.json](../package.json)

---

**Welcome to Socket Lib!** We're excited to have you contributing to Socket's core infrastructure.
