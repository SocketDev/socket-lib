# Getting Started

Developer guide for building and contributing to `@socketsecurity/lib`.

## Quick Setup

```bash
git clone https://github.com/SocketDev/socket-lib.git
cd socket-lib
pnpm install
pnpm run build
pnpm test
```

✅ You're ready to develop!

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 22+ | [nodejs.org](https://nodejs.org) |
| **pnpm** | 10.16+ | `npm i -g pnpm` |
| Git | 2.0+ | [git-scm.com](https://git-scm.com) |

## Commands

### Build

```bash
pnpm run build       # Full production build
pnpm run dev         # Watch mode (auto-rebuild)
pnpm run clean       # Remove build artifacts
```

**Build Output:**
- `dist/` — Compiled JavaScript (CommonJS)
- `dist/**/*.d.ts` — Type definitions

### Test

```bash
pnpm test                     # All tests + checks
pnpm vitest run              # Tests only (fast)
pnpm run cover               # With coverage report
pnpm vitest run path.test.ts # Single file
```

**Test Stats:** 4600+ tests · 100 test files · ~5s runtime

### Quality

```bash
pnpm run check       # TypeScript type checking
pnpm run lint        # Biome linting
pnpm run fix         # Auto-fix formatting + lint issues
```

## Project Structure

```
socket-lib/
├── src/                    # TypeScript source (183 files)
│   ├── constants/          # 14 constant modules
│   ├── env/                # 68 environment getters
│   ├── packages/           # 12 package utilities
│   ├── effects/            # 4 CLI visual effects
│   ├── stdio/              # 9 standard I/O utilities
│   ├── themes/             # Theme system
│   ├── external/           # 40+ vendored dependencies
│   └── ... 60+ more
│
├── test/                   # Test files (100 files, 4600+ tests)
│   ├── constants/          # Constant tests
│   ├── env/                # Environment tests
│   ├── packages/           # Package tests
│   └── ... more
│
├── dist/                   # Build output (gitignored)
├── scripts/                # Build and dev scripts
│   └── babel/              # AST transformation scripts
├── .config/                # Tool configurations
├── docs/                   # Documentation
│   ├── getting-started.md  # ← You are here
│   ├── themes.md           # Theme system guide
│   └── build.md            # Build architecture
│
├── CLAUDE.md               # Coding standards & patterns
├── README.md               # Package overview
└── package.json            # 120+ granular exports
```

## Development Workflow

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

## Path Aliases

Use path aliases for internal imports:

```typescript
// ✅ Correct
import { getCI } from '#env/ci'
import { NODE_MODULES } from '#constants/packages'

// ❌ Wrong
import { getCI } from '../env/ci'
import { NODE_MODULES } from '../../constants/packages'
```

**Available Aliases:**
- `#constants/*` → `src/constants/*`
- `#env/*` → `src/env/*`
- `#lib/*` → `src/lib/*`
- `#packages/*` → `src/lib/packages/*`
- `#utils/*` → `src/utils/*`
- `#types` → `src/types`

## Build System

Socket Lib uses a custom build pipeline:

```
TypeScript → esbuild → CommonJS → Post-Processing
   (src/)      |         (dist/)         |
               ↓                          ↓
         - Fast compilation      - Fix CommonJS exports
         - ES2022 target         - Bundle externals
         - Preserve modules      - Generate types
```

**Key Tools:**
- **esbuild** — Fast JavaScript compilation
- **tsgo** — Type definition generation (TypeScript Native Preview)
- **Babel AST** — Post-build transformations

👉 See [**Build Architecture**](./build.md) for details

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

## Best Practices

✅ **Do:**
- Use path aliases for internal imports
- Add tests for all new code
- Follow existing code patterns
- Run `pnpm run fix` before committing
- Keep functions small and focused
- Document public APIs with JSDoc

❌ **Don't:**
- Use `any` type (use `unknown` or specific types)
- Use `process.chdir()` (use `{ cwd }` options)
- Add runtime dependencies without approval
- Skip tests or type checking
- Use relative imports for internal modules

## CI Pipeline

Every push runs:

```
┌─────────────────────────────────────┐
│  Lint → Build → Test × 6 → Success │
└─────────────────────────────────────┘
         ↓       ↓                ↓
      Biome   esbuild    Node 20/22/24
                         × Ubuntu/Windows
```

**Matrix:** Node 20, 22, 24 × Ubuntu, Windows = 6 jobs

All must pass before merge.

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/SocketDev/socket-lib/issues)
- **Standards:** See [CLAUDE.md](../CLAUDE.md)
- **Build:** See [build.md](./build.md)
- **Themes:** See [themes.md](./themes.md)

## Next Steps

- 📖 Read [CLAUDE.md](../CLAUDE.md) for coding standards
- 🎨 Explore [Theme System](./themes.md)
- 🏗️ Learn [Build Architecture](./build.md)
- 🐛 Check [open issues](https://github.com/SocketDev/socket-lib/issues)

---

**Happy coding!** 🚀
