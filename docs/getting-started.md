# Getting Started

Developer guide for building and contributing to `@socketsecurity/lib`.

## Quick Reference

| Task | Command | When to Use |
|------|---------|-------------|
| **First time** | `pnpm install` | After cloning repo |
| **Build** | `pnpm run build` | Full production build |
| **Dev mode** | `pnpm run dev` | Auto-rebuild on changes |
| **Run tests** | `pnpm test` | All tests + checks |
| **Fast test** | `pnpm vitest run` | Tests only (~5s) |
| **Single test** | `pnpm vitest run file.test.ts` | One file |
| **Coverage** | `pnpm run cover` | With coverage report |
| **Type check** | `pnpm run check` | TypeScript validation |
| **Lint** | `pnpm run lint` | Check code style |
| **Auto-fix** | `pnpm run fix` | Fix formatting + lint |
| **Clean** | `pnpm run clean` | Remove build artifacts |

## Quick Setup

```bash
git clone https://github.com/SocketDev/socket-lib.git
cd socket-lib
pnpm install
pnpm run build
pnpm test
```

✅ You're ready to develop!

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 22+ | [nodejs.org](https://nodejs.org) |
| **pnpm** | 10.16+ | `npm i -g pnpm` |
| Git | 2.0+ | [git-scm.com](https://git-scm.com) |

---

## Commands

### Build Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `pnpm run build` | Full production build | `dist/` (CommonJS + types) |
| `pnpm run dev` | Watch mode (auto-rebuild) | Continuous `dist/` updates |
| `pnpm run clean` | Remove build artifacts | Deletes `dist/` |

**Build Output:**
```
dist/
├── *.js          → Compiled JavaScript (CommonJS, ES2022)
└── *.d.ts        → TypeScript type definitions
```

### Test Commands

| Command | Speed | Output | Use Case |
|---------|-------|--------|----------|
| `pnpm test` | ~7s | Full suite + checks | Before commit |
| `pnpm vitest run` | ~5s | Tests only | Quick iteration |
| `pnpm run cover` | ~8s | With coverage report | Coverage analysis |
| `pnpm vitest run file.test.ts` | ~1s | Single file | Focused debugging |

**Test Stats:** 4600+ tests · 100 test files · ~5s runtime

### Quality Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `pnpm run check` | TypeScript type checking | After type changes |
| `pnpm run lint` | Biome linting | Check code style |
| `pnpm run fix` | Auto-fix formatting + lint | Before every commit |

---

## Project Structure

```
socket-lib/
├── src/                    # TypeScript source (183 files)
│   ├── constants/          # 14 constant modules (NODE_MODULES, paths, etc.)
│   ├── env/                # 68 environment getters (CI, HOME, PATH, etc.)
│   ├── lib/
│   │   ├── packages/       # 12 package utilities (npm, pnpm, yarn)
│   │   ├── fs/             # File system utilities
│   │   ├── spawn/          # Process spawning
│   │   └── ...             # 60+ utility modules
│   ├── effects/            # 4 CLI visual effects (spinner, shimmer, pulse)
│   ├── stdio/              # 9 standard I/O utilities (logger, prompts)
│   ├── themes/             # Theme system (socket, coana, ultra, etc.)
│   └── external/           # 40+ vendored dependencies
│
├── test/                   # Test files (100 files, 4600+ tests)
│   ├── constants/          # Constant tests
│   ├── env/                # Environment tests
│   ├── packages/           # Package tests
│   └── ...                 # More test files
│
├── dist/                   # Build output (gitignored)
│   ├── *.js                # Compiled JavaScript (CommonJS)
│   └── *.d.ts              # Type definitions
│
├── scripts/                # Build and dev scripts
│   ├── build-js.mjs        # Main JavaScript compilation
│   ├── build-externals.mjs # External dependency bundling
│   └── babel/              # AST transformation scripts
│
├── .config/                # Tool configurations
│   ├── vitest.config.mts   # Test configuration
│   └── biome.json          # Linting + formatting
│
├── docs/                   # Documentation
│   ├── getting-started.md  # ← You are here
│   ├── themes.md           # Theme system guide
│   └── build.md            # Build architecture
│
├── CLAUDE.md               # Coding standards & patterns
├── README.md               # Package overview
└── package.json            # 120+ granular exports
```

---

## Development Workflow

**Visual Flow:**
```
┌──────────────────────────────────────────────────────────────┐
│  1. Edit → 2. Test → 3. Export → 4. Build → 5. Commit       │
│    ↓         ↓          ↓          ↓          ↓             │
│  src/    test/    package.json  dist/    git commit         │
└──────────────────────────────────────────────────────────────┘
```

### 1. Make Changes

Edit TypeScript files in `src/`:

```typescript
// src/my-util.ts
export function myUtil(input: string): string {
  return input.toUpperCase()
}
```

### 2. Add Tests

Create or update test in `test/`:

```typescript
// test/my-util.test.ts
import { myUtil } from '@socketsecurity/lib/my-util'
import { describe, expect, it } from 'vitest'

describe('myUtil', () => {
  it('should uppercase input', () => {
    expect(myUtil('hello')).toBe('HELLO')
  })
})
```

### 3. Export Module

Add to `package.json` exports:

```json
{
  "exports": {
    "./my-util": {
      "types": "./dist/my-util.d.ts",
      "default": "./dist/my-util.js"
    }
  }
}
```

### 4. Build & Test

```bash
pnpm run build    # Compile
pnpm test         # Verify
```

### 5. Before Commit

```bash
pnpm run fix      # Auto-fix issues
pnpm run check    # Type check
pnpm test         # Full test suite
```

---

## Path Aliases

Use path aliases for internal imports (configured in `tsconfig.json`):

**Alias Mapping:**
```
#constants/*  →  src/constants/*   (NODE_MODULES, paths, etc.)
#env/*        →  src/env/*         (CI, HOME, PATH getters)
#lib/*        →  src/lib/*         (Core utilities)
#packages/*   →  src/lib/packages/* (npm, pnpm, yarn utils)
#utils/*      →  src/utils/*       (Shared utilities)
#types        →  src/types         (Type definitions)
```

**Usage Examples:**

| ✅ Use Path Aliases | ❌ Avoid Relative Paths |
|---------------------|-------------------------|
| `import { getCI } from '#env/ci'` | `import { getCI } from '../env/ci'` |
| `import { NODE_MODULES } from '#constants/packages'` | `import { NODE_MODULES } from '../../constants/packages'` |
| `import { spawn } from '#lib/spawn'` | `import { spawn } from '../lib/spawn'` |

**Why Use Aliases?**
- ✅ Cleaner imports
- ✅ Refactor-friendly (no path updates needed)
- ✅ Consistent across codebase
- ✅ Better IDE autocomplete

---

## Build System

Socket Lib uses a custom optimized build pipeline:

```
┌────────────┐       ┌─────────┐       ┌──────────┐       ┌────────────────┐
│ TypeScript │──────→│ esbuild │──────→│ CommonJS │──────→│ Post-Processing│
│   (src/)   │       │         │       │  (dist/) │       │                │
└────────────┘       └─────────┘       └──────────┘       └────────────────┘
                          ↓                                        ↓
                  - Fast compilation                    - Fix CommonJS exports
                  - ES2022 target                       - Bundle externals
                  - Preserve modules                    - Generate types (tsgo)
                  - ~1.6s build time                    - AST transformations
```

**Key Tools:**

| Tool | Purpose | Performance |
|------|---------|-------------|
| **esbuild** | JavaScript compilation | ~1.6s (parallelized) |
| **tsgo** | Type definition generation | TypeScript Native Preview |
| **Babel AST** | Post-build transformations | Export fixes, bundling |

**Build Scripts** (all in `scripts/`):
- `build-js.mjs` — Main JavaScript compilation
- `build-externals.mjs` — External dependency bundling
- `fix-commonjs-exports.mjs` — CommonJS export fixes
- `generate-package-exports.mjs` — Auto-generate exports

👉 See [**Build Architecture**](./build.md) for complete details

---

## Common Tasks

### Adding a New Constant

```bash
# 1. Create constant file
echo "export const MY_CONST = 'value'" > src/constants/my-const.ts

# 2. Add test
cat > test/constants/my-const.test.ts << 'EOF'
import { MY_CONST } from '@socketsecurity/lib/constants/my-const'
import { describe, expect, it } from 'vitest'

describe('MY_CONST', () => {
  it('should have correct value', () => {
    expect(MY_CONST).toBe('value')
  })
})
EOF

# 3. Add export to package.json
# (See package.json exports section)

# 4. Build and test
pnpm run build && pnpm test
```

### Adding an Environment Getter

```bash
# 1. Create env getter
cat > src/env/my-var.ts << 'EOF'
import { getEnv } from './getters'

export function getMyVar(): string | undefined {
  return getEnv('MY_VAR')
}
EOF

# 2. Add test (similar pattern)
# 3. Add export
# 4. Build and test
```

### Adding a Utility Function

See the workflow above — same pattern applies to all modules.

---

## Debugging

### TypeScript Errors

```bash
pnpm run check     # See type errors
```

Common issues:
- Missing path alias in `tsconfig.json`
- Incorrect import paths (use path aliases)
- Missing type exports

### Build Errors

```bash
pnpm run build     # See build output
```

Check:
- `dist/` for generated files
- Console for esbuild errors
- Path aliases match `tsconfig.json`

### Test Failures

```bash
pnpm vitest run failing-test.test.ts --reporter=verbose
```

### Watch Mode

```bash
pnpm run dev       # Auto-rebuild on changes
```

Useful for iterative development.

---

## Best Practices

### Do's

| Practice | Reason | Example |
|----------|--------|---------|
| Use path aliases | Cleaner, refactor-friendly | `import { getCI } from '#env/ci'` |
| Add tests for all code | Maintain 100% coverage | `test/my-util.test.ts` |
| Follow existing patterns | Consistency across codebase | Check similar modules |
| Run `pnpm run fix` before commit | Auto-fix style issues | Before every commit |
| Keep functions small | Easier to test and maintain | Single responsibility |
| Document public APIs | Better DX for consumers | JSDoc comments |

### Don'ts

| Avoid | Why | Alternative |
|-------|-----|-------------|
| `any` type | Loses type safety | Use `unknown` or specific types |
| `process.chdir()` | Breaks tests, race conditions | Use `{ cwd }` options |
| Runtime dependencies | Bloats bundle | Vendor or inline code |
| Skip tests | Breaks CI | Always run `pnpm test` |
| Relative imports | Hard to refactor | Use path aliases |

---

## CI Pipeline

Every push triggers an optimized CI pipeline:

```
┌──────────────────────────────────────────────────────────┐
│                     CI Pipeline Flow                      │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Lint ────┐                                              │
│  (Biome)  │                                              │
│           ↓                                              │
│  Build ───┼────→ Type Check                             │
│  (esbuild)│      (TypeScript)                           │
│   ~1.6s   │                                              │
│           ↓                                              │
│  Test × 6 (Matrix: Node 20/22/24 × Ubuntu/Windows)      │
│   ~5s     ────→ Coverage Report                         │
│                                                           │
│           ↓                                              │
│  CI Success (Required check for merge)                   │
└──────────────────────────────────────────────────────────┘
```

**Matrix Strategy:** Node 20, 22, 24 × Ubuntu, Windows = **6 parallel test jobs**

**Performance:**
- Build: ~1.6s (cached for all jobs)
- Tests: ~5s per job (4600+ tests)
- Total: ~40-60% faster than previous setup

**All checks must pass** before merge to main.

---

## Getting Help

| Resource | Link | Description |
|----------|------|-------------|
| **Issues** | [GitHub Issues](https://github.com/SocketDev/socket-lib/issues) | Bug reports, feature requests |
| **Standards** | [CLAUDE.md](../CLAUDE.md) | Coding standards & patterns |
| **Build** | [build.md](./build.md) | Build system architecture |
| **Themes** | [themes.md](./themes.md) | Theme system guide |

---

## Next Steps

| Step | Resource | What You'll Learn |
|------|----------|-------------------|
| 1 | [CLAUDE.md](../CLAUDE.md) | Coding standards, patterns, best practices |
| 2 | [Theme System](./themes.md) | Visual theming for CLI tools |
| 3 | [Build Architecture](./build.md) | Build pipeline deep dive |
| 4 | [Open Issues](https://github.com/SocketDev/socket-lib/issues) | Ways to contribute |

---

**Happy coding!** 🚀
